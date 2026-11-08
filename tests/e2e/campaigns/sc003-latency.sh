#!/usr/bin/env bash
# SC-003: request -> CONFIRMED in < 10 s at p95 (sandbox, QBFT 2 s blocks). Measured from the server-side
# transition log (RECEIVED.at -> first CONFIRMED|SETTLED.at, since CONFIRMED may be skipped, D-14).
# Paced load (one request every PACE s) — throughput limits are reported separately, not hidden in the p95.
. "$(dirname "$0")/lib.sh"
N="${1:-60}"; PACE="${2:-3}"
evidence_init "002/campaign-sc003"
fail=0
app_up none; wait_indexer_caught_up 90
ids=""
for i in $(seq 1 "$N"); do
  read -r code body <<<"$(post_transfer "sc003-$i-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" 1000000)"
  [[ "$code" == 202 ]] && ids="$ids $(printf '%s' "$body" | jget '["operationId"]')"
  sleep "$PACE"
done
read -r s f r o <<<"$(wait_all_terminal 600 $ids)"
in="'$(printf '%s' "${ids# }" | sed "s/ /','/g")'"
stats=$("$ROOT/scripts/db-read.sh" "with t as (
   select o.operation_id,
          extract(epoch from (min(tr.at) filter (where tr.to_status in ('CONFIRMED','SETTLED')) - min(tr.at) filter (where tr.to_status='RECEIVED'))) as s
   from backend.operation o join backend.operation_transition tr using (operation_id)
   where o.operation_id in ($in) group by o.operation_id)
 select count(*), round(percentile_cont(0.5) within group (order by s)::numeric,2), round(percentile_cont(0.95) within group (order by s)::numeric,2), round(max(s)::numeric,2) from t" | tr -d '\r')
IFS='|' read -r n p50 p95 pmax <<<"$stats"
step "latency over $n ops (1 req / ${PACE}s): p50=${p50}s p95=${p95}s max=${pmax}s"
assert_eq "$s" "$N" "all operations SETTLED" || fail=1
assert_eq "$(python -c "print(1 if $p95 < 10 else 0)")" "1" "SC-003 p95 < 10 s (p95=${p95}s)" || fail=1
verdict=$([[ $fail == 0 ]] && echo PASS || echo FAIL)
printf '{ "criterion": "SC-003", "verdict": "%s", "operations": %s, "paceSeconds": %s, "p50": %s, "p95": %s, "max": %s, "blockPeriodSeconds": 2, "gitSha": "%s", "runId": "%s" }\n' \
  "$verdict" "$n" "$PACE" "$p50" "$p95" "$pmax" "$GIT_SHA" "$RUN_ID" > "$EVIDENCE_DIR/evidence.json"
step "SC-003 verdict: $verdict"
exit $fail
