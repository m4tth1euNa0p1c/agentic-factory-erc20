# TELA Agentic Factory (ERC-20 bridge)

Reproduction de l'infrastructure **TELA** par une *agentic factory* spécialisée, en Spec-Driven Development (GitHub Spec Kit) et sécurité par défaut (skill Cloudflare `security-audit`).

```
Écriture : Angular ─► Java (Spring Boot) ─► Kafka ─► Adaptateur TS/Viem ─► Web3Signer ─► Besu (QBFT)
Lecture  : Besu ─► Ponder ─► PostgreSQL ─► Java ─► Angular
Actifs   : TCE · TCD · TIF · TalanFixedRateSwap (1 TCE = 1,15 TCD)
```

## Démarrage
```bash
scripts/bootstrap-env.sh     # génère clés (keystores Web3Signer), mots de passe, genèse QBFT → .env + infra/.secrets (gitignored)
scripts/sandbox.sh up        # Besu, Web3Signer, PostgreSQL, Kafka + checks
scripts/deploy-contracts.sh  # TCE/TCD/TIF/Swap signés via Web3Signer
```
Prérequis : Docker, bash (Git Bash sous Windows), openssl. Aucun outil blockchain local requis (Foundry/Maven en conteneurs).

## Arborescence
| Dossier | Contenu | Agent |
|---|---|---|
| `.claude/agents/` | 10 agents, dont `experiment-designer` | orchestrator |
| `.claude/skills/` | Spec Kit, sécurité, `factory-run`, `design-experiment`, `evaluate-experiment` | — |
| `.claude/hooks/` | Garde-fous (secrets, force-push) + tests | — |
| `.specify/` | Constitution, templates Spec Kit | orchestrator |
| `specs/` | 000 factory · 001 sandbox · 002 transfert E2E · 003 swap · 004 TIF · 005 UI | orchestrator |
| `schemas/` | OpenAPI, JSON Schema Kafka (contrats partagés) | orchestrator |
| `infra/`, `compose.yaml`, `scripts/` | Sandbox Docker | network-devops |
| `contracts/` | Solidity / Foundry | smart-contracts |
| `backend/` | Java 25 / Spring Boot 4.1 | backend-java |
| `adapter/` | Node 24 / viem | blockchain-adapter |
| `indexer/` | Ponder 0.18 | indexer |
| `frontend/` | Angular 22 | frontend |
| `tests/e2e/`, `evidence/` | Scénarios rejouables et preuves | verifier |
| `docs/` | Veille, registre F/H/D/P, ADR, actions humaines | orchestrator |
| `experiments/`, `schemas/factory/` | Protocoles à six rubriques, critères et budgets; rapports distincts des hypothèses | experiment-designer / verifier |

## Documents clés
- [Veille & versions](docs/research/veille-2026-11.md) · [Registre](docs/registry/REGISTRE.md) · [Constitution](.specify/memory/constitution.md) · [Balayage des specs](specs/ANALYSIS.md) · [Actions humaines](docs/HUMAN-ACTIONS.md)

## Expériences bornées

Chaque essai précise **Problème → Hypothèse → Référence → Critère → Budget → Décision**.
Le designer prépare, les spécialistes réalisent, le verifier mesure et l'orchestrateur décide
GO/MODIFY/STOP/INCONCLUSIVE. Le contrôle local vérifie les données et preuves soumises; il ne
certifie pas une mesure et ne plafonne pas la facturation d'un fournisseur.

```bash
node scripts/experiment-gate.mjs validate experiments/EXP-002-validation.json
node --test scripts/experiment-gate.test.mjs
```

La fiche 002 est un protocole DRAFT, sans résultats inventés; elle ne clôture pas les validations
encore ouvertes. Voir [la gouvernance des expériences](specs/007-experiment-governance/spec.md).
