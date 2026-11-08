# Feature Specification: Transfert TCE de bout en bout et reprise après incident

**Feature Branch**: `002-tce-transfer-e2e`
**Created**: 2026-11-08
**Status**: Ready
**Input**: « Faire fonctionner un transfert TCE sur tout le parcours, puis démontrer que l'opération métier, la transaction blockchain, la réservation et le solde affiché restent cohérents, y compris après un incident. » Registre : F-01, F-02, F-05, F-06, H-01, H-03, H-08, D-02…D-08, D-10.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Transfert nominal (Priority: P1)

Alice demande le transfert de 10 TCE à Bob via l'API. La demande est enregistrée, transmise, exécutée, et le résultat est restitué ; le montant en attente disparaît quand Ponder a intégré le mouvement.

**Why this priority**: c'est le parcours qui traverse toutes les briques (F-01, F-02, F-05).

**Independent Test**: `tests/e2e/run.sh nominal` → statut `SETTLED`, txHash présent, `balanceOf(bob)` +10, solde indexé = balanceOf, pending = 0.

**Acceptance Scenarios**:
1. **Given** Alice a 100 TCE indexés et 0 en attente, **When** `POST /api/v1/transfers {from: alice, to: bob, token: TCE, amount: "10000000"}` avec `Idempotency-Key`, **Then** réponse `202` avec `operationId` et statut `RECEIVED` ; disponible d'Alice = 90 immédiatement.
2. **Given** l'opération publiée, **When** l'adaptateur l'exécute, **Then** le statut passe par `PUBLISHED → BROADCAST (txHash) → CONFIRMED (bloc)`.
3. **Given** l'opération `CONFIRMED`, **When** Ponder a indexé le bloc, **Then** statut `SETTLED`, pending d'Alice = 0, solde indexé = 90, disponible = 90 (aucun double comptage transitoire).
4. **Given** la même `Idempotency-Key` renvoyée, **When** on rejoue la requête, **Then** même `operationId`, aucune seconde opération.
5. **Given** un disponible de 5 TCE, **When** Alice demande 10 TCE, **Then** `409 INSUFFICIENT_AVAILABLE`, rien n'est publié.

---

### User Story 2 — Redémarrage de l'adaptateur après émission (Priority: P1)

L'adaptateur s'arrête après avoir diffusé la transaction mais avant d'avoir confirmé son traitement (offset non commité). À la reprise, la commande est retraitée **sans second débit**.

**Why this priority**: Kafka ne garantit pas un effet unique dans un système externe ; c'est le risque principal de double débit.

**Independent Test**: `tests/e2e/run.sh restart-after-broadcast` (adaptateur lancé avec `ADAPTER_FAULT=crash-after-broadcast`, puis relancé sans faute).

**Acceptance Scenarios**:
1. **Given** l'adaptateur crashe juste après `eth_sendRawTransaction`, **When** il redémarre et relit la commande, **Then** il retrouve la tentative persistée, rediffuse la **même** transaction signée (même hash) ou constate qu'elle est minée, et publie un unique résultat `CONFIRMED`.
2. **Given** le scénario précédent terminé, **Then** `balanceOf(alice)` a diminué d'exactement 10 TCE, un seul événement `TransferWithReference(ref)` existe, et Java a une seule transition vers `CONFIRMED`.
3. **Given** une tentative persistée perdue (base adaptateur effacée), **When** la commande est retraitée, **Then** la simulation revert avec `ReferenceAlreadyUsed`, aucune nouvelle transaction n'est diffusée, l'adaptateur retrouve l'événement `TransferWithReference(ref)` d'origine (`eth_getLogs` filtré sur la référence) et publie `CONFIRMED` avec le txHash d'origine (garde D-03) — jamais un second débit.

---

### User Story 3 — Retard de Ponder avec demandes concurrentes (Priority: P2)

L'indexeur est arrêté ; plusieurs demandes arrivent en parallèle sur le compte d'Alice. Le disponible reste cohérent puis l'état converge après la reprise.

**Why this priority**: valide la règle F-06 sous concurrence et retard de lecture.

**Independent Test**: `tests/e2e/run.sh ponder-lag` (stop indexer, 20 demandes concurrentes de 10 TCE pour 100 TCE disponibles, restart indexer).

**Acceptance Scenarios**:
1. **Given** Ponder arrêté et 100 TCE disponibles, **When** 20 demandes de 10 TCE arrivent simultanément, **Then** exactement 10 sont acceptées (`202`), 10 refusées (`409`), disponible = 0, jamais négatif.
2. **Given** les 10 transferts `CONFIRMED` pendant que Ponder est arrêté, **Then** les opérations restent `CONFIRMED` (pas `SETTLED`), pending = 100, solde indexé = 100 (périmé), disponible = 0.
3. **Given** Ponder redémarré, **When** il rattrape, **Then** toutes les opérations passent `SETTLED`, solde indexé = 0 = balanceOf, pending = 0.

---

### User Story 4 — Échec certain vs résultat inconnu (Priority: P2)

