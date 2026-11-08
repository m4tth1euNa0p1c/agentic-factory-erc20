# Tasks: Transfert TCE de bout en bout

**Input**: `specs/002-tce-transfer-e2e/` · Prérequis : 001 terminé (ABI, adresses, sandbox).

## Phase 1: Contrats partagés (bloquant, orchestrateur)
- [x] T001 [orchestrator] `schemas/kafka/operation-command.v1.json`, `operation-result.v1.json`
- [x] T002 [orchestrator] `schemas/openapi/tela-api.v1.yaml`
- [x] T003 [orchestrator] `data-model.md` (statuts, rangs, tables)

## Phase 2: Fondations
- [ ] T004 [P] [network-devops] Services `backend`, `adapter`, `indexer` dans `compose.yaml` (profil `app`), réseaux selon la matrice
- [ ] T005 [P] [indexer] Squelette Ponder (`indexer/`), schéma `account_balance`, `operation_execution`, `chain_head`, vues `tela_read`
- [ ] T006 [P] [blockchain-adapter] Squelette adaptateur (`adapter/`), config zod, journal `tx_attempt` (migration)
- [ ] T007 [P] [backend-java] Squelette Spring Boot (`backend/`), Flyway `V1__operations.sql`, `scripts/mvn.sh`
- [ ] T008 [verifier] Harnais `tests/e2e/run.sh` + helpers (cast via conteneur, curl API, collecte evidence.json)

## Phase 3: US1 — Transfert nominal (P1) 🎯 MVP
- [ ] T010 [US1] [verifier] Scénario rouge `tests/e2e/scenarios/nominal.sh`
- [ ] T011 [US1] [backend-java] `POST /transfers` : validation, Idempotency-Key, verrou, disponible, réservation, outbox (tests concurrence)
- [ ] T012 [US1] [backend-java] Relai outbox → Kafka (clé = from)
- [ ] T013 [US1] [blockchain-adapter] Processor : simulate → nonce → sign (Web3Signer) → persist → broadcast → receipt → publish
- [ ] T014 [US1] [indexer] Handlers `Transfer` + `TransferWithReference` ; test soldes vs balanceOf
- [ ] T015 [US1] [backend-java] Consommateur résultats idempotent + machine à états (rangs)
- [ ] T016 [US1] [backend-java] Settlement : CONFIRMED ∧ référence indexée ⇒ SETTLED + libération ; `GET /balances`
- [ ] T017 [US1] [verifier] Preuve `evidence/002/nominal/`

## Phase 4: US2 — Redémarrage après émission (P1)
- [ ] T020 [US2] [verifier] Scénario rouge `restart-after-broadcast.sh` (+ variante journal effacé)
- [ ] T021 [US2] [blockchain-adapter] Reprise : tentative existante ⇒ rediffusion rawTx / reçu par hash
- [ ] T022 [US2] [blockchain-adapter] `ReferenceAlreadyUsed` en simulation ⇒ recherche du log d'origine ⇒ CONFIRMED
- [ ] T023 [US2] [blockchain-adapter] Injection `ADAPTER_FAULT=crash-after-broadcast` (refusée en production)
- [ ] T024 [US2] [verifier] Preuve `evidence/002/restart-after-broadcast/` (1 seul débit, 1 seul événement)

## Phase 5: US3 — Retard Ponder + concurrence (P2)
- [ ] T030 [US3] [verifier] Scénario rouge `ponder-lag.sh` (20 demandes concurrentes)
- [ ] T031 [US3] [backend-java] Test de charge concurrente (Testcontainers) : disponible jamais négatif
- [ ] T032 [US3] [verifier] Preuve `evidence/002/ponder-lag/`

## Phase 6: US4 — Échec certain vs inconnu (P2)
- [ ] T040 [US4] [verifier] Scénario rouge `failure-vs-unknown.sh` (pause jeton, coupure réseau `chain`)
- [ ] T041 [US4] [blockchain-adapter] Classification FAILED/REJECTED/UNKNOWN + timeout reçu configurable
- [ ] T042 [US4] [blockchain-adapter] Commande `RECONCILE` : reçu par hash puis log par référence
- [ ] T043 [US4] [backend-java] Réconciliateur planifié (UNKNOWN/BROADCAST > N s ⇒ RECONCILE)
- [ ] T044 [US4] [verifier] Preuve `evidence/002/failure-vs-unknown/`

## Phase 7: Polish
- [ ] T050 [security-auditor] Revue security-audit (guidance) : adapter, backend API, Kafka, rôles PG
- [ ] T051 [verifier] SC-001 : 10 exécutions consécutives des 4 scénarios
- [ ] T052 [orchestrator] Mise à jour registre (PREUVES) + wiki

## Dependencies
Phase 1 → Phase 2 → US1 → (US2 ∥ US3 ∥ US4) → Polish. T004 dépend de 001/T010.
