#!/usr/bin/env bash
# Shared helpers for TELA factory scripts. Source it: . "$(dirname "$0")/lib.sh"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MSYS_NO_PATHCONV=1   # Git Bash on Windows: do not mangle container paths

# Pinned images (single source of truth, see docs/research/veille-2026-11.md)
BESU_IMAGE="hyperledger/besu:26.11.0"
WEB3SIGNER_IMAGE="consensys/web3signer:26.10.2"
FOUNDRY_IMAGE="ghcr.io/foundry-rs/foundry:v1.9.0"
NODE_IMAGE="node:24.13-alpine"
MAVEN_IMAGE="maven:3.9-eclipse-temurin-25"
CURL_IMAGE="curlimages/curl:8.17.0"

SECRETS="$ROOT/infra/.secrets"
GENERATED="$ROOT/infra/generated"

log()  { printf '\033[1;34m[tela]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[tela] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# Host path usable by `docker -v` on Linux, macOS and Git Bash (Windows).
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# Run containers as the invoking user on Linux so bind-mounted files stay owned by us.
docker_user() { if [[ "$(uname -s)" == "Linux" ]]; then printf -- '--user %s:%s' "$(id -u)" "$(id -g)"; fi; }

rand_hex() { openssl rand -hex "${1:-24}"; }

# Load .env into the current shell without echoing it.
load_env() {
  [[ -f "$ROOT/.env" ]] || die ".env missing — run scripts/bootstrap-env.sh first"
  set -a; . "$ROOT/.env"; set +a
}

# Render infra/generated/besu/genesis.json from the template and the (public) validator address.
render_genesis() {
  load_env
  mkdir -p "$GENERATED/besu"
  local tmp; tmp="$(mktemp -d)"; chmod 755 "$tmp"   # Besu image runs as uid 1000 on Linux
  printf '["%s"]' "$BESU_VALIDATOR_ADDRESS" > "$tmp/toEncode.json"; chmod 644 "$tmp/toEncode.json"
  local extra
  extra="$(docker run --rm $(docker_user) -v "$(hostpath "$tmp"):/data:ro" "$BESU_IMAGE" \
    rlp encode --from=/data/toEncode.json --type=QBFT_EXTRA_DATA 2>/dev/null | grep -oE '^0x[0-9a-f]+' | tail -1 || true)"
  rm -rf "$tmp"
  [[ -n "$extra" ]] || die "QBFT extraData encoding failed"
  sed -e "s/__CHAIN_ID__/$TELA_CHAIN_ID/" -e "s/__EXTRA_DATA__/$extra/" \
    "$ROOT/infra/besu/genesis.template.json" > "$GENERATED/besu/genesis.json"
}

# Set or replace KEY=VALUE in .env (no output of the value).
env_set() {
  local key="$1" value="$2" file="$ROOT/.env"
  touch "$file"
  if grep -q "^${key}=" "$file"; then
    local tmp; tmp="$(mktemp)"; grep -v "^${key}=" "$file" > "$tmp"; mv "$tmp" "$file"
  fi
  printf '%s=%s\n' "$key" "$value" >> "$file"
}
