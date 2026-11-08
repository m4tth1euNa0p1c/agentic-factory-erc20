# Registre des faits, hypothèses, décisions et preuves

> Règle (Constitution §II) : toute affirmation sur TELA est classée ici. Les specs citent les IDs.
> Une HYPOTHÈSE est levée (→ FAIT ou remplacée) dès que les sources TELA réelles sont disponibles.

## FAITS documentés (source : diapositives 3 à 8 de la présentation TELA)

| ID | Fait | Source |
|---|---|---|
| F-01 | Chaîne d'écriture : Angular → Java → Kafka → adaptateur TypeScript/Viem → Web3Signer → Besu | Diapo chaîne applicative |
| F-02 | Chaîne de lecture : Besu → Ponder → PostgreSQL Ponder → Java → Angular | Diapo chaîne de lecture |
| F-03 | Actifs : TCE, TCD, TIF et un contrat d'échange à taux fixe `TalanFixedRateSwap` | Diapo actifs |
| F-04 | Taux d'échange annoncé : 1 TCE = 1,15 TCD | Diapo actifs |
| F-05 | Modèle d'exécution : demande enregistrée → transmise → exécutée → résultat restitué | Diapo exécution |
| F-06 | Le disponible tient compte du solde indexé et des montants en attente | Diapo règle métier |
| F-07 | Livraison : versions identifiables, déploiements scriptés, scénarios rejouables | Diapo livraison |

## HYPOTHÈSES (à confirmer avec le code TELA réel)

| ID | Hypothèse | Impact si fausse | Spec |
|---|---|---|---|
| H-01 | Une demande = un seul transfert (pas de lot) | Modèle d'opération, contrat | 002 |
| H-02 | TCE/TCD/TIF sont des ERC-20 à **6 décimales** | Arrondis du swap, affichage | 001, 003 |
| H-03 | Modèle custodial : chaque utilisateur a un compte blockchain dont la clé est détenue par Web3Signer ; l'adaptateur signe `from = compte utilisateur` | Droits de signature, nonce | 002 |
| H-04 | Réseau privé à coût de gas nul (`zeroBaseFee`, `min-gas-price=0`) | Financement en ETH des comptes | 001 |
| H-05 | Le swap est alimenté en TCD par un compte trésorerie (liquidité pré-déposée) | Contrat swap | 003 |
| H-06 | Arrondi du swap à l'inférieur, en faveur du pool | Contrat swap | 003 |
| H-07 | TIF = jeton de part de fonds avec émission/rachat par un rôle opérateur | Spec TIF | 004 |
| H-08 | Java lit les soldes dans les tables Ponder (lecture seule, schéma dédié) | Couplage Java/Ponder | 002 |
| H-09 | L'émission (mint) est réservée à un rôle `MINTER` (trésorerie) | Contrats | 001 |

## DÉCISIONS proposées

| ID | Décision | Justification | Date |
|---|---|---|---|
| D-01 | QBFT mono-validateur en dev, 4 validateurs en option | Clique supprimé dans Besu 26.4 ; QBFT recommandé | 2026-11-08 |
| D-02 | Chaque opération porte un `operationId` UUIDv7 généré par Java ; `bytes32` on-chain = keccak256(operationId) | Idempotence de bout en bout | 2026-11-08 |
| D-03 | Fonction `transferWithReference(to, amount, ref)` qui rejette une référence déjà utilisée | Garde sur chaîne contre le double débit | 2026-11-08 |
| D-04 | L'adaptateur utilise `eth_signTransaction` (Web3Signer) puis `eth_sendRawTransaction` (Besu), et persiste la tx signée avant diffusion | Rediffusion identique après crash | 2026-11-08 |
| D-05 | Clé de partition Kafka = adresse du compte émetteur | Ordonnancement des nonces par compte | 2026-11-08 |
| D-06 | Statuts : `RECEIVED → PUBLISHED → BROADCAST → CONFIRMED → SETTLED`, terminaux `FAILED`, `REJECTED` ; état d'attente `UNKNOWN` | Distinction échec certain / résultat inconnu | 2026-11-08 |
| D-07 | Réservation libérée à `SETTLED` (Ponder a indexé le bloc) ou à `FAILED`/`REJECTED` ; jamais à `UNKNOWN` | Disponible cohérent (F-06) | 2026-11-08 |
| D-08 | Outbox transactionnelle côté Java pour publier vers Kafka | Pas de perte entre DB et Kafka | 2026-11-08 |
| D-09 | Monorepo, un dossier par composant, sandbox Docker Compose | Reproductibilité (F-07) | 2026-11-08 |
| D-11 | EVM `cancun` (genèse `cancunTime: 0`) : OZ 5.6 utilise `mcopy` | Constat de compilation | 2026-11-08 |
| D-12 | Références d'opération **scopées par émetteur** (`mapping(sender => ref => used)`) | Revue sécurité M-4 : empêche le squatting d'une référence par un tiers | 2026-11-08 |
| D-13 | Kafka non publié sur l'hôte ; Web3Signer uniquement sur `signing` ; Besu sans QBFT/TXPOOL | Revue sécurité M-3, F-1 | 2026-11-08 |
| D-14 | Règlement `SETTLED` sur preuve indexée (event + to/amount identiques), quel que soit le statut non terminal | Robustesse si le résultat de l'adaptateur est perdu ou retardé | 2026-11-08 |
| D-15 | Injection de panne `pause-before-broadcast` (fenêtre signature→diffusion) pour tests FAILED/UNKNOWN déterministes | Reproductibilité US4 | 2026-11-08 |
| D-10 | Client Kafka JS : `@confluentinc/kafka-javascript` | `kafkajs` non maintenu | 2026-11-08 |

