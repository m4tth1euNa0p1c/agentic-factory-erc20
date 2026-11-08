#!/usr/bin/env bash
# Spec 002 US4 — confirmed failure vs unknown result.
#   A. token paused between signing and broadcast -> mined revert (status 0) -> FAILED, reservation released
#   B. token paused before the request -> simulation revert -> REJECTED, nothing broadcast, reservation released
#   C. Besu unreachable between signing and broadcast -> UNKNOWN, reservation KEPT;
#      network restored -> reconciler RECONCILE -> CONFIRMED -> SETTLED
#   D. (review 2026-11-08) Besu ACCEPTED the tx, then the adapter loses access before the result and the
#      indexer is down: the tx is executed on-chain while the application does not know -> UNKNOWN,
#      reservation KEPT, no second effect; recovery -> CONFIRMED -> SETTLED
. "$(dirname "$0")/../lib.sh"
evidence_init "002/failure-vs-unknown"
fail=0
AMOUNT=3000000
alice=$(lc "$ALICE_ADDRESS")
pause_token()   { cast_sign send "$TCE_ADDRESS" "pause()"   --from "$OPERATOR_ADDRESS" --unlocked --legacy --gas-price 0 >/dev/null; }
unpause_token() { cast_sign send "$TCE_ADDRESS" "unpause()" --from "$OPERATOR_ADDRESS" --unlocked --legacy --gas-price 0 >/dev/null; }
wait_log() { # <pattern> [timeout]
  local end=$(( $(date +%s) + ${2:-60} ))
  while (( $(date +%s) < end )); do dc logs --no-color adapter 2>/dev/null | grep -q "$1" && return 0; sleep 1; done; return 1
}
trap 'dc --profile app start indexer >/dev/null 2>&1; unpause_token 2>/dev/null || true; for n in chain signing; do docker network connect ${COMPOSE_PROJECT_NAME}_$n $(dc ps -q adapter) 2>/dev/null || true; done' EXIT

# ---------- A. FAILED ----------
ADAPTER_FAULT_PAUSE_MS=12000 app_up pause-before-broadcast
wait_indexer_caught_up 90 || { step "FAIL indexer not caught up"; exit 1; }
pend0=$(bal_field "$alice" pending); chain0=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS")
read -r code body <<<"$(post_transfer "fail-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
opA=$(printf '%s' "$body" | jget '["operationId"]')
wait_log "pause before broadcast.*$opA" 60 || { step "FAIL A: adapter never reached the pause window"; fail=1; }
pause_token; step "A: token paused inside the signing->broadcast window"
wait_status "$opA" FAILED 90 && step "PASS US4-1 mined revert -> FAILED" || fail=1
reasonA=$(curl -s "$API/operations/$opA" | jget '["failureReason"]'); txA=$(curl -s "$API/operations/$opA" | jget '["txHash"]')
assert_eq "$reasonA" "REVERTED" "US4-1 reason REVERTED" || fail=1
receiptA=$(cast_ro receipt "$txA" status 2>/dev/null | awk '{print $1}')
case "$receiptA" in 0|0x0|false) step "PASS US4-1 on-chain receipt status 0 ($receiptA)";; *) step "FAIL US4-1 receipt status $receiptA"; fail=1;; esac
assert_eq "$(bal_field "$alice" pending)" "$pend0" "US4-1 reservation released" || fail=1
assert_eq "$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS")" "$chain0" "US4-1 no balance movement" || fail=1

# ---------- B. REJECTED (token still paused) ----------
app_up none
read -r code body <<<"$(post_transfer "rej-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
opB=$(printf '%s' "$body" | jget '["operationId"]')
wait_status "$opB" REJECTED 60 && step "PASS US4-2 simulation revert -> REJECTED" || fail=1
opBjson=$(curl -s "$API/operations/$opB")
assert_eq "$(printf '%s' "$opBjson" | jget '["failureReason"]')" "SIMULATION_REVERT:EnforcedPause" "US4-2 reason" || fail=1
assert_eq "$(printf '%s' "$opBjson" | jget '["txHash"]')" "None" "US4-2 nothing broadcast" || fail=1
assert_eq "$(bal_field "$alice" pending)" "$pend0" "US4-2 reservation released" || fail=1
unpause_token; step "token unpaused"

