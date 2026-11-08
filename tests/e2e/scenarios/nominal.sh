#!/usr/bin/env bash
# Spec 002 US1 — nominal TCE transfer through the whole chain:
# API(Java) -> outbox -> Kafka -> adapter -> Web3Signer -> Besu -> Ponder -> Java (SETTLED)
. "$(dirname "$0")/../lib.sh"
evidence_init "002/nominal"
fail=0
AMOUNT=10000000 # 10 TCE
app_up none
wait_indexer_caught_up 90 || { step "FAIL indexer not caught up"; exit 1; }

alice=$(lc "$ALICE_ADDRESS"); bob=$(lc "$BOB_ADDRESS")
chainA0=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS"); chainB0=$(balance "$TCE_ADDRESS" "$BOB_ADDRESS")
idx0=$(bal_field "$alice" indexed); pend0=$(bal_field "$alice" pending)
assert_eq "$idx0" "$chainA0" "US1 pre: indexed balance == balanceOf" || fail=1

key="nominal-$(new_uuid)"
read -r code body <<<"$(post_transfer "$key" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
op=$(printf '%s' "$body" | jget '["operationId"]')
assert_eq "$code" "202" "US1-1 POST /transfers accepted" || fail=1
assert_eq "$(printf '%s' "$body" | jget '["status"]')" "RECEIVED" "US1-1 initial status RECEIVED" || fail=1
assert_eq "$(bal_field "$alice" available)" "$((idx0 - pend0 - AMOUNT))" "US1-1 available reduced immediately" || fail=1

wait_status "$op" SETTLED 90 && step "PASS US1-3 operation SETTLED" || fail=1
trail=$(transitions "$op")
step "transitions: $trail"
[[ "$trail" == RECEIVED*BROADCAST*CONFIRMED*SETTLED || "$trail" == RECEIVED*SETTLED ]] && step "PASS US1-2 lifecycle order" || { step "FAIL US1-2 lifecycle $trail"; fail=1; }
opjson=$(curl -s "$API/operations/$op")
tx=$(printf '%s' "$opjson" | jget '["txHash"]'); blk=$(printf '%s' "$opjson" | jget '["blockNumber"]')

chainA1=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS"); chainB1=$(balance "$TCE_ADDRESS" "$BOB_ADDRESS")
assert_eq "$((chainA0 - chainA1))" "$AMOUNT" "on-chain: alice debited exactly once" || fail=1
assert_eq "$((chainB1 - chainB0))" "$AMOUNT" "on-chain: bob credited" || fail=1
assert_eq "$(bal_field "$alice" indexed)" "$chainA1" "US1-3 indexed == balanceOf" || fail=1
assert_eq "$(bal_field "$alice" pending)" "$pend0" "US1-3 pending back to initial (no double count)" || fail=1
assert_eq "$(bal_field "$alice" available)" "$((chainA1 - pend0))" "US1-3 available == indexed - pending" || fail=1
assert_eq "$(ref_events "$TCE_ADDRESS" "$ALICE_ADDRESS" "$(printf '%s' "$opjson" | jget '["reference"]')")" "1" "one TransferWithReference event" || fail=1

read -r code2 body2 <<<"$(post_transfer "$key" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
assert_eq "$code2 $(printf '%s' "$body2" | jget '["operationId"]')" "200 $op" "US1-4 Idempotency-Key replay returns same operation" || fail=1
read -r code3 body3 <<<"$(post_transfer "$key" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$((AMOUNT + 1))")"
assert_eq "$code3" "409" "US1-4b Idempotency-Key reused with other body -> 409" || fail=1

too_much=$(( $(bal_field "$alice" available) + 1 ))
read -r code4 body4 <<<"$(post_transfer "nominal-insuf-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$too_much")"
assert_eq "$code4 $(printf '%s' "$body4" | jget '["code"]')" "409 INSUFFICIENT_AVAILABLE" "US1-5 insufficient available -> 409" || fail=1
read -r code5 _ <<<"$(post_transfer "nominal-bad-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" "1.5")"
assert_eq "$code5" "400" "edge: non-integer amount -> 400" || fail=1

verdict=$([[ $fail == 0 ]] && echo PASS || echo FAIL)
cat > "$EVIDENCE_DIR/evidence.json" <<JSON
{
  "spec": "002", "scenario": "nominal", "verdict": "$verdict",
  "operationId": "$op",
  "txHash": "$tx",
  "blockNumber": "$blk", "transitions": "$trail",
  "aliceOnChainBefore": "$chainA0", "aliceOnChainAfter": "$chainA1", "aliceIndexedAfter": "$(bal_field "$alice" indexed)",
  "alicePendingAfter": "$(bal_field "$alice" pending)", "commit": "$GIT_SHA", "runId": "$RUN_ID"
}
JSON
step "verdict: $verdict"
exit $fail
