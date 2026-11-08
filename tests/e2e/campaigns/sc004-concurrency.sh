#!/usr/bin/env bash
# SC-004: 1000 concurrent requests on the full stack; never over-reserved, raw availability never negative
# (continuous single-statement snapshots from submission to full settlement).
. "$(dirname "$0")/lib.sh"
N="${1:-1000}"; SLOTS="${2:-100}"; AMOUNT=1000000
evidence_init "002/campaign-sc004"
fail=0
app_up none; wait_indexer_caught_up 90
SENDER="$BOB_ADDRESS"; sender=$(lc "$SENDER")
# exact capacity: top up bob so that available == SLOTS * AMOUNT
avail=$(bal_field "$sender" available); need=$(( SLOTS * AMOUNT - avail ))
if (( need > 0 )); then fund "$SENDER" "$need"; sleep 3; wait_indexer_caught_up 60; fi
avail0=$(bal_field "$sender" available)
expected=$(( avail0 / AMOUNT ))
sampler_start "$SENDER" "$EVIDENCE_DIR/invariant-samples.txt"
burst=$(node "$(hostpath "$ROOT/tests/e2e/tools/burst.mjs")" "$API" "$SENDER" "$ALICE_ADDRESS" "$AMOUNT" "$N" sc004 | tr -d '\r')
printf '%s\n' "$burst" > "$EVIDENCE_DIR/burst.json"
acc=$(printf '%s' "$burst" | jget '["accepted"]'); ref=$(printf '%s' "$burst" | jget '["refused"]'); oth=$(printf '%s' "$burst" | jget '["other"]')
step "burst: $N requests in $(printf '%s' "$burst" | jget '["ms"]') ms -> accepted=$acc refused=$ref other=$oth"
assert_eq "$acc" "$expected" "SC-004 exactly capacity/amount accepted" || fail=1
assert_eq "$((acc + ref))" "$N" "every request answered 202 or 409" || fail=1
raw=$(bal_field "$sender" availableRaw); assert_eq "$((raw >= 0))" "1" "raw available >= 0 right after the burst ($raw)" || fail=1
ids=$(printf '%s' "$burst" | python -c "import sys,json;print(' '.join(json.load(sys.stdin)['ids']))" | tr -d '\r')
read -r s f r o <<<"$(wait_all_terminal 1800 $ids)"
sleep 2; sampler_stop "$EVIDENCE_DIR/invariant-samples.txt"
read -r nS minRaw minNaive <<<"$(sampler_report "$EVIDENCE_DIR/invariant-samples.txt")"
step "invariant: $nS snapshots, min raw=$minRaw, min naive(indexed-heldTotal)=$minNaive"
assert_eq "$s" "$acc" "all accepted operations SETTLED" || fail=1
assert_eq "$((minRaw >= 0))" "1" "SC-004 raw availability never negative during execution (min=$minRaw over $nS snapshots)" || fail=1
assert_eq "$(bal_field "$sender" indexed)" "$(balance "$TCE_ADDRESS" "$SENDER")" "indexed == balanceOf after settlement" || fail=1
verdict=$([[ $fail == 0 ]] && echo PASS || echo FAIL)
printf '{ "criterion": "SC-004", "verdict": "%s", "requests": %s, "accepted": %s, "refused": %s, "capacitySlots": %s, "snapshots": %s, "minRawAvailable": "%s", "minNaive": "%s", "gitSha": "%s", "runId": "%s" }\n' \
  "$verdict" "$N" "$acc" "$ref" "$expected" "$nS" "$minRaw" "$minNaive" "$GIT_SHA" "$RUN_ID" > "$EVIDENCE_DIR/evidence.json"
step "SC-004 verdict: $verdict"
exit $fail
