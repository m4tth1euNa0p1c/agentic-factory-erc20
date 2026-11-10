# Runbook — sandbox

Prérequis : Docker, bash (Git Bash sous Windows), openssl, node, python. Aucun secret à saisir.

```bash
scripts/bootstrap-env.sh                           # une fois : clés, keystores, mots de passe, genèse (gitignored)
scripts/sandbox.sh up                              # Besu, Web3Signer, PostgreSQL, Kafka + contrôles
scripts/deploy-contracts.sh                        # TCE/TCD/TIF/Swap signés par Web3Signer, ABI exportées
docker compose --profile app up -d --build --wait  # indexer, backend, adapter, frontend
```
| Service | URL |
|---|---|
| UI opérateur | http://localhost:4200 |
| API | http://localhost:8080/api/v1 |
| RPC Besu | http://localhost:8545 (chainId 48151) |

## Tester à la main
Émetteurs possibles : **Alice** et **Bob** uniquement. Montants en unités minimales (6 décimales).
```bash
curl -H 'content-type: application/json' -H "Idempotency-Key: test-$(date +%s)" \
  -d '{"from":"<alice>","to":"<bob>","token":"TCE","amount":"1000000"}' http://localhost:8080/api/v1/transfers
curl http://localhost:8080/api/v1/operations/<id>/transitions
curl http://localhost:8080/api/v1/accounts/<adresse>/balances
curl http://localhost:8080/api/v1/system/indexer-status
```
À essayer : rejouer la même `Idempotency-Key` (même opération, pas de 2e débit) ; dépasser le disponible (409).

## Scénarios et campagnes
```bash
tests/e2e/run.sh 001-contracts | nominal | restart-after-broadcast | ponder-lag | failure-vs-unknown
tests/e2e/campaigns/sc003-latency.sh 60 3
tests/e2e/campaigns/sc004-concurrency.sh 1000 100
```
Chaque exécution écrit `evidence/<spec>/<scénario>/runs/<RUN_ID>/`.

## Diagnostics
| Besoin | Commande |
|---|---|
| état | `scripts/sandbox.sh check` / `docker compose --profile app ps` |
| logs | `docker compose --profile app logs --tail=100 adapter` |
| SQL lecture seule | `scripts/db-read.sh "select * from tela_read.chain_head"` |
| validations humaines en attente | `scripts/human-gates.sh` |

## Reset
`scripts/sandbox.sh reset` efface chaîne et bases (clés conservées). `scripts/bootstrap-env.sh --force` régénère tout (nouvelles adresses).

## Injection de pannes (jamais en production)
`ADAPTER_FAULT=crash-after-broadcast | crash-before-broadcast | pause-before-broadcast | pause-after-broadcast | crash-random` (+ `ADAPTER_FAULT_PAUSE_MS`, `ADAPTER_SUPERVISE`).
