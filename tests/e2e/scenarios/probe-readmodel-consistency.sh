#!/usr/bin/env bash
# Diagnostic (review 2026-11-08 follow-up): after a Ponder restart, are balance and execution rows of the same
# block published together? Polls both read-model views every ~0.3 s around the restart and records them.
. "$(dirname "$0")/../lib.sh"
evidence_init "002/probe-readmodel"
app_up none; wait_indexer_caught_up 90
a=$(lc "$ALICE_ADDRESS")
dc --profile app stop indexer >/dev/null 2>&1; step "indexer stopped"
N="${1:-10}"; ops=""
for i in $(seq 1 $N); do
  read -r code body <<<"$(post_transfer "probe-$i-$(new_uuid)" "$ALICE_ADDRESS" "$BOB_ADDRESS" 1000000)"
  ops="$ops'$(printf '%s' "$body" | jget '["operationId"]')',"
done
ops="${ops%,}"; last=$(printf '%s' "$ops" | tr ',' '
' | tail -1 | tr -d "'")
wait_status "$last" CONFIRMED 120 >/dev/null; sleep 4; step "$N ops CONFIRMED while indexer down"
q="select (extract(epoch from clock_timestamp())*1000)::bigint,
  (select balance from tela_read.account_balance where id='TCE:$a'),
  (select count(*) from tela_read.operation_execution e join backend.operation o on e.id=o.token||':'||o.from_address||':'||o.reference where o.operation_id in ($ops)),
  (select block_number from tela_read.chain_head where id='head'),
  (select string_agg(distinct status, ',') from backend.operation where operation_id in ($ops))"
dc --profile app start indexer >/dev/null 2>&1; step "indexer start requested"
for i in $(seq 1 60); do "$ROOT/scripts/db-read.sh" "$q" 2>&1 | tr -d '\r' >> "$EVIDENCE_DIR/poll.txt"; sleep 0.2; done
dc --profile app logs --no-color --since 2m indexer 2>/dev/null | grep -vE "Indexed block|Finalized block" > "$EVIDENCE_DIR/indexer.log" || true
step "poll written: $EVIDENCE_DIR/poll.txt"
