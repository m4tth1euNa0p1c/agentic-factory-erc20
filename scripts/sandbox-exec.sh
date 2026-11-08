#!/usr/bin/env bash
# Execute target-controlled code under the security-audit skill's sandbox rules:
# no network, empty env (allowlist), read-only source, writable scratch only, CPU/mem/pids/time limits.
# Usage: scripts/sandbox-exec.sh <image> <scratch-dir> -- <cmd...>
. "$(dirname "$0")/lib.sh"
image="${1:?image}"; scratch="${2:?scratch dir}"; shift 2; [[ "${1:-}" == "--" ]] && shift
mkdir -p "$scratch"
exec timeout --kill-after=10 "${SANDBOX_TIMEOUT:-600}" docker run --rm \
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 256 --memory 2g --cpus 2 --ulimit fsize=536870912 \
  --user 65534:65534 --env-file /dev/null -e HOME=/scratch -e TMPDIR=/scratch/tmp \
  --tmpfs /tmp:size=256m \
  -v "$(hostpath "$ROOT"):/src:ro" -v "$(hostpath "$scratch"):/scratch" -w /src \
  "$image" "$@"
