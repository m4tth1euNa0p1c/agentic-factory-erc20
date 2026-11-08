#!/bin/sh
# Entrypoint. With ADAPTER_SUPERVISE=1 (SC-002 crash campaign) the node process is restarted in-container
# after each real crash (exit 137) instead of relying on Docker restart backoff.
if [ "${ADAPTER_SUPERVISE:-0}" = "1" ]; then
  while :; do node src/main.ts; echo "{\"level\":\"warn\",\"msg\":\"adapter process exited code=$? -> restart\"}"; sleep 0.5; done
fi
exec node src/main.ts
