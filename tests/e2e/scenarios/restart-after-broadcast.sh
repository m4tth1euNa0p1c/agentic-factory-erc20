#!/usr/bin/env bash
# Spec 002 US2 — the adapter crashes right after broadcasting (offset not committed), restarts and
# re-processes the command: no second debit, single signature, single event, single CONFIRMED transition.
. "$(dirname "$0")/../lib.sh"
evidence_init "002/restart-after-broadcast"
fail=0
AMOUNT=7000000
app_up crash-after-broadcast
wait_indexer_caught_up 90 || { step "FAIL indexer not caught up"; exit 1; }
alice=$(lc "$ALICE_ADDRESS")
chainA0=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS")
cid=$(dc ps -q adapter); restarts0=$(docker inspect -f '{{.RestartCount}}' "$cid")

read -r code body <<<"$(post_transfer "restart-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
op=$(printf '%s' "$body" | jget '["operationId"]'); ref=$(printf '%s' "$body" | jget '["reference"]')
assert_eq "$code" "202" "POST accepted" || fail=1
wait_status "$op" SETTLED 120 && step "PASS US2-1 operation SETTLED after crash + restart" || fail=1
# the adapter must also resume its journaled attempt (Java may already have settled from the indexed event)
end=$(( $(date +%s) + 90 ))
until dc logs --no-color adapter 2>/dev/null | grep "resuming journaled attempt" | grep -q "$op" || (( $(date +%s) > end )); do sleep 2; done
sleep 3

restarts1=$(docker inspect -f '{{.RestartCount}}' "$cid")
logs=$(dc logs --no-color adapter 2>/dev/null | grep "$op" || true)
crashes=$(printf '%s\n' "$logs" | grep -c "FAULT INJECTION: crash after broadcast" || true)
signed=$(printf '%s\n' "$logs" | grep -c "signed and journaled" || true)
resumed=$(printf '%s\n' "$logs" | grep -c "resuming journaled attempt" || true)
step "adapter restarts $restarts0 -> $restarts1, crashes=$crashes, signatures=$signed, resumes=$resumed"
assert_eq "$((restarts1 - restarts0 >= 1))" "1" "US2-1 adapter really crashed and was restarted" || fail=1
assert_eq "$crashes" "1" "US2-1 fault fired once (no crash loop)" || fail=1
assert_eq "$signed" "1" "US2-1 transaction signed exactly once" || fail=1
assert_eq "$((resumed >= 1))" "1" "US2-1 journaled attempt resumed" || fail=1

chainA1=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS")
assert_eq "$((chainA0 - chainA1))" "$AMOUNT" "US2-2 balanceOf(alice) decreased exactly once" || fail=1
assert_eq "$(ref_events "$TCE_ADDRESS" "$ALICE_ADDRESS" "$ref")" "1" "US2-2 single TransferWithReference event" || fail=1
trail=$(transitions "$op"); step "transitions: $trail"
assert_eq "$(printf '%s' "$trail" | grep -o CONFIRMED | wc -l | tr -d ' ')" "$( [[ "$trail" == *CONFIRMED* ]] && echo 1 || echo 0)" "US2-2 at most one CONFIRMED transition" || fail=1
assert_eq "$(bal_field "$alice" indexed)" "$chainA1" "indexed == balanceOf" || fail=1
assert_eq "$(bal_field "$alice" pending)" "0" "reservation released" || fail=1
tx=$(curl -s "$API/operations/$op" | jget '["txHash"]')

app_up none   # back to normal
verdict=$([[ $fail == 0 ]] && echo PASS || echo FAIL)
cat > "$EVIDENCE_DIR/evidence.json" <<JSON
{
  "spec": "002", "scenario": "restart-after-broadcast", "verdict": "$verdict",
  "operationId": "$op",
  "reference": "$ref",
  "txHash": "$tx",
  "adapterRestarts": $((restarts1 - restarts0)), "crashes": $crashes, "signatures": $signed,
  "aliceDelta": "$((chainA0 - chainA1))", "eventsForReference": $(ref_events "$TCE_ADDRESS" "$ALICE_ADDRESS" "$ref"),
  "transitions": "$trail", "commit": "$(git -C "$ROOT" rev-parse --short HEAD)"
}
JSON
printf '%s\n' "$logs" > "$EVIDENCE_DIR/adapter.log"
step "verdict: $verdict"
exit $fail
