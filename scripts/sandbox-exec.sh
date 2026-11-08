#!/usr/bin/env bash
# Execute target-controlled code under the security-audit skill's sandbox rules:
# no network, empty env (allowlist), read-only source, writable scratch only, CPU/mem/pids/time limits.
# The source is a CLEAN COPY of committed files (git archive HEAD): .env, infra/.secrets and any
# untracked/ignored file are never visible to target code (security review M-2).
# Usage: scripts/sandbox-exec.sh <image> <scratch-dir> -- <cmd...>
. "$(dirname "$0")/lib.sh"
image="${1:?image}"; scratch="${2:?scratch dir}"; shift 2; [[ "${1:-}" == "--" ]] && shift
case "$(cd "$(dirname "$scratch")" 2>/dev/null && pwd)/" in "$ROOT"/*) die "scratch dir must be outside the repository";; esac
mkdir -p "$scratch/src" "$scratch/work"
git -C "$ROOT" archive --format=tar HEAD | tar -x -C "$scratch/src"
for f in .env infra/.secrets infra/generated; do [[ -e "$scratch/src/$f" ]] && die "refusing: $f present in source copy"; done
exec timeout --kill-after=10 "${SANDBOX_TIMEOUT:-600}" docker run --rm \
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 256 --memory 2g --cpus 2 --ulimit fsize=536870912 \
  --user 65534:65534 --env-file /dev/null -e HOME=/scratch -e TMPDIR=/scratch/tmp \
  --tmpfs /tmp:size=256m \
  -v "$(hostpath "$scratch/src"):/src:ro" -v "$(hostpath "$scratch/work"):/scratch" -w /src \
  "$image" "$@"
