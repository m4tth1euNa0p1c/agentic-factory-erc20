#!/usr/bin/env bash
# Generates every local secret and identifier needed by the TELA sandbox:
#   - Besu validator node key, QBFT genesis (extraData)
#   - Encrypted V3 keystores for deployer/treasury/operator/alice/bob, Web3Signer key configs
#   - Postgres role passwords, Kafka cluster id
# Writes .env (gitignored) and infra/.secrets/ (gitignored). Prints only public data (addresses).
# Usage: scripts/bootstrap-env.sh [--force]
. "$(dirname "$0")/lib.sh"

if [[ -f "$ROOT/.env" && "${1:-}" != "--force" ]]; then
  log ".env already exists — nothing to do (use --force to regenerate; this WIPES the chain)"; exit 0
fi
command -v docker >/dev/null || die "docker required"
command -v openssl >/dev/null || die "openssl required"

rm -rf "$SECRETS" "$GENERATED"
mkdir -p "$SECRETS/besu" "$SECRETS/web3signer/keys" "$SECRETS/web3signer/keystores" "$GENERATED/besu"
: > "$ROOT/.env"; chmod 600 "$ROOT/.env" 2>/dev/null || true

CHAIN_ID=48151
env_set COMPOSE_PROJECT_NAME tela
env_set TELA_CHAIN_ID "$CHAIN_ID"

# ---------- 1. Besu validator key + QBFT extraData ----------
log "Generating Besu validator key"
BESU_DATA="$(hostpath "$SECRETS/besu")"
# Besu 26.x no longer auto-creates the node key: generate 32 random bytes (valid secp256k1 scalar w.p. ~1-2^-128)
printf '0x%s' "$(openssl rand -hex 32)" > "$SECRETS/besu/key"
docker run --rm $(docker_user) -v "$BESU_DATA:/data" "$BESU_IMAGE" \
  --data-path=/data public-key export-address --to=/data/address >/dev/null 2>&1 \
  || die "besu key generation failed"
VALIDATOR="$(tr -d '\r\n' < "$SECRETS/besu/address")"
env_set BESU_VALIDATOR_ADDRESS "$VALIDATOR"
render_genesis   # also re-run by `sandbox.sh up`, so template changes apply without regenerating keys

# ---------- 2. Signing accounts (keystores held only by Web3Signer) ----------
KS="$(hostpath "$SECRETS/web3signer/keystores")"
for name in deployer treasury operator alice bob; do
  log "Generating keystore for $name"
  pw="$(rand_hex 24)"
  printf '%s' "$pw" > "$SECRETS/web3signer/keystores/$name.password"
  out="$(docker run --rm $(docker_user) --entrypoint cast -v "$KS:/ks" "$FOUNDRY_IMAGE" \
          wallet new /ks "$name" --unsafe-password "$pw" 2>/dev/null)" || die "cast wallet new failed"
  addr="$(printf '%s' "$out" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)"
  [[ -n "$addr" ]] || die "could not parse address for $name"
  cat > "$SECRETS/web3signer/keys/$name.yaml" <<YAML
type: "file-keystore"
keyType: "SECP256K1"
keystoreFile: "/var/lib/web3signer/keystores/$name"
keystorePasswordFile: "/var/lib/web3signer/keystores/$name.password"
YAML
  upper="$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')"
  env_set "${upper}_ADDRESS" "$addr"
  unset pw
done

# ---------- 3. Data plane secrets ----------
for role in POSTGRES_SUPERUSER BACKEND_DB PONDER_DB ADAPTER_DB; do env_set "${role}_PASSWORD" "$(rand_hex 24)"; done
env_set KAFKA_CLUSTER_ID "$(openssl rand -base64 16 | tr '+/' '-_' | tr -d '=\n')"

# ---------- 4. Placeholders filled by scripts/deploy-contracts.sh ----------
for c in TCE TCD TIF SWAP; do env_set "${c}_ADDRESS" ""; done

log "Done. Public identifiers:"
grep -E '_(ADDRESS|CHAIN_ID)=' "$ROOT/.env" | grep -v '=$' >&2
log "Secrets written to infra/.secrets/ (gitignored). Never commit or print them."
