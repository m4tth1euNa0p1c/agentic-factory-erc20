#!/usr/bin/env bash
# Extrait / installe les modules réutilisables de la factory (voir factory/kit/manifest.json et README §8).
set -euo pipefail
exec node "$(dirname "$0")/../factory/kit/kit.mjs" "$@"
