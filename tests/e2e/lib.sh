#!/usr/bin/env bash
# E2E helpers. cast runs in the Foundry container; signing goes through Web3Signer on the internal network.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/lib.sh"
load_env

# cast against Besu (read-only, via chain network) or Web3Signer (signing network)
cast_ro()   { docker run --rm --network "${COMPOSE_PROJECT_NAME}_chain"   --entrypoint cast "$FOUNDRY_IMAGE" "$@" --rpc-url http://besu:8545; }
cast_sign() { docker run --rm --network "${COMPOSE_PROJECT_NAME}_signing" --entrypoint cast "$FOUNDRY_IMAGE" "$@" --rpc-url http://web3signer:9000; }

balance() { cast_ro call "$1" "balanceOf(address)(uint256)" "$2" | awk '{print $1}'; }

EVIDENCE_DIR=""
evidence_init() { EVIDENCE_DIR="$ROOT/evidence/$1"; mkdir -p "$EVIDENCE_DIR"; : > "$EVIDENCE_DIR/steps.log"; }
step() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$EVIDENCE_DIR/steps.log" >&2; }
assert_eq() { if [[ "$1" == "$2" ]]; then step "PASS $3 ($1)"; else step "FAIL $3: expected=$2 got=$1"; return 1; fi; }
