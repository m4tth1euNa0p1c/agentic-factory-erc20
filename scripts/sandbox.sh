#!/usr/bin/env bash
# TELA sandbox lifecycle: up | down | reset | check | ps | logs <svc>
. "$(dirname "$0")/lib.sh"
cd "$ROOT"
[[ -f .env ]] || "$ROOT/scripts/bootstrap-env.sh"

rpc() { # rpc <method> [params-json]  — against Besu on localhost
  curl -s -m 5 -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":${2:-[]}}" http://127.0.0.1:8545
}

case "${1:-up}" in
  up)
    render_genesis
    docker compose up -d --wait besu web3signer postgres kafka
    docker compose up kafka-init --exit-code-from kafka-init >/dev/null
    log "sandbox up"; "$0" check ;;
  down)  docker compose down ;;
  reset) docker compose down -v --remove-orphans; rm -f deployments/local.json contracts/deployments/local.json
         log "volumes removed (chain state wiped; keys kept)" ;;
  ps)    docker compose ps ;;
  logs)  docker compose logs --tail=200 "${2:-}" ;;
  check)
    load_env
    fail=0
    chk() { if eval "$2" >/dev/null 2>&1; then log "OK   $1"; else log "FAIL $1"; fail=1; fi; }
    chk "besu chainId=$TELA_CHAIN_ID" "rpc eth_chainId | grep -q \"\\\"$(printf '0x%x' "$TELA_CHAIN_ID")\\\"\""
    b1=$(rpc eth_blockNumber | grep -oE '0x[0-9a-f]+'); sleep 3; b2=$(rpc eth_blockNumber | grep -oE '0x[0-9a-f]+')
    chk "besu produces blocks ($b1 -> $b2)" "[ $((b2)) -gt $((b1)) ]"
    disabled="grep -q 'Method not found\\|not enabled\\|-32601\\|-32604'"
    chk "besu admin API disabled" "rpc admin_peers | $disabled"
    chk "besu QBFT vote API disabled (M-3)" "rpc qbft_proposeValidatorVote '[\"0x0000000000000000000000000000000000000001\",true]' | $disabled"
    chk "besu TXPOOL API disabled" "rpc txpool_besuStatistics | $disabled"
    accts=$(docker run --rm --network "${COMPOSE_PROJECT_NAME}_signing" "$CURL_IMAGE" -s -m 5 -H 'Host: web3signer' \
      -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_accounts","params":[]}' \
      http://web3signer:9000 | tr 'A-F' 'a-f')
    for n in DEPLOYER TREASURY OPERATOR ALICE BOB; do
      a="${n}_ADDRESS"; a="$(printf '%s' "${!a}" | tr 'A-F' 'a-f')"
      chk "web3signer holds $n key" "printf '%s' \"\$accts\" | grep -q $a"
    done
    chk "web3signer not published on host" "! curl -s -m 2 http://127.0.0.1:9000/upcheck"
    chk "web3signer unreachable from chain network (F-1)" "! docker run --rm --network ${COMPOSE_PROJECT_NAME}_chain $CURL_IMAGE -s -m 3 http://web3signer:9000/upcheck"
    chk "kafka not published on host" "! (exec 3<>/dev/tcp/127.0.0.1/29092) 2>/dev/null"
    chk "postgres roles" "docker compose exec -T postgres psql -U tela_admin -d tela -tAc \"select count(*) from pg_roles where rolname like 'tela_%'\" | grep -q 4"
    chk "kafka topics" "docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list | grep -c tela.operations | grep -q 3"
    [[ -f deployments/local.json ]] && chk "contracts deployed (TCE code)" "rpc eth_getCode \"[\\\"$TCE_ADDRESS\\\",\\\"latest\\\"]\" | grep -qv '\"0x\"'"
    exit $fail ;;
  *) die "usage: $0 up|down|reset|check|ps|logs <svc>" ;;
esac