# ---------- C. UNKNOWN then reconciliation ----------
ADAPTER_FAULT_PAUSE_MS=12000 app_up pause-before-broadcast
read -r code body <<<"$(post_transfer "unk-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
opC=$(printf '%s' "$body" | jget '["operationId"]'); refC=$(printf '%s' "$body" | jget '["reference"]')
wait_log "pause before broadcast.*$opC" 60 || { step "FAIL C: adapter never reached the pause window"; fail=1; }
# Besu is reachable from the adapter through both `chain` and `signing` (Besu joins signing for Web3Signer, F-1)
for n in chain signing; do docker network disconnect "${COMPOSE_PROJECT_NAME}_$n" "$(dc ps -q adapter)"; done
step "C: adapter cut from Besu (chain + signing networks)"
wait_status "$opC" UNKNOWN 60 && step "PASS US4-3 RPC unavailable after signing -> UNKNOWN" || fail=1
assert_eq "$(bal_field "$alice" pending)" "$((pend0 + AMOUNT))" "US4-3 reservation KEPT on UNKNOWN" || fail=1
sleep 12   # longer than TELA_RECONCILE_AFTER: the reconciler fires while Besu is still unreachable
assert_eq "$(op_status "$opC")" "UNKNOWN" "US4-3 still UNKNOWN while unreachable (never FAILED)" || fail=1
for n in chain signing; do docker network connect "${COMPOSE_PROJECT_NAME}_$n" "$(dc ps -q adapter)"; done
step "C: networks restored"
wait_status "$opC" SETTLED 120 && step "PASS US4-4 reconciliation converged to SETTLED" || fail=1
trailC=$(transitions "$opC"); step "C transitions: $trailC"
assert_eq "$(dc logs --no-color adapter 2>/dev/null | grep "signed and journaled" | grep -c "$opC")" "1" "US4-4 signed once (journaled tx reused)" || fail=1
assert_eq "$(ref_events "$TCE_ADDRESS" "$ALICE_ADDRESS" "$refC")" "1" "US4-4 single on-chain execution" || fail=1
assert_eq "$(bal_field "$alice" pending)" "$pend0" "US4-4 reservation released after SETTLED" || fail=1
# ---------- D. UNKNOWN after acceptance by Besu ----------
ADAPTER_FAULT_PAUSE_MS=15000 app_up pause-after-broadcast
wait_indexer_caught_up 90 || { step "FAIL D: indexer not caught up"; fail=1; }
chainD0=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS"); pendD0=$(bal_field "$alice" pending)
dc --profile app stop indexer >/dev/null 2>&1; step "D: indexer stopped (no settlement from on-chain evidence)"
read -r code body <<<"$(post_transfer "unk-after-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" "$AMOUNT")"
opD=$(printf '%s' "$body" | jget '["operationId"]'); refD=$(printf '%s' "$body" | jget '["reference"]')
wait_log "pause after broadcast.*$opD" 60 || { step "FAIL D: adapter never reached the post-broadcast window"; fail=1; }
txD=$(curl -s "$API/operations/$opD" | jget '["txHash"]')
for n in chain signing; do docker network disconnect "${COMPOSE_PROJECT_NAME}_$n" "$(dc ps -q adapter)"; done
step "D: Besu accepted $txD, adapter now cut from Besu"
wait_status "$opD" UNKNOWN 60 && step "PASS D-1 result lost after acceptance -> UNKNOWN" || fail=1
sleep 3
assert_eq "$(( chainD0 - $(balance "$TCE_ADDRESS" "$ALICE_ADDRESS") ))" "$AMOUNT" "D-2 tx executed on-chain although the app does not know it" || fail=1
assert_eq "$(bal_field "$alice" heldTotal)" "$((pendD0 + AMOUNT))" "D-3 reservation KEPT while UNKNOWN" || fail=1
sleep 12   # > TELA_RECONCILE_AFTER: reconciliation attempts while still cut
assert_eq "$(op_status "$opD")" "UNKNOWN" "D-3 still UNKNOWN while unreachable (never FAILED, never released)" || fail=1
for n in chain signing; do docker network connect "${COMPOSE_PROJECT_NAME}_$n" "$(dc ps -q adapter)"; done
step "D: networks restored"
wait_status "$opD" CONFIRMED 90 && step "PASS D-4 reconciliation found the receipt -> CONFIRMED" || fail=1
dc --profile app start indexer >/dev/null 2>&1; step "D: indexer restarted"
wait_status "$opD" SETTLED 120 && step "PASS D-5 SETTLED after indexing" || fail=1
trailD=$(transitions "$opD"); step "D transitions: $trailD"
assert_eq "$(dc logs --no-color adapter 2>/dev/null | grep "signed and journaled" | grep -c "$opD")" "1" "D-6 signed once" || fail=1
assert_eq "$(ref_events "$TCE_ADDRESS" "$ALICE_ADDRESS" "$refD")" "1" "D-6 single on-chain effect" || fail=1
assert_eq "$(( chainD0 - $(balance "$TCE_ADDRESS" "$ALICE_ADDRESS") ))" "$AMOUNT" "D-6 debited exactly once" || fail=1
assert_eq "$(bal_field "$alice" heldTotal)" "$pendD0" "D-7 reservation released only after SETTLED" || fail=1
app_up none

verdict=$([[ $fail == 0 ]] && echo PASS || echo FAIL)
cat > "$EVIDENCE_DIR/evidence.json" <<JSON
{
  "spec": "002", "scenario": "failure-vs-unknown", "verdict": "$verdict",
  "failed":   { "operationId": "$opA", "reason": "$reasonA", "receiptStatus": "$receiptA",
                "txHash": "$txA" },
  "rejected": { "operationId": "$opB", "reason": "SIMULATION_REVERT:EnforcedPause" },
  "unknown":  { "operationId": "$opC", "transitions": "$trailC" },
  "unknownAfterAcceptance": { "operationId": "$opD", "txHash": "$txD", "transitions": "$trailD" },
  "commit": "$GIT_SHA", "runId": "$RUN_ID"
}
JSON
step "verdict: $verdict"
exit $fail
