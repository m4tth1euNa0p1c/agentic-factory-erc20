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
# Besu rejects eth_getLogs ranges > 5000 blocks: paginate from the deployment block (same rule as the adapter, F5).
deploy_block() { grep -oE '"deployedAtBlock": *[0-9]+' "$ROOT/deployments/local.json" 2>/dev/null | grep -oE '[0-9]+$' || echo 0; }
logs_count() { # <fromBlock> <address> <event sig> [topic args...] -> number of matching logs (paginated, fails loudly)
  local lo="$1" addr="$2" sig="$3"; shift 3
  local head n total=0 hi; head=$(cast_ro block-number)
  while (( lo <= head )); do
    hi=$(( lo + 3999 < head ? lo + 3999 : head ))
    local out
    out=$(cast_ro logs --from-block "$lo" --to-block "$hi" --address "$addr" "$sig" "$@" --json) \
      || { echo "logs query failed for [$lo,$hi]" >&2; return 1; }   # a failed query is an error, never "0 events"
    n=$(printf '%s' "$out" | { grep -o '"transactionHash"' || true; } | wc -l | tr -d ' ')
    total=$(( total + n )); lo=$(( hi + 1 ))
  done
  printf '%s' "$total"
}
ref_events() { # <token> <from> <ref> -> number of TransferWithReference events
  logs_count "$(deploy_block)" "$1" "TransferWithReference(bytes32 indexed,address indexed,address indexed,uint256)" "$3" "$2"
}

