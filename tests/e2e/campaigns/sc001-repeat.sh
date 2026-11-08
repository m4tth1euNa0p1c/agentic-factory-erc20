#!/usr/bin/env bash
# SC-001: the 4 functional scenarios pass N (default 10) consecutive times. One run dir per execution.
. "$(dirname "$0")/lib.sh"
N="${1:-10}"
evidence_init "002/campaign-sc001"
fail=0
for i in $(seq 1 "$N"); do
  for s in nominal restart-after-broadcast ponder-lag failure-vs-unknown; do
    rc=0; RUN_ID_PREFIX="sc001-$i-" bash "$ROOT/tests/e2e/scenarios/$s.sh" >/dev/null 2>&1 || rc=$?   # a FAIL must be recorded, not abort the campaign
    run=$(cat "$ROOT/evidence/002/$s/LATEST")
    v=$([[ $rc == 0 ]] && echo PASS || echo FAIL); [[ $rc == 0 ]] || fail=1
    step "iteration $i $s: $v (run $run)"
    printf '{"iteration":%d,"scenario":"%s","verdict":"%s","run":"evidence/002/%s/runs/%s"}\n' "$i" "$s" "$v" "$s" "$run" >> "$EVIDENCE_DIR/runs.jsonl"
  done
done
total=$(wc -l < "$EVIDENCE_DIR/runs.jsonl" | tr -d ' '); passed=$(grep -c '"PASS"' "$EVIDENCE_DIR/runs.jsonl")
verdict=$([[ $fail == 0 && $total == $((4 * N)) ]] && echo PASS || echo FAIL)
printf '{ "criterion": "SC-001", "verdict": "%s", "iterations": %d, "executions": %d, "passed": %d, "gitSha": "%s", "runId": "%s" }\n' \
  "$verdict" "$N" "$total" "$passed" "$GIT_SHA" "$RUN_ID" > "$EVIDENCE_DIR/evidence.json"
step "SC-001 verdict: $verdict ($passed/$total)"
exit $fail
