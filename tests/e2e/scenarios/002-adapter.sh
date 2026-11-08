#!/usr/bin/env bash
# Spec 002 — adapter-level integration on the live sandbox (before Java exists):
#   A. nominal: command on Kafka -> CONFIRMED result, exactly one debit (US1, adapter half)
#   B. real crash after broadcast (ADAPTER_FAULT) -> restart -> single CONFIRMED, single debit, single signature (US2)
#   C. redelivery of an executed command (journal intact) -> same txHash, no new tx (US2)
. "$(dirname "$0")/../lib.sh"
evidence_init "002/adapter"
fail=0
AMOUNT=1000000 # 1 TCE

ensure_adapter() { # <fault>
  ADAPTER_FAULT="$1" dc --profile app up -d --force-recreate --wait adapter >/dev/null 2>&1 || { step "FAIL adapter did not start"; dc logs --tail=50 adapter >&2; exit 1; }
}

# ---------- A. nominal ----------
ensure_adapter none
op=$(new_uuid); ref=$(ref_of "$op")
a0=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS"); b0=$(balance "$TCE_ADDRESS" "$BOB_ADDRESS")
kafka_produce tela.operations.commands.v1 "$(printf '%s' "$ALICE_ADDRESS" | tr A-F a-f)" "$(transfer_cmd "$op" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
step "A: produced TRANSFER op=$op ref=$ref"
if line=$(wait_result "$op" CONFIRMED 60); then step "PASS A: CONFIRMED $line"; else step "FAIL A: no CONFIRMED"; fail=1; fi
txA=$(printf '%s' "$line" | grep -oE '0x[0-9a-f]{64}' | head -1)
assert_eq "$(results_for "$op" | grep -o '"status":"[A-Z]*"' | tr '\n' ' ' | sed 's/ $//')" '"status":"BROADCAST" "status":"CONFIRMED"' "A: status sequence" || fail=1
a1=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS"); b1=$(balance "$TCE_ADDRESS" "$BOB_ADDRESS")
assert_eq "$((a0 - a1))" "$AMOUNT" "A: alice debited once" || fail=1
assert_eq "$((b1 - b0))" "$AMOUNT" "A: bob credited" || fail=1
assert_eq "$(ref_events "$TCE_ADDRESS" "$ALICE_ADDRESS" "$ref")" "1" "A: one event for (alice, ref)" || fail=1

# ---------- B. crash after broadcast ----------
ensure_adapter crash-after-broadcast
op2=$(new_uuid); ref2=$(ref_of "$op2")
restarts0=$(docker inspect -f '{{.RestartCount}}' "$(dc ps -q adapter)")
kafka_produce tela.operations.commands.v1 "$(printf '%s' "$ALICE_ADDRESS" | tr A-F a-f)" "$(transfer_cmd "$op2" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
step "B: produced TRANSFER op=$op2 with ADAPTER_FAULT=crash-after-broadcast"
if line2=$(wait_result "$op2" CONFIRMED 90); then step "PASS B: CONFIRMED after restart $line2"; else step "FAIL B: no CONFIRMED"; fail=1; fi
restarts1=$(docker inspect -f '{{.RestartCount}}' "$(dc ps -q adapter)")
crashes=$(dc logs adapter 2>/dev/null | grep -c "FAULT INJECTION" || true)
signed=$(dc logs adapter 2>/dev/null | grep "signed and journaled" | grep -c "$op2" || true)
step "B: restarts $restarts0 -> $restarts1, fault-injection log lines=$crashes, signatures for op2=$signed"
assert_eq "$(( restarts1 > restarts0 ))" "1" "B: adapter actually crashed and restarted" || fail=1
assert_eq "$signed" "1" "B: signed exactly once across the crash" || fail=1
a2=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS")
assert_eq "$((a1 - a2))" "$AMOUNT" "B: alice debited exactly once" || fail=1
assert_eq "$(ref_events "$TCE_ADDRESS" "$ALICE_ADDRESS" "$ref2")" "1" "B: one event for (alice, ref2)" || fail=1
tx2s=$(results_for "$op2" | grep -oE '"txHash":"0x[0-9a-f]{64}"' | sort -u | wc -l | tr -d ' ')
assert_eq "$tx2s" "1" "B: a single txHash across all results" || fail=1

# ---------- C. redelivery of an executed command ----------
ensure_adapter none
kafka_produce tela.operations.commands.v1 "$(printf '%s' "$ALICE_ADDRESS" | tr A-F a-f)" "$(transfer_cmd "$op" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
sleep 8
a3=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS")
assert_eq "$a3" "$a2" "C: redelivered command causes no debit" || fail=1
assert_eq "$(results_for "$op" | grep -c '"status":"CONFIRMED"')" "2" "C: final result republished (idempotent for consumers)" || fail=1
assert_eq "$(results_for "$op" | grep -oE '"txHash":"0x[0-9a-f]{64}"' | sort -u | wc -l | tr -d ' ')" "1" "C: same txHash" || fail=1

verdict=$([[ $fail == 0 ]] && echo PASS || echo FAIL)
cat > "$EVIDENCE_DIR/evidence.json" <<JSON
{
  "spec": "002", "scenario": "adapter", "verdict": "$verdict",
  "nominal": { "operationId": "$op", "txHash": "$txA", "aliceDelta": "$((a0 - a1))" },
  "crashAfterBroadcast": { "operationId": "$op2", "restarts": $((restarts1 - restarts0)), "signatures": $signed, "aliceDelta": "$((a1 - a2))", "distinctTxHashes": $tx2s },
  "redelivery": { "operationId": "$op", "aliceDelta": "$((a2 - a3))" },
  "commit": "$(git -C "$ROOT" rev-parse --short HEAD)"
}
JSON
dc logs --no-color adapter 2>/dev/null | grep -E "$op|$op2" > "$EVIDENCE_DIR/adapter.log" || true
step "verdict: $verdict"
exit $fail
