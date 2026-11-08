#!/usr/bin/env bash
# Usage: tests/e2e/run.sh <scenario>   (scenarios in tests/e2e/scenarios/<name>.sh)
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
name="${1:?usage: run.sh <scenario> (available: $(ls "$dir/scenarios" | sed 's/\.sh$//' | tr '\n' ' '))}"
exec bash "$dir/scenarios/$name.sh" "${@:2}"
