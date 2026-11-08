#!/usr/bin/env bash
# Deploys TCE/TCD/TIF/Swap through Web3Signer (keys never leave it), seeds test balances,
# writes deployments/local.json and the addresses into .env, exports ABIs.
. "$(dirname "$0")/lib.sh"
load_env
cd "$ROOT"
mkdir -p contracts/deployments contracts/abi deployments

W3S="http://web3signer:9000"
common=(--rpc-url "$W3S" --unlocked --legacy --with-gas-price 0 --broadcast --slow --skip-simulation -q)
export FORGE_NETWORK="${COMPOSE_PROJECT_NAME}_signing"
export FORGE_ENV="-e DEPLOYER_ADDRESS=$DEPLOYER_ADDRESS -e TREASURY_ADDRESS=$TREASURY_ADDRESS -e OPERATOR_ADDRESS=$OPERATOR_ADDRESS -e ALICE_ADDRESS=$ALICE_ADDRESS"

log "Deploying contracts (sender $DEPLOYER_ADDRESS via Web3Signer)"
"$ROOT/scripts/forge.sh" script script/Deploy.s.sol:Deploy --sender "$DEPLOYER_ADDRESS" "${common[@]}"

json="contracts/deployments/local.json"
[[ -f "$json" ]] || die "deployment output missing"
cp "$json" deployments/local.json
get() { grep -oE "\"$1\": *\"0x[0-9a-fA-F]{40}\"" "$json" | grep -oE '0x[0-9a-fA-F]{40}'; }
for c in TCE TCD TIF SWAP; do env_set "${c}_ADDRESS" "$(get "$c")"; done
load_env

log "Seeding balances (sender $TREASURY_ADDRESS)"
export FORGE_ENV="$FORGE_ENV -e TCE_ADDRESS=$TCE_ADDRESS -e TCD_ADDRESS=$TCD_ADDRESS"
"$ROOT/scripts/forge.sh" script script/Deploy.s.sol:Seed --sender "$TREASURY_ADDRESS" "${common[@]}"

log "Exporting ABIs"
unset FORGE_NETWORK FORGE_ENV
for c in TelaToken TalanFixedRateSwap; do
  FORGE_ENTRYPOINT=forge "$ROOT/scripts/forge.sh" inspect "src/$c.sol:$c" abi --json > "contracts/abi/$c.json"
done
log "Deployed: TCE=$TCE_ADDRESS TCD=$TCD_ADDRESS TIF=$TIF_ADDRESS SWAP=$SWAP_ADDRESS"
