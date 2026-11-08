#!/usr/bin/env bash
# E2E helpers. cast runs in the Foundry container; signing goes through Web3Signer on the internal network.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/lib.sh"
load_env

# cast against Besu (read-only, via chain network) or Web3Signer (signing network)
cast_ro()   { docker run --rm --network "${COMPOSE_PROJECT_NAME}_chain"   --entrypoint cast "$FOUNDRY_IMAGE" "$@" --rpc-url http://besu:8545; }
cast_sign() { docker run --rm --network "${COMPOSE_PROJECT_NAME}_signing" --entrypoint cast "$FOUNDRY_IMAGE" "$@" --rpc-url http://web3signer:9000; }

balance() { cast_ro call "$1" "balanceOf(address)(uint256)" "$2" | awk '{print $1}'; }

dc() { docker compose --project-directory "$(hostpath "$ROOT")" -f "$(hostpath "$ROOT")/compose.yaml" "$@"; }
new_uuid() { node -e 'console.log(crypto.randomUUID())'; }
ref_of() { docker run --rm --entrypoint cast "$FOUNDRY_IMAGE" keccak "$1"; }   # D-02: keccak256(utf8(operationId))

kafka_produce() { # <topic> <key> <json>
  printf '%s|%s\n' "$2" "$3" | dc exec -T kafka /opt/kafka/bin/kafka-console-producer.sh \
    --bootstrap-server localhost:9092 --topic "$1" --property parse.key=true --property 'key.separator=|' >/dev/null
}
results_for() { # <operationId> -> all result lines for that op
  dc exec -T kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
    --topic tela.operations.results.v1 --from-beginning --timeout-ms 4000 2>/dev/null | grep "\"operationId\":\"$1\"" || true
}
wait_result() { # <operationId> <status> [timeout_s] -> first matching line
  local end=$(( $(date +%s) + ${3:-60} )) line
  while (( $(date +%s) < end )); do
    line=$(results_for "$1" | grep "\"status\":\"$2\"" | head -1)
    [[ -n "$line" ]] && { printf '%s' "$line"; return 0; }
    sleep 2
  done
  return 1
}
transfer_cmd() { # <operationId> <from> <to> <amount> [type]
  printf '{"schemaVersion":1,"type":"%s","operationId":"%s","reference":"%s","token":"TCE","from":"%s","to":"%s","amount":"%s","issuedAt":"%s"}' \
    "${5:-TRANSFER}" "$1" "$(ref_of "$1")" "$2" "$3" "$4" "$(date -u +%FT%TZ)"
}
ref_events() { # <token> <from> <ref> -> number of TransferWithReference events
  cast_ro logs --from-block 0 --address "$1" "TransferWithReference(bytes32 indexed,address indexed,address indexed,uint256)" "$3" "$2" --json \
    | grep -o '"transactionHash"' | wc -l | tr -d ' '
}

EVIDENCE_DIR=""
evidence_init() { EVIDENCE_DIR="$ROOT/evidence/$1"; mkdir -p "$EVIDENCE_DIR"; : > "$EVIDENCE_DIR/steps.log"; }
step() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$EVIDENCE_DIR/steps.log" >&2; }
assert_eq() { if [[ "$1" == "$2" ]]; then step "PASS $3 ($1)"; else step "FAIL $3: expected=$2 got=$1"; return 1; fi; }
