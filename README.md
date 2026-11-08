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
| `.claude/agents/` | 9 agents de la factory | orchestrator |
| `.claude/skills/` | Spec Kit, `security-audit` (Cloudflare, vendorisé), `smart-contract-security`, `factory-run` | — |
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

## Documents clés
- [Veille & versions](docs/research/veille-2026-11.md) · [Registre](docs/registry/REGISTRE.md) · [Constitution](.specify/memory/constitution.md) · [Balayage des specs](specs/ANALYSIS.md) · [Actions humaines](docs/HUMAN-ACTIONS.md)
