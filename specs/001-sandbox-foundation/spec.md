# Feature Specification: Sandbox TELA et jetons de base

**Feature Branch**: `001-sandbox-foundation`
**Created**: 2026-11-08
**Status**: Ready
**Input**: « Construire un sandbox reproduisant l'architecture TELA (Besu, Web3Signer, Kafka, PostgreSQL) et déployer les jetons TCE, TCD, TIF avec des scripts rejouables. » Registre : F-01, F-02, F-03, F-07, H-02, H-04, H-09, D-01, D-03, D-09.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Démarrer le sandbox en une commande (Priority: P1)

Un développeur (ou un agent) clone le dépôt et démarre un réseau privé complet sans aucune saisie manuelle de secret.

**Why this priority**: tous les autres parcours dépendent d'un environnement reproductible (F-07).

**Independent Test**: `scripts/bootstrap-env.sh && scripts/sandbox.sh up && scripts/sandbox.sh check` sur une machine vierge ne renvoie que des `OK`.

**Acceptance Scenarios**:
1. **Given** un clone propre et Docker démarré, **When** on lance `scripts/sandbox.sh up`, **Then** Besu produit des blocs (QBFT), Web3Signer expose les 5 comptes générés, PostgreSQL contient les rôles `tela_backend`, `tela_ponder`, `tela_adapter`, Kafka contient les 3 topics `tela.operations.*.v1`.
2. **Given** le sandbox démarré, **When** on interroge `admin_peers` sur Besu, **Then** la méthode est refusée.
3. **Given** le sandbox démarré, **When** on appelle `http://127.0.0.1:9000` depuis l'hôte, **Then** la connexion échoue (Web3Signer non publié).
4. **Given** un sandbox existant, **When** on lance `scripts/sandbox.sh reset && scripts/sandbox.sh up`, **Then** la chaîne repart du bloc 0 avec les mêmes adresses.

---

### User Story 2 — Jetons TCE, TCD, TIF déployés et rejouables (Priority: P1)

La trésorerie dispose de jetons TCE, TCD et TIF déployés par script ; un transfert peut porter une référence d'opération qui ne peut être exécutée qu'une fois.

**Why this priority**: la garde sur chaîne contre le double débit (D-03) est requise par le parcours 002.

**Independent Test**: `scripts/forge.sh test` passe ; `scripts/deploy-contracts.sh` écrit `deployments/local.json` et les adresses dans `.env` ; `eth_getCode` non vide pour chaque adresse.

**Acceptance Scenarios**:
1. **Given** un sandbox vierge, **When** on lance `scripts/deploy-contracts.sh`, **Then** TCE, TCD, TIF (6 décimales, H-02) et `TalanFixedRateSwap` sont déployés, la trésorerie a le rôle `MINTER_ROLE` et Alice reçoit 1 000 000,000000 TCE de test.
2. **Given** Alice possède 100 TCE, **When** elle appelle `transferWithReference(bob, 10, ref)`, **Then** Bob reçoit 10 TCE et l'événement `TransferWithReference(ref, alice, bob, 10)` est émis.
3. **Given** `ref` déjà exécutée, **When** on rappelle `transferWithReference(..., ref)`, **Then** la transaction échoue avec `ReferenceAlreadyUsed(ref)` et aucun solde ne change.
4. **Given** un compte sans `MINTER_ROLE`, **When** il appelle `mint`, **Then** la transaction échoue.
5. **Given** le contrat en pause, **When** un transfert est tenté, **Then** il échoue.

---

### User Story 3 — Chaîne de contrôle sécurité et CI (Priority: P2)

Chaque PR exécute build, tests, analyse statique et détection de secrets avant fusion.

**Why this priority**: condition de la Constitution §V, mais n'empêche pas de développer localement.

**Independent Test**: une PR de test contenant une fausse clé privée est bloquée par Gitleaks ; une PR propre est verte.

**Acceptance Scenarios**:
1. **Given** une PR modifiant `contracts/`, **When** la CI tourne, **Then** `forge test` et Slither s'exécutent et publient leurs résultats.
2. **Given** une PR contenant un secret, **When** la CI tourne, **Then** le job `gitleaks` échoue.
3. **Given** une PR modifiant `compose.yaml`, **When** la CI tourne, **Then** Trivy (config) s'exécute.

### Edge Cases
- Docker non démarré → message d'erreur explicite, aucun fichier partiel.
- `.env` déjà présent → bootstrap ne régénère rien sans `--force` (sinon perte des clés).
- Port 8545/5432/29092 occupé sur l'hôte → échec explicite de `sandbox.sh up`.
- Clé de nœud Besu invalide (probabilité négligeable) → bootstrap échoue, relance.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: Le sandbox DOIT démarrer Besu 26.11.0 en QBFT mono-validateur (D-01), chain id 48151, sans frais de gas (H-04).
- **FR-002**: Toutes les clés de signature DOIVENT être générées localement, chiffrées (keystore V3) et chargées uniquement par Web3Signer.
- **FR-003**: Aucun port ne DOIT être publié ailleurs que sur `127.0.0.1` ; Web3Signer NE DOIT PAS être publié.
- **FR-004**: Besu NE DOIT exposer que `ETH,NET,WEB3,TXPOOL,QBFT`.
- **FR-005**: PostgreSQL DOIT séparer les rôles backend / ponder / adapter (moindre privilège).
- **FR-006**: Les jetons DOIVENT être ERC-20 (6 décimales), `AccessControl`, `Pausable`, avec `mint` réservé à `MINTER_ROLE` (H-09).
- **FR-007**: Les jetons DOIVENT exposer `transferWithReference(address to, uint256 amount, bytes32 reference)` qui rejette une référence déjà utilisée **par le même émetteur** (D-03, revue M-4 : pas de squatting par un tiers) et `isReferenceUsed(address sender, bytes32 ref)`.
- **FR-008**: Le déploiement DOIT être scripté, signé via Web3Signer (aucune clé hors Web3Signer) et produire `deployments/local.json`.
- **FR-009**: Les ABI DOIVENT être exportées dans `contracts/abi/`.
- **FR-010**: La CI DOIT exécuter forge test, Slither, Gitleaks, Trivy config et les tests des hooks de la factory.

### Key Entities
- **Compte** : adresse, rôle (deployer, treasury, operator, utilisateur), clé détenue par Web3Signer.
- **Jeton** : symbole (TCE/TCD/TIF), adresse, décimales, rôles.
- **Référence d'opération** : `bytes32`, consommée au plus une fois par jeton.

## Success Criteria *(mandatory)*
- **SC-001**: Démarrage complet en moins de 3 minutes (images en cache) sur une machine de dev.
- **SC-002**: 100 % des checks `sandbox.sh check` au vert, sorties archivées dans `evidence/001/`.
- **SC-003**: Couverture des tests contrats ≥ 95 % des lignes.
- **SC-004**: 0 finding Slither High/Medium non justifié ; 0 secret détecté.

## Assumptions
- H-02 (6 décimales), H-04 (gas nul), H-09 (rôle MINTER) — à confirmer avec les sources TELA.
- `TalanFixedRateSwap` est seulement déployé ici ; sa logique est spécifiée en 003.
