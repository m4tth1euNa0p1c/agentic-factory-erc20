# Data model — 002

## Statuts (D-06)
```
RECEIVED ─► PUBLISHED ─► BROADCAST ─► CONFIRMED ─► SETTLED
   │            │            │  ▲          
   │            │            ▼  │          
   │            │          UNKNOWN ──► (CONFIRMED | FAILED)
   │            ├─► REJECTED (simulation revert / message invalide)
   │            └─► CONFIRMED (ReferenceAlreadyUsed + log d'origine trouvé)
   └─► (409/400 : jamais créée)
BROADCAST|UNKNOWN ─► FAILED (receipt.status = 0)
```
Terminaux : `SETTLED`, `FAILED`, `REJECTED`. Réservation `HELD` jusqu'à un terminal.
Rang (pour transitions hors ordre) : RECEIVED 0 < PUBLISHED 1 < BROADCAST 2 < UNKNOWN 3 < CONFIRMED 4 < SETTLED 5 ; FAILED/REJECTED terminaux (rang 9). Une transition n'est appliquée que si rang(cible) > rang(courant) et la paire est autorisée.

## backend (schema `backend`)
| table | colonnes |
|---|---|
| `operation` | `operation_id uuid pk`, `idempotency_key text unique`, `type text`, `from_address char(42)`, `to_address char(42)`, `token text`, `amount numeric(78,0) >0`, `reference char(66)`, `status text`, `tx_hash char(66)`, `block_number bigint`, `failure_reason text`, `created_at`, `updated_at`, `version int` |
| `operation_transition` | `id bigserial`, `operation_id`, `from_status`, `to_status`, `source text`, `at timestamptz` (audit) |
| `reservation` | `operation_id pk fk`, `account char(42)`, `token text`, `amount numeric(78,0)`, `state HELD/RELEASED`, `released_at` |
| `account_lock` | `account char(42)`, `token text`, pk(account, token) — ligne verrouillée `FOR UPDATE` |
| `outbox` | `id bigserial`, `topic`, `msg_key`, `payload jsonb`, `created_at`, `published_at null` |
| `processed_result` | `operation_id`, `status`, pk(operation_id,status) — idempotence consommateur |

Disponible(account, token) = `tela_read.account_balance.balance` − Σ `reservation.amount` (HELD, account, token).

## adapter (db `tela_adapter`)
| table | colonnes |
|---|---|
| `tx_attempt` | `operation_id uuid pk`, `from_address`, `nonce bigint`, `raw_tx text`, `tx_hash char(66) unique`, `state SIGNED/BROADCAST/FINAL`, `final_status`, `created_at`, `updated_at` ; unique(from_address, nonce) |

## ponder (schema `ponder_tela`, vues `tela_read`)
| table | colonnes |
|---|---|
| `account_balance` | `id = token:account`, `token`, `account`, `balance bigint(numeric)`, `last_block` |
| `operation_execution` | `reference pk`, `token`, `from`, `to`, `amount`, `tx_hash`, `block_number`, `log_index` |
| `chain_head` | `id='head'`, `block_number`, `timestamp` (fraîcheur) |
