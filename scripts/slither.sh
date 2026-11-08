#!/usr/bin/env bash
# Static analysis of contracts/src with Slither 0.11.6 in a network-less, read-only container,
# using the solc cached by forge.sh. Only src/ and lib/ are mounted (no foundry.toml → plain solc mode).
# Output: evidence/<id>/slither-<Contract>.json. Exit != 0 if any Medium/High finding.
. "$(dirname "$0")/lib.sh"
SLITHER_IMAGE="ghcr.io/crytic/slither:0.11.6"
id="${1:-slither}"
out="$ROOT/evidence/$id"; mkdir -p "$out"
"$ROOT/scripts/forge.sh" build >/dev/null   # ensures solc 0.8.30 is cached in tela-svm
C="$(hostpath "$ROOT/contracts")"
rc=0
for f in "$ROOT"/contracts/src/*.sol; do
  name="$(basename "$f" .sol)"
  set +e
  docker run --rm --network none --read-only --tmpfs /tmp/w:mode=1777 --tmpfs /w/crytic-export:mode=1777 $(docker_user) -e HOME=/tmp/w \
    -v tela-svm:/tmp/.svm:ro -v "$C/src:/w/src:ro" -v "$C/lib:/w/lib:ro" -w /w \
    --entrypoint slither "$SLITHER_IMAGE" "src/$name.sol" \
      --solc /tmp/.svm/0.8.30/solc-0.8.30 \
      --solc-remaps "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/" \
      --solc-args "--evm-version cancun --optimize" \
      --filter-paths "lib/" --exclude-informational --exclude-optimization \
      --fail-medium --json - > "$out/slither-$name.json" 2>"$out/slither-$name.log"
  r=$?; set -e
  log "slither $name exit=$r"
  [[ $r -eq 0 ]] || rc=1
done
exit $rc
