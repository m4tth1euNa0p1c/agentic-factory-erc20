# Matrice de validation — spec 002

> Règle (Constitution §I, amendée 1.1.0) : **chaque** exigence fonctionnelle (FR) **et chaque critère de succès (SC)** est relié à une tâche, un test exécutable et une preuve par exécution (`evidence/002/<scénario|campagne>/runs/<RUN_ID>/`, avec `run.json` : SHA, configuration, images). Une ligne sans preuve PASS rattachée à un SHA = critère **non démontré**.
> Statut mis à jour par l'agent `verifier` ; « LATEST » = `evidence/002/<x>/LATEST`.

## Critères de succès

| ID | Critère | Tâche | Test | Preuve | Statut |
|---|---|---|---|---|---|
| SC-001 | Les 4 scénarios passent 10 fois consécutivement | T051 | `tests/e2e/campaigns/sc001-repeat.sh 10` | `evidence/002/campaign-sc001/runs/20261108T172015Z-24324/` | **PASS 40/40** (10 × 4 scénarios) |
| SC-002 | 0 double débit sur ≥ 100 crashs réels aléatoires entre signature et commit | T054 | `tests/e2e/campaigns/sc002-random-crashes.sh 100` (+ `adapter/test/crash-random.test.ts`, 200 ops) | `evidence/002/campaign-sc002/runs/20261108T170453Z-20051/` | **PASS** : 119 crashs réels (5 points), 120 ops, 0 double débit |
| SC-003 | Demande → `CONFIRMED` (ou `SETTLED` direct, D-14) < 10 s au p95 | T055 | `tests/e2e/campaigns/sc003-latency.sh 60 3` | `evidence/002/campaign-sc003/runs/20261108T170050Z-18974/` | **PASS** : p50 1,23 s, p95 2,22 s (60 ops, 1 req/3 s, blocs 2 s) ; débit limité → #26 |
| SC-004 | Disponible jamais négatif sur 1 000 demandes concurrentes | T056 | `tests/e2e/campaigns/sc004-concurrency.sh 1000 100` (+ `sc004_thousandConcurrentRequests` Java) | `evidence/002/campaign-sc004/runs/20261108T165652Z-17196/` | **PASS** : 1000 req., 100/900, disponible brut min = 0 |

**Version validée : `7d4a02d`** — images reconstruites depuis ce SHA avant les campagnes (digests dans chaque `run.json`).
Note : `run.json` indique `dirty: true` pour SC-001/002/003 ; la seule différence avec `7d4a02d` était les pointeurs `evidence/*/LATEST` écrits par les campagnes précédentes (vérifié : 0 fichier hors `evidence/` modifié). Le calcul `dirty` exclut désormais `evidence/`.

**Statut spec 002 : tous les critères de succès SC-001…SC-004 sont démontrés sur une même version.**

## Exigences fonctionnelles

| ID | Test(s) | Preuve |
|---|---|---|
| FR-001 operationId UUIDv7, ref = keccak | `DomainTest`, `abi.test.ts`, `processor.test.ts` (INVALID_REFERENCE) | CI |
| FR-002 disponible sous verrou, snapshot unique | `us3_concurrentRequestsNeverOverReserve`, `sc004_thousandConcurrentRequests`, `noTransientDoubleCountBetweenIndexingAndSettlement` ; e2e `ponder-lag` (échantillonnage continu) | CI + `ponder-lag` |
| FR-003 outbox, clé = from | `us1_receivedThenPublishedWithOutboxKeyedByFrom` | CI |
| FR-004 journal avant diffusion, rediffusion identique | `processor.test.ts` US2, `crash-random.test.ts` ; e2e `restart-after-broadcast`, `002-adapter` | e2e |
| FR-005 eth_signTransaction, chainId, `to` en liste blanche, comptes signables | `processor.test.ts` (allowlist) ; revue #18 | CI |
| FR-006 statuts publiés | `processor.test.ts` | CI |
| FR-007 SETTLED sur preuve indexée | `us1_settlementOnlyWhenIndexed…`, `settlementRequiresMatchingParameters` ; e2e `nominal` | e2e |
| FR-008 libération seulement à SETTLED/FAILED/REJECTED | `us4_unknownKeepsReservation…` ; e2e `failure-vs-unknown` C et D | e2e |
| FR-009 réconciliation (backoff, plafond) | `us4_…` (RECONCILE) ; e2e `failure-vs-unknown` C, D | e2e |
| FR-010 indexation Ponder | e2e `nominal` (indexé = balanceOf) | e2e |
| FR-011 API opérations / soldes | e2e `nominal` | e2e |
| FR-012 preuve par scénario | `tests/e2e/lib.sh` `evidence_init` (dossier par exécution + `run.json`) | toutes |

## Scénarios d'acceptation → tests e2e

| Scénario | Script | Assertions clés |
|---|---|---|
| US1-1…5 | `nominal.sh` | 202/200/409/400, cycle, indexé = balanceOf, pending → 0 |
| US2-1…3 | `restart-after-broadcast.sh`, `002-adapter.sh` | crash réel, 1 signature, 1 événement, 1 débit |
| US3-1…3 | `ponder-lag.sh` | 10/10, **disponible brut ≥ 0 échantillonné pendant le retard et le rattrapage**, convergence |
| US4-1 FAILED | `failure-vs-unknown.sh` A | receipt 0, réservation libérée |
| US4-2 REJECTED | `failure-vs-unknown.sh` B | rien diffusé |
| US4-3/4 UNKNOWN **avant** diffusion | `failure-vs-unknown.sh` C | réservation conservée, RECONCILE → SETTLED |
| US4-5 UNKNOWN **après acceptation** par Besu | `failure-vs-unknown.sh` D | tx exécutée on-chain sans que l'app le sache, réservation conservée, aucun second effet |
