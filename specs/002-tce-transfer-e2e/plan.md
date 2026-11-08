# Implementation Plan: Transfert TCE de bout en bout

**Branch**: `002-tce-transfer-e2e` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md) | **Data model**: [data-model.md](./data-model.md)

## Summary
Java (Spring Boot 4.1, Java 25) reçoit la demande, réserve sous verrou, écrit l'opération + l'outbox ; un relai publie sur Kafka. L'adaptateur (Node 24, viem) signe via Web3Signer, persiste la tx signée, diffuse sur Besu, suit le reçu et publie les résultats. Ponder indexe les événements ; Java passe `CONFIRMED → SETTLED` quand la référence est indexée, et libère la réservation.

## Technical Context
**Languages**: Java 25, TypeScript 5 (Node 24) · **Dependencies**: Spring Boot 4.1.2 (web, jdbc, kafka, actuator, validation), Flyway, viem 2.57, @confluentinc/kafka-javascript 1.11, pg, zod, Ponder 0.18.6 · **Storage**: PostgreSQL 18 (`tela.backend`, `tela.ponder_tela`/`tela_read`, `tela_adapter`) · **Testing**: JUnit 5 + Testcontainers, vitest, `tests/e2e/run.sh` (bash + curl + cast) · **Performance**: p95 < 10 s jusqu'à CONFIRMED.

## Constitution Check
| Principe | Statut |
|---|---|
| I | ✅ chaque scénario écrit `evidence/002/<scenario>/evidence.json` |
| II | ✅ H-01, H-03, H-08 |
| III | ✅ `schemas/kafka/*.v1.json`, `schemas/openapi/tela-api.v1.yaml` figés avant implémentation (T001–T003) |
| IV | ✅ triple garde : Idempotency-Key HTTP, tx signée persistée, référence on-chain |
| V | ✅ backend en lecture seule sur `tela_read`, adaptateur seul sur `signing` |
| VI | ✅ tests rouges écrits avant code (T010, T020, T030) |
| VII | ✅ pas de saga générique ; un seul type d'opération (TRANSFER) |

## Architecture & flux
```
POST /transfers ─► [backend] tx{ lock(account,token); check available; insert operation, reservation, outbox }
                    outbox relay ─► kafka tela.operations.commands.v1 (key=from)
[adapter] consume ─► attempt? ─no─► simulate ─► nonce ─► web3signer eth_signTransaction
                                   ─► INSERT tx_attempt(rawTx,hash) ─► besu eth_sendRawTransaction
           ─► publish BROADCAST ─► wait receipt(timeout) ─► publish CONFIRMED|FAILED|UNKNOWN ─► commit offset
[ponder] TransferWithReference ─► tela_read.operation_execution
[backend] results consumer: apply transition (idempotent)
          settlement poller: CONFIRMED ∧ indexed(reference) ⇒ SETTLED + release reservation
          reconciler: UNKNOWN/BROADCAST stale ⇒ ask adapter (command RECONCILE) 
```

## Project Structure
```
schemas/kafka/{operation-command,operation-result}.v1.json   schemas/openapi/tela-api.v1.yaml
backend/  (Maven, com.talan.tela)  src/main/java/.../{api,operation,reservation,outbox,kafka,balance,settlement}
          src/main/resources/db/migration/V1__operations.sql
adapter/  src/{config,kafka,signer,chain,journal,processor,fault,main}.ts  test/*.test.ts  migrations/001_tx_attempt.sql
indexer/  ponder.config.ts ponder.schema.ts src/index.ts
tests/e2e/run.sh  tests/e2e/scenarios/{nominal,restart-after-broadcast,ponder-lag,failure-vs-unknown}.sh
```

## Key decisions
- Réconciliation `UNKNOWN` réalisée par l'adaptateur (seul à connaître rawTx/hash) sur commande `RECONCILE` (même topic, `type`), pour garder Java hors du RPC.
- `nonce = max(eth_getTransactionCount(from,'pending'), max(journal.nonce)+1)` ; partition par `from` ⇒ un seul écrivain par compte.
- Simulation (`eth_call`) avant signature : revert `ReferenceAlreadyUsed` ⇒ recherche du log d'origine ; autre revert ⇒ `REJECTED`.

## Complexity Tracking
| Écart | Pourquoi | Alternative rejetée |
|---|---|---|
| Outbox + relai | Pas de perte DB→Kafka | Publication directe après commit (perte si crash) |
| Journal adaptateur séparé | Rediffusion identique | Se fier au seul nonce on-chain (ne donne pas le hash) |
