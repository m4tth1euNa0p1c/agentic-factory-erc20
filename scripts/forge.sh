#!/usr/bin/env bash
# Run forge inside the pinned Foundry container. Usage: scripts/forge.sh <forge args...>
# - Network is disabled by default (sandboxed build/test). The first run downloads solc into the
#   `tela-svm` volume with network enabled (only solc, from binaries.soliditylang.org via svm).
# - FORGE_NETWORK=<docker network> to attach (e.g. tela_signing for deployment through Web3Signer).
. "$(dirname "$0")/lib.sh"
SOLC_VERSION="0.8.30"
VOL="-v tela-svm:/tmp/.svm"

if ! docker run --rm $VOL --entrypoint sh "$FOUNDRY_IMAGE" -c "test -x /tmp/.svm/$SOLC_VERSION/solc-$SOLC_VERSION" >/dev/null 2>&1; then
  log "installing solc $SOLC_VERSION into volume tela-svm (one-time, network enabled)"
  docker run --rm $VOL --user 0 -e HOME=/tmp --entrypoint sh "$FOUNDRY_IMAGE" -c \
    "mkdir -p /tmp/.svm /tmp/p/src && cd /tmp/p && printf 'contract A{}' > src/A.sol && forge build --use $SOLC_VERSION >/dev/null && chmod -R a+rX /tmp/.svm" \
    || die "solc install failed"
fi

NET="--network none"
[[ -n "${FORGE_NETWORK:-}" ]] && NET="--network $FORGE_NETWORK"
# shellcheck disable=SC2086
exec docker run --rm $NET $VOL $(docker_user) \
  -e FOUNDRY_DISABLE_NIGHTLY_WARNING=1 -e HOME=/tmp \
  ${FORGE_ENV:-} \
  -v "$(hostpath "$ROOT/contracts"):/work" -w /work \
  --entrypoint "${FORGE_ENTRYPOINT:-forge}" "$FOUNDRY_IMAGE" "$@"
