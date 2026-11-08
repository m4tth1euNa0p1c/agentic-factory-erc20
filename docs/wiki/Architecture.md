# Architecture

```
Écriture : Angular ─► Java (Spring Boot 4.1, Java 25) ─► Kafka 4.4 ─► Adaptateur (Node 24 + viem) ─► Web3Signer 26.10 ─► Besu 26.11 (QBFT)
Lecture  : Besu ─► Ponder 0.18 ─► PostgreSQL 18 (vues tela_read) ─► Java ─► Angular
```

## Flux d'une opération
1. `POST /api/v1/transfers` (Idempotency-Key) → verrou (compte, jeton) → `disponible = indexé − réservé ≥ montant` → opération `RECEIVED` + réservation + outbox (une transaction).
2. Relai outbox → `tela.operations.commands.v1` (clé = adresse émettrice : un écrivain par compte → nonces ordonnés).
3. Adaptateur : simulation → nonce → `eth_signTransaction` (Web3Signer) → **journal (rawTx, hash) avant diffusion** → `eth_sendRawTransaction` → reçu → résultat.
4. Résultats `BROADCAST / CONFIRMED / FAILED / REJECTED / UNKNOWN` → Java (idempotent, tolérant au désordre).
5. Ponder indexe `TransferWithReference` → Java passe `SETTLED` et libère la réservation.

## Garanties d'effet unique (Constitution §IV)
| Couche | Mécanisme |
|---|---|
| HTTP | Idempotency-Key (rejouée → même opération ; corps différent → 409) |
| Kafka → adaptateur | journal `tx_attempt` : jamais deux signatures pour un operationId |
| Chaîne | `transferWithReference` : référence `keccak256(operationId)` consommable une fois **par émetteur** |
| Lecture | `SETTLED` uniquement sur événement indexé avec `to`/`amount` identiques |

## Statuts
`RECEIVED → PUBLISHED → BROADCAST → CONFIRMED → SETTLED` ; terminaux `FAILED` (receipt 0), `REJECTED` (revert déterministe avant diffusion) ; `UNKNOWN` (RPC indisponible / timeout) **conserve la réservation** et déclenche une réconciliation.

## Réseaux Docker
| Réseau | Membres |
|---|---|
| `chain` | besu, adapter, indexer |
| `signing` (internal) | web3signer, besu, adapter, déployeur ponctuel |
| `data` | postgres, backend, indexer, adapter |
| `bus` | kafka, backend, adapter |

Ports hôte (127.0.0.1 uniquement) : Besu 8545 (ETH,NET,WEB3), PostgreSQL 5432, API 8080. Web3Signer et Kafka ne sont pas publiés.