Le système distingue une transaction dont l'échec est confirmé d'une transaction dont le résultat est inconnu (RPC indisponible), et ne libère la réservation que dans le premier cas.

**Why this priority**: libérer sur un résultat inconnu permettrait un double débit.

**Independent Test**: `tests/e2e/run.sh failure-vs-unknown`.

**Acceptance Scenarios**:
1. **Given** une transaction qui revert on-chain (jeton en pause après diffusion), **When** le reçu `status=0` est obtenu, **Then** statut `FAILED` avec raison, réservation libérée.
2. **Given** un transfert dont la simulation revert avant diffusion pour une raison autre que `ReferenceAlreadyUsed` (ex. solde on-chain insuffisant, jeton en pause), **Then** statut `REJECTED`, aucune transaction diffusée, réservation libérée. *(`ReferenceAlreadyUsed` n'est jamais un rejet : l'effet a eu lieu, cf. US2-3.)*
3. **Given** Besu injoignable après diffusion (réseau `chain` coupé pour l'adaptateur), **When** le délai de reçu expire, **Then** statut `UNKNOWN`, réservation **conservée**.
4. **Given** une opération `UNKNOWN`, **When** Besu redevient joignable, **Then** le réconciliateur retrouve le reçu et l'opération converge vers `CONFIRMED`/`SETTLED` ou `FAILED`.

### Edge Cases
- Message Kafka invalide (schéma) → DLQ `tela.operations.dlq.v1`, opération `REJECTED` côté Java si identifiable, aucun effet on-chain.
- Doublon de résultat (même operationId+status) → ignoré idempotemment par Java.
- Résultat hors ordre (`CONFIRMED` reçu avant `BROADCAST`) → Java applique la transition la plus avancée valide.
- Réorganisation de chaîne : impossible en QBFT (finalité immédiate) — hypothèse documentée.
- Montant non entier / négatif / zéro → `400`.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: Java DOIT générer un `operationId` UUIDv7 ; référence on-chain = `keccak256(operationId)` (D-02).
- **FR-002**: Java DOIT contrôler `disponible = soldeIndexé − pendingSortant ≥ montant` et créer la réservation dans la même transaction, sous verrou par (compte, jeton).
- **FR-003**: Java DOIT publier la commande via une outbox transactionnelle (D-08) sur `tela.operations.commands.v1`, clé = adresse émettrice (D-05).
- **FR-004**: L'adaptateur DOIT persister `(operationId, from, nonce, rawTx, txHash)` avant diffusion et rediffuser la même transaction à la reprise (D-04).
- **FR-005**: L'adaptateur DOIT signer via `eth_signTransaction` de Web3Signer, `chainId` explicite, `to` ∈ liste blanche des jetons.
- **FR-006**: L'adaptateur DOIT publier sur `tela.operations.results.v1` les statuts `BROADCAST`, `CONFIRMED`, `FAILED`, `REJECTED`, `UNKNOWN`.
- **FR-007**: Java DOIT passer une opération `CONFIRMED` à `SETTLED` uniquement quand `tela_read.operation_execution` contient la référence (Ponder), et libérer la réservation dans la même transaction.
- **FR-008**: Une réservation NE DOIT être libérée qu'à `SETTLED`, `FAILED` ou `REJECTED` (D-07).
- **FR-009**: Un réconciliateur DOIT réinterroger les opérations `UNKNOWN`/`BROADCAST` anciennes (reçu par hash, puis événement par référence).
- **FR-010**: Ponder DOIT indexer `Transfer` et `TransferWithReference` des 3 jetons et exposer `tela_read.account_balance` et `tela_read.operation_execution`.
- **FR-011**: L'API DOIT exposer `GET /api/v1/operations/{id}` et `GET /api/v1/accounts/{address}/balances` (indexé, pending, disponible par jeton).
- **FR-012**: Chaque scénario e2e DOIT produire `evidence/002/<scenario>/evidence.json`.

### Key Entities
- **Operation** : operationId, type (TRANSFER), from, to, token, amount (unités min., entier), status, txHash, blockNumber, failureReason, idempotencyKey, timestamps.
- **Reservation** : operationId, account, token, amount, state (HELD/RELEASED).
- **TxAttempt** (adaptateur) : operationId, from, nonce, rawTx, txHash, state.
- **IndexedBalance / OperationExecution** (Ponder).

## Success Criteria *(mandatory)*
- **SC-001**: Les 4 scénarios passent 10 exécutions consécutives sans échec (déterminisme).
- **SC-002**: 0 double débit sur 100 crashs injectés aléatoirement entre signature et commit.
- **SC-003**: Latence demande → `CONFIRMED` < 10 s p95 en sandbox (bloc 2 s).
- **SC-004**: Disponible jamais négatif sur 1 000 demandes concurrentes.

## Assumptions
- H-01, H-03, H-08 ; finalité immédiate QBFT ; un compte = un signataire Web3Signer.
- Authentification de l'API hors périmètre v0 (spec ultérieure) : l'appelant est supposé autorisé pour `from`.
