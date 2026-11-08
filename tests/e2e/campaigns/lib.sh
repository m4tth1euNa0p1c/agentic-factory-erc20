#!/usr/bin/env bash
# Shared helpers for success-criteria campaigns (spec 002 SC-001..SC-004).
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

# wait until every operation id in "$@" is in a terminal status; prints "settled failed rejected other"
wait_all_terminal() { # <timeout_s> <ids...>
  local end=$(( $(date +%s) + $1 )); shift
  local ids="'$(printf '%s' "$*" | sed "s/ /','/g")'"
  while (( $(date +%s) < end )); do
    local open; open=$("$ROOT/scripts/db-read.sh" "select count(*) from backend.operation where operation_id in ($ids) and status not in ('SETTLED','FAILED','REJECTED')" | tr -d '\r')
    [[ "$open" == "0" ]] && break
    sleep 3
  done
  "$ROOT/scripts/db-read.sh" "select count(*) filter (where status='SETTLED'), count(*) filter (where status='FAILED'),
     count(*) filter (where status='REJECTED'), count(*) filter (where status not in ('SETTLED','FAILED','REJECTED'))
     from backend.operation where operation_id in ($ids)" | tr -d '\r' | tr '|' ' '
}

# number of TransferWithReference events emitted by <from> on TCE since <fromBlock>
events_from() { # <from> <fromBlock>
  cast_ro logs --from-block "$2" --address "$TCE_ADDRESS" "TransferWithReference(bytes32 indexed,address indexed,address indexed,uint256)" "" "$1" --json \
    | grep -o '"transactionHash"' | wc -l | tr -d ' '
}

fund() { # <account> <amount> : treasury mints (MINTER_ROLE)
  cast_sign send "$TCE_ADDRESS" "mint(address,uint256)" "$1" "$2" --from "$TREASURY_ADDRESS" --unlocked --legacy --gas-price 0 >/dev/null
}
