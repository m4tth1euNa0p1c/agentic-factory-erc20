#!/usr/bin/env bash
# Spec 002 US3 — Ponder stopped, 20 concurrent requests for 10 "slots" of the available balance:
# exactly 10 accepted, available never negative, ops stay CONFIRMED while the index is stale,
# then everything converges to SETTLED when Ponder catches up.
. "$(dirname "$0")/../lib.sh"
evidence_init "002/ponder-lag"
fail=0
app_up none
wait_indexer_caught_up 90 || { step "FAIL indexer not caught up"; exit 1; }
SENDER="$BOB_ADDRESS"; sender=$(lc "$SENDER")
# self-contained: the treasury (MINTER_ROLE) funds the sender with 100 TCE, then wait for the index
cast_sign send "$TCE_ADDRESS" "mint(address,uint256)" "$SENDER" 100000000 --from "$TREASURY_ADDRESS" --unlocked --legacy --gas-price 0 >/dev/null
sleep 3; wait_indexer_caught_up 60
avail0=$(bal_field "$sender" available); idx0=$(bal_field "$sender" indexed)
(( avail0 >= 100 )) || { step "FAIL sender has too little available ($avail0)"; exit 1; }
AMOUNT=$(( avail0 / 10 ))
step "sender=bob available=$avail0 -> amount per request=$AMOUNT"

sampler_start "$SENDER" "$EVIDENCE_DIR/invariant-samples.txt"   # raw invariant sampled during lag AND catch-up
dc --profile app stop indexer >/dev/null 2>&1
step "indexer stopped"

tmp=$(mktemp -d); pids=()
for i in $(seq 1 20); do
  ( post_transfer "lag-$i-$(new_uuid)" "$SENDER" "$ALICE_ADDRESS" "$AMOUNT" > "$tmp/$i" ) &
  pids+=($!)
done
wait "${pids[@]}"   # NOT a bare wait: the invariant sampler also runs in the background
accepted=$(grep -l '^202 ' "$tmp"/* | wc -l | tr -d ' ')
refused=$(grep -l '^409 ' "$tmp"/* | wc -l | tr -d ' ')
ops=$(grep -h '^202 ' "$tmp"/* | sed 's/^202 //' | while read -r b; do printf '%s' "$b" | jget '["operationId"]'; echo; done)
assert_eq "$accepted" "10" "US3-1 exactly 10 accepted" || fail=1
assert_eq "$refused" "10" "US3-1 exactly 10 refused (409)" || fail=1
availNow=$(bal_field "$sender" available); rawNow=$(bal_field "$sender" availableRaw)
assert_eq "$rawNow" "$availNow" "US3-1 raw available == displayed available (no clamping hid a negative)" || fail=1
assert_eq "$availNow" "$((avail0 - 10 * AMOUNT))" "US3-1 available = initial - 10 x amount" || fail=1

for op in $ops; do wait_status "$op" CONFIRMED 120 >/dev/null || { step "FAIL $op not CONFIRMED"; fail=1; }; done
step "all accepted ops CONFIRMED while indexer is down"
not_settled=0; for op in $ops; do [[ "$(op_status "$op")" == "CONFIRMED" ]] || not_settled=1; done
assert_eq "$not_settled" "0" "US3-2 ops stay CONFIRMED (not SETTLED) while index is stale" || fail=1
assert_eq "$(bal_field "$sender" pending)" "$((10 * AMOUNT))" "US3-2 pending = 10 x amount" || fail=1
assert_eq "$(bal_field "$sender" indexed)" "$idx0" "US3-2 indexed balance is stale (unchanged)" || fail=1
chainNow=$(balance "$TCE_ADDRESS" "$SENDER")
assert_eq "$((idx0 - chainNow))" "$((10 * AMOUNT))" "on-chain debited 10 x amount" || fail=1

dc --profile app start indexer >/dev/null 2>&1
step "indexer restarted"
for op in $ops; do wait_status "$op" SETTLED 120 >/dev/null || { step "FAIL $op not SETTLED"; fail=1; }; done
step "all ops SETTLED after catch-up"
sleep 2; sampler_stop "$EVIDENCE_DIR/invariant-samples.txt"
read -r nS minRaw minNaive <<<"$(sampler_report "$EVIDENCE_DIR/invariant-samples.txt")"
step "invariant sampler: $nS snapshots, min(indexed - pendingNotIndexed)=$minRaw, min(indexed - heldTotal)=$minNaive (naive, informational)"
assert_eq "$((nS >= 20))" "1" "US3 invariant sampled continuously ($nS snapshots)" || fail=1
assert_eq "$((minRaw >= 0))" "1" "US3 raw availability never negative over lag + catch-up (min=$minRaw)" || fail=1
assert_eq "$(bal_field "$sender" indexed)" "$chainNow" "US3-3 indexed == balanceOf after catch-up" || fail=1
assert_eq "$(bal_field "$sender" pending)" "0" "US3-3 pending = 0" || fail=1
assert_eq "$(bal_field "$sender" available)" "$chainNow" "US3-3 available == balanceOf" || fail=1

verdict=$([[ $fail == 0 ]] && echo PASS || echo FAIL)
cat > "$EVIDENCE_DIR/evidence.json" <<JSON
{
  "spec": "002", "scenario": "ponder-lag", "verdict": "$verdict",
  "invariant": { "snapshots": $nS, "minRawAvailable": "$minRaw", "minNaiveIndexedMinusHeld": "$minNaive" },
  "requests": 20, "accepted": $accepted, "refused": $refused, "amount": "$AMOUNT",
  "availableBefore": "$avail0", "availableDuringLag": "$availNow", "onChainAfter": "$chainNow",
  "operations": "$(printf '%s ' $ops)", "commit": "$GIT_SHA", "runId": "$RUN_ID"
}
JSON
rm -rf "$tmp"
step "verdict: $verdict"
exit $fail