# ---------- Java API (spec 002 OpenAPI) ----------
API="http://127.0.0.1:8080/api/v1"
lc() { printf '%s' "$1" | tr 'A-F' 'a-f'; }
jget() { python -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" | tr -d '\r\n'; } # jget '["status"]' (strip CR: Windows python)
post_transfer() { # <idem-key> <from> <to> <amount> -> prints "<http_code> <body>"
  local f; f="$(mktemp)"
  curl -s -m 10 -o "$(hostpath "$f")" -w '%{http_code}' -H 'content-type: application/json' -H "Idempotency-Key: $1" \
    --data "{\"from\":\"$2\",\"to\":\"$3\",\"token\":\"TCE\",\"amount\":\"$4\"}" "$API/transfers"
  printf ' '; cat "$f"; rm -f "$f"
}
op_status() { curl -s -m 5 "$API/operations/$1" | jget '["status"]'; }
wait_status() { # <operationId> <status> [timeout_s]
  local end=$(( $(date +%s) + ${3:-90} )) s=""
  while (( $(date +%s) < end )); do
    s=$(op_status "$1" 2>/dev/null || true); [[ "$s" == "$2" ]] && return 0
    sleep 1
  done
  step "timeout waiting $1 -> $2 (last=$s)"; return 1
}
bal_field() { # <address> <field: indexed|pending|available|indexedAtBlock>
  curl -s -m 5 "$API/accounts/$1/balances" | python -c "import sys,json;print([b for b in json.load(sys.stdin) if b['token']=='TCE'][0][sys.argv[1]])" "$2" | tr -d '\r\n'
}
transitions() { "$ROOT/scripts/db-read.sh" "select string_agg(to_status, '>' order by id) from backend.operation_transition where operation_id='$1'"; }
wait_indexer_caught_up() { # indexed head >= chain head - 1
  local end=$(( $(date +%s) + ${1:-60} ))
  while (( $(date +%s) < end )); do
    local ch ih; ch=$(cast_ro block-number 2>/dev/null); ih=$(bal_field "$ALICE_ADDRESS" indexedAtBlock 2>/dev/null || echo 0)
    [[ -n "$ch" && "$ih" != "None" && $((ih)) -ge $((ch - 1)) ]] && return 0; sleep 1
  done; return 1
}
app_up() { # [ADAPTER_FAULT] — (re)start app services with the given adapter fault
  local nodeenv=production; [[ "${1:-none}" != none ]] && nodeenv=development   # faults only outside production (F6)
  ADAPTER_NODE_ENV=$nodeenv ADAPTER_FAULT="${1:-none}" dc --profile app up -d --wait indexer backend adapter >/dev/null 2>&1 || {
    step "FAIL app services did not start"; dc --profile app ps >&2; exit 1; }
  if [[ -n "${1:-}" ]]; then ADAPTER_NODE_ENV=$nodeenv ADAPTER_FAULT="$1" dc --profile app up -d --force-recreate --wait adapter >/dev/null 2>&1; fi
}

# ---------- invariant sampler (review 2026-11-08): raw values, consistent single-statement snapshots ----------
# line: epochMs|indexed|pendingNotIndexed|heldTotal   — raw = indexed - pendingNotIndexed must never be < 0
inv_sql() { local a; a=$(lc "$1"); cat <<SQL
SELECT (extract(epoch from clock_timestamp())*1000)::bigint,
  coalesce((SELECT balance FROM tela_read.account_balance WHERE id='TCE:$a'),0),
  coalesce((SELECT sum(r.amount) FROM backend.reservation r JOIN backend.operation o USING (operation_id)
     WHERE r.account='$a' AND r.token='TCE' AND r.state='HELD'
       AND NOT EXISTS (SELECT 1 FROM tela_read.operation_execution e WHERE e.id=o.token||':'||o.from_address||':'||o.reference)),0),
  coalesce((SELECT sum(amount) FROM backend.reservation WHERE account='$a' AND token='TCE' AND state='HELD'),0)
SQL
}
SAMPLER_PID=""
sampler_start() { # <account> <outfile>
  local sql; sql=$(inv_sql "$1"); : > "$2"; touch "$2.on"
  ( while [[ -f "$2.on" ]]; do "$ROOT/scripts/db-read.sh" "$sql" 2>/dev/null | tr -d '\r' >> "$2"; sleep 0.2; done ) &
  SAMPLER_PID=$!
}
sampler_stop() { rm -f "$1.on"; wait "$SAMPLER_PID" 2>/dev/null || true; }
sampler_report() { # <file> -> "samples minRaw minNaive"
  awk -F'|' 'NF==4{n++; r=$2-$3; v=$2-$4; if(n==1||r<mr)mr=r; if(n==1||v<mv)mv=v} END{printf "%d %s %s\n", n, (n?mr:"NA"), (n?mv:"NA")}' "$1"
}

EVIDENCE_DIR=""
# One directory per execution (review 2026-11-08): evidence/<spec>/<scenario>/runs/<RUN_ID>/{run.json,evidence.json,steps.log}
# run.json identifies the exact version and configuration; <scenario>/LATEST points to the last run.
evidence_init() { # <spec>/<scenario>
  RUN_ID="${RUN_ID_PREFIX:-}$(date -u +%Y%m%dT%H%M%SZ)-$$"
  EVIDENCE_BASE="$ROOT/evidence/$1"; EVIDENCE_DIR="$EVIDENCE_BASE/runs/$RUN_ID"
  mkdir -p "$EVIDENCE_DIR"; : > "$EVIDENCE_DIR/steps.log"
  GIT_SHA="$(git -C "$(hostpath "$ROOT")" rev-parse HEAD 2>/dev/null || echo unknown)"
  local dirty=false; [[ -n "$(git -C "$(hostpath "$ROOT")" status --porcelain --untracked-files=no -- . ':!evidence' 2>/dev/null)" ]] && dirty=true   # evidence/ excluded: it is written by the runs themselves
  local ci=null; [[ -n "${GITHUB_RUN_ID:-}" ]] && ci="\"${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}\""
  local images="" svc cid img
  for svc in besu web3signer postgres kafka adapter backend indexer; do
    cid=$(dc --profile app ps -q "$svc" 2>/dev/null | head -1 || true); [[ -n "$cid" ]] || continue
    img=$(docker inspect -f '{{.Config.Image}}@{{.Image}}' "$cid" 2>/dev/null || true)
    images="$images${images:+, }\"$svc\": \"$img\""
  done
  images="{ $images }"
  cat > "$EVIDENCE_DIR/run.json" <<JSON
{
  "runId": "$RUN_ID", "scenario": "$1", "startedAt": "$(date -u +%FT%TZ)",
  "git": { "sha": "$GIT_SHA", "branch": "$(git -C "$(hostpath "$ROOT")" branch --show-current 2>/dev/null)", "dirty": $dirty },
  "ci": $ci,
  "config": { "chainId": $TELA_CHAIN_ID, "adapterFault": "${ADAPTER_FAULT:-none}", "reconcileAfter": "${TELA_RECONCILE_AFTER:-10s}",
              "composeSha256": "$(sha256sum "$ROOT/compose.yaml" | cut -c1-64)", "genesisSha256": "$(sha256sum "$ROOT/infra/besu/genesis.template.json" | cut -c1-64)" },
  "images": ${images:-{\}}
}
JSON
  printf '%s\n' "$RUN_ID" > "$EVIDENCE_BASE/LATEST"
}
step() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$EVIDENCE_DIR/steps.log" >&2; }
assert_eq() { if [[ "$1" == "$2" ]]; then step "PASS $3 ($1)"; else step "FAIL $3: expected=$2 got=$1"; return 1; fi; }
