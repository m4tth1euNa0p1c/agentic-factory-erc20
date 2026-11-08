#!/usr/bin/env bash
# Spec 001 / US2 (T012): on-chain proof of transferWithReference and replay rejection on the live sandbox.
. "$(dirname "$0")/../lib.sh"
evidence_init "001/contracts"
fail=0

ref="$(cast_ro keccak "e2e-001-$(date +%s%N)" 2>/dev/null || docker run --rm --entrypoint cast "$FOUNDRY_IMAGE" keccak "e2e-001-$RANDOM$RANDOM")"
amount=10000000   # 10 TCE (6 decimals)

a0=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS"); b0=$(balance "$TCE_ADDRESS" "$BOB_ADDRESS")
step "initial alice=$a0 bob=$b0 ref=$ref"

out=$(cast_sign send "$TCE_ADDRESS" "transferWithReference(address,uint256,bytes32)" "$BOB_ADDRESS" "$amount" "$ref" \
        --from "$ALICE_ADDRESS" --unlocked --legacy --gas-price 0 --json)
tx=$(printf '%s' "$out" | grep -oE '"transactionHash":"0x[0-9a-f]{64}"' | grep -oE '0x[0-9a-f]{64}' | head -1)
status=$(printf '%s' "$out" | grep -oE '"status":"0x[01]"' | grep -oE '0x[01]' | head -1)
block=$(printf '%s' "$out" | grep -oE '"blockNumber":"0x[0-9a-f]+"' | grep -oE '0x[0-9a-f]+' | head -1)
step "tx1 hash=$tx status=$status block=$((block))"
assert_eq "$status" "0x1" "first transferWithReference succeeds" || fail=1

a1=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS"); b1=$(balance "$TCE_ADDRESS" "$BOB_ADDRESS")
assert_eq "$((a0 - a1))" "$amount" "alice debited exactly once" || fail=1
assert_eq "$((b1 - b0))" "$amount" "bob credited" || fail=1
assert_eq "$(cast_ro call "$TCE_ADDRESS" "isReferenceUsed(bytes32)(bool)" "$ref")" "true" "reference consumed" || fail=1

# Replay: must be refused before broadcast (simulation) with ReferenceAlreadyUsed(ref)
replay=$(cast_sign send "$TCE_ADDRESS" "transferWithReference(address,uint256,bytes32)" "$BOB_ADDRESS" "$amount" "$ref" \
          --from "$ALICE_ADDRESS" --unlocked --legacy --gas-price 0 2>&1 || true)
sel=$(docker run --rm --entrypoint cast "$FOUNDRY_IMAGE" sig "ReferenceAlreadyUsed(bytes32)")
if printf '%s' "$replay" | grep -qiE "ReferenceAlreadyUsed|${sel#0x}"; then step "PASS replay rejected with ReferenceAlreadyUsed"; else step "FAIL replay not rejected: $replay"; fail=1; fi
a2=$(balance "$TCE_ADDRESS" "$ALICE_ADDRESS")
assert_eq "$a2" "$a1" "no second debit after replay" || fail=1

logs=$(cast_ro logs --from-block 0 --address "$TCE_ADDRESS" "TransferWithReference(bytes32 indexed,address indexed,address indexed,uint256)" "$ref" --json | grep -o '"transactionHash"' | wc -l | tr -d ' ')
assert_eq "$logs" "1" "exactly one TransferWithReference event for ref" || fail=1

cat > "$EVIDENCE_DIR/evidence.json" <<JSON
{ "spec": "001", "scenario": "contracts", "verdict": "$([[ $fail == 0 ]] && echo PASS || echo FAIL)",
  "chainId": $TELA_CHAIN_ID, "token": "$TCE_ADDRESS",
  "reference": "$ref",
  "txHash": "$tx",
  "receiptStatus": "$status",
  "blockNumber": $((block)), "aliceBefore": "$a0", "aliceAfter": "$a2", "bobBefore": "$b0", "bobAfter": "$b1",
  "eventsForReference": $logs, "commit": "$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo none)" }
JSON
step "verdict: $([[ $fail == 0 ]] && echo PASS || echo FAIL) -> $EVIDENCE_DIR/evidence.json"
exit $fail
