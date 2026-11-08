# Runbook — sandbox

Prérequis : Docker, bash (Git Bash sous Windows), openssl, node, python. Aucun secret à saisir.

```bash
scripts/bootstrap-env.sh                     # une fois : clés, keystores, mots de passe, genèse (gitignored)
scripts/sandbox.sh up                        # Besu, Web3Signer, PostgreSQL, Kafka + 16 contrôles
scripts/deploy-contracts.sh                  # TCE/TCD/TIF/Swap signés par Web3Signer, ABI exportées
docker compose --profile app up -d --build --wait   # backend, adapter, indexer
```

## Scénarios
```bash
tests/e2e/run.sh 001-contracts
tests/e2e/run.sh nominal
tests/e2e/run.sh restart-after-broadcast
tests/e2e/run.sh ponder-lag
tests/e2e/run.sh failure-vs-unknown
```
Chaque scénario écrit `evidence/<spec>/<scénario>/evidence.json` (+ `steps.log`).

## Diagnostics
| Besoin | Commande |
|---|---|
| état | `scripts/sandbox.sh check` / `docker compose --profile app ps` |
| logs | `docker compose --profile app logs --tail=100 adapter` |
| lecture SQL (rôle backend, lecture seule) | `scripts/db-read.sh "select * from tela_read.chain_head"` |
| API | `curl 127.0.0.1:8080/api/v1/accounts/<addr>/balances` |

## Reset
`scripts/sandbox.sh reset` efface la chaîne et les bases (les clés restent ; mêmes adresses de contrats au redéploiement). `scripts/bootstrap-env.sh --force` régénère tout.

## Injection de pannes (jamais en production)
`ADAPTER_FAULT=crash-after-broadcast | crash-before-broadcast | pause-before-broadcast` (+ `ADAPTER_FAULT_PAUSE_MS`).
