#!/usr/bin/env bash
# SC-002: 0 double debit over >= 100 REAL adapter crashes injected at random checkpoints between signature
# and offset commit (after-sign, after-journal, after-broadcast, after-broadcast-published, after-result).
. "$(dirname "$0")/lib.sh"
TARGET="${1:-100}"; BATCH="${2:-20}"; AMOUNT=1000000
evidence_init "002/campaign-sc002"
fail=0
ADAPTER_NODE_ENV=development ADAPTER_FAULT=crash-random ADAPTER_FAULT_PROBABILITY="${P:-0.2}" ADAPTER_SUPERVISE=1 \
  dc --profile app up -d --force-recreate --wait adapter >/dev/null 2>&1 || { step "FAIL adapter did not start"; exit 1; }
wait_indexer_caught_up 90
startBlock=$(cast_ro block-number); chain0=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS")
crashes() { dc logs --no-color adapter 2>/dev/null | grep -c "FAULT INJECTION: crash at checkpoint" || true; }
c0=$(crashes); ids=""; nops=0; round=0
while (( $(crashes) - c0 < TARGET )) && (( round < 40 )); do
  round=$((round + 1))
  for i in $(seq 1 "$BATCH"); do
    read -r code body <<<"$(post_transfer "sc002-$round-$i-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
    [[ "$code" == 202 ]] && { ids="$ids $(printf '%s' "$body" | jget '["operationId"]')"; nops=$((nops + 1)); }
  done
  read -r s f r o <<<"$(wait_all_terminal 900 $ids)"
  step "round $round: ops=$nops crashes=$(( $(crashes) - c0 )) settled=$s failed=$f rejected=$r open=$o"
done
ncr=$(( $(crashes) - c0 ))
points=$(dc logs --no-color adapter 2>/dev/null | grep "FAULT INJECTION: crash at checkpoint" | grep -oE '"point":"[a-z-]+"' | sort | uniq -c | awk '{printf "%s%s=%s", (n++?",":""), $2, $1}' | tr -d '"')
read -r s f r o <<<"$(wait_all_terminal 900 $ids)"
chain1=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS"); ev=$(events_from "$ALICE_ADDRESS" "$startBlock")
assert_eq "$((ncr >= TARGET))" "1" "SC-002 at least $TARGET real crashes injected ($ncr; $points)" || fail=1
assert_eq "$s" "$nops" "every accepted operation SETTLED ($nops)" || fail=1
assert_eq "$ev" "$nops" "exactly one TransferWithReference event per operation" || fail=1
assert_eq "$((chain0 - chain1))" "$((nops * AMOUNT))" "on-chain debit == sum of operations (0 double debit)" || fail=1
dup=$("$ROOT/scripts/db-read.sh" "select count(*) from (select tx_hash from backend.operation where operation_id in ('$(printf '%s' "${ids# }" | sed "s/ /','/g")') group by tx_hash having count(*) > 1) d" | tr -d '\r')
assert_eq "$dup" "0" "no transaction hash shared by two operations" || fail=1
dc --profile app up -d --force-recreate --wait adapter >/dev/null 2>&1   # back to normal (production, no fault)
verdict=$([[ $fail == 0 ]] && echo PASS || echo FAIL)
printf '{ "criterion": "SC-002", "verdict": "%s", "crashes": %d, "crashPoints": "%s", "operations": %d, "settled": %s, "events": %s, "onChainDebit": "%s", "expectedDebit": "%s", "gitSha": "%s", "runId": "%s" }\n' \
  "$verdict" "$ncr" "$points" "$nops" "$s" "$ev" "$((chain0 - chain1))" "$((nops * AMOUNT))" "$GIT_SHA" "$RUN_ID" > "$EVIDENCE_DIR/evidence.json"
step "SC-002 verdict: $verdict"
exit $fail