## PREUVES d'exécution

| ID | Preuve | Fichier | Commit |
|---|---|---|---|
| P-01 | Sandbox vierge : QBFT produit des blocs, 5 clés Web3Signer, rôles PG, 3 topics, admin API refusée, Web3Signer non publié (16/16 OK, incl. QBFT/TXPOOL désactivés, Web3Signer injoignable depuis `chain`, Kafka non publié) | `evidence/001/sandbox-check.txt` | 001 |
| P-02 | Contrats : 16 tests (unit, fuzz 512, invariants 64×32, anti-squatting M-4) verts ; couverture lignes 100 % | `evidence/001/forge-test.txt`, `evidence/001/coverage.txt` | 001 |
| P-03 | Slither 0.11.6 : 0 finding (Low→High) sur TelaToken et TalanFixedRateSwap | `evidence/001/slither/` | 001 |
| P-04 | On-chain : `transferWithReference` débite une fois, rejeu refusé (`ReferenceAlreadyUsed`) avant diffusion, 1 seul événement | `evidence/001/contracts/evidence.json` | 001 |
| P-05 | Déploiement signé exclusivement par Web3Signer (`forge script --unlocked`, aucune clé exportée) | `scripts/deploy-contracts.sh` | 001 |
| P-06 | Adaptateur (29 tests unitaires) : nominal, crash avant/après diffusion, journal perdu, conflit de référence, FAILED/REJECTED/UNKNOWN, RECONCILE | `adapter/test/` | 002 |
| P-07 | Adaptateur live : crash réel après diffusion (`ADAPTER_FAULT`) → redémarrage → 1 signature, 1 débit, 1 txHash ; rejeu d'une commande exécutée sans effet | `evidence/002/adapter/evidence.json` | 002 |
| P-08 | Backend (13 tests, Testcontainers PG 18.4 + Kafka 4.4) : 20 requêtes concurrentes → exactement 10 réservées ; résultats idempotents et hors ordre ; UNKNOWN conserve la réservation | `backend/src/test/` | 002 |
| P-09 | E2E nominal : RECEIVED>PUBLISHED>BROADCAST>CONFIRMED>SETTLED, 1 débit, indexé = balanceOf, pending 0, Idempotency-Key, 409, 400 | `evidence/002/nominal/evidence.json` | 002 |
| P-10 | E2E crash après diffusion (stack complète) : 1 signature, 1 débit, 1 événement, reprise du journal | `evidence/002/restart-after-broadcast/evidence.json` | 002 |
| P-11 | E2E Ponder arrêté + 20 demandes concurrentes : 10 acceptées, disponible jamais négatif, CONFIRMED tant que l'index est périmé, convergence SETTLED | `evidence/002/ponder-lag/evidence.json` | 002 |
| P-12 | E2E échec vs inconnu : revert miné → FAILED (receipt 0) ; pause → REJECTED sans diffusion ; Besu coupé → UNKNOWN (réservation conservée) → RECONCILE → SETTLED | `evidence/002/failure-vs-unknown/evidence.json` | 002 |
