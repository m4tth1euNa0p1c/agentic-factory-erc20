# Tasks: Sandbox TELA et jetons de base

**Input**: `specs/001-sandbox-foundation/` · Format : `- [ ] T### [P?] [US?] [agent] Description (fichiers)`

## Phase 1: Setup
- [x] T001 [network-devops] Bootstrap des secrets et identifiants (`scripts/bootstrap-env.sh`, `scripts/lib.sh`)
- [x] T002 [network-devops] Genèse QBFT templatisée (`infra/besu/genesis.template.json`)

## Phase 2: User Story 1 — Sandbox en une commande (P1)
- [x] T003 [US1] [network-devops] `compose.yaml` Besu/Web3Signer/Postgres/Kafka + réseaux isolés
- [x] T004 [US1] [network-devops] Rôles PostgreSQL moindre privilège (`infra/postgres/init/01-roles.sh`)
- [x] T005 [US1] [network-devops] `scripts/sandbox.sh up|down|reset|check`
- [ ] T006 [US1] [verifier] Preuve `evidence/001/sandbox-check.txt` sur sandbox vierge (reset → up → check)

## Phase 3: User Story 2 — Jetons (P1)
- [ ] T007 [US2] [smart-contracts] Tests d'abord : `contracts/test/TelaToken.t.sol` (scénarios 1–5, fuzz, invariant référence)
- [ ] T008 [US2] [smart-contracts] `contracts/src/TelaToken.sol` (ERC20, AccessControl, Pausable, transferWithReference)
- [ ] T009 [P] [US2] [smart-contracts] Squelette `contracts/src/TalanFixedRateSwap.sol` (constructeur, rôles, taux ; logique en 003)
- [ ] T010 [US2] [smart-contracts] `contracts/script/Deploy.s.sol` + `scripts/deploy-contracts.sh` (Web3Signer, `deployments/local.json`, adresses dans `.env`)
- [ ] T011 [US2] [smart-contracts] Export ABI `contracts/abi/*.json`
- [ ] T012 [US2] [verifier] Preuve déploiement + `transferWithReference` rejoué on-chain (`evidence/001/contracts/`)

## Phase 4: User Story 3 — CI sécurité (P2)
- [ ] T013 [US3] [network-devops] `.github/workflows/ci.yml` : forge test, Slither, Gitleaks, Trivy config, tests hooks (actions épinglées par SHA)
- [ ] T014 [P] [US3] [network-devops] `.github/dependabot.yml` (actions, npm, maven, docker)
- [ ] T015 [US3] [security-auditor] Revue guidance-mode de 001 (skill security-audit + smart-contract-security) → commentaire PR

## Dependencies
T001→T003→T005→T006 ; T007→T008→T010→T011→T012 ; T013 après T008 ; T015 après T012/T013.
