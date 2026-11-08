#!/usr/bin/env bash
# Sync docs/wiki/*.md to the GitHub wiki. Requires the wiki to be initialised once in the web UI
# (GitHub only creates <repo>.wiki.git after a first page is saved) — see docs/HUMAN-ACTIONS.md.
. "$(dirname "$0")/lib.sh"
REPO="${WIKI_REPO:-https://github.com/m4tth1euNa0p1c/agentic-factory-erc20.wiki.git}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
git clone -q "$REPO" "$tmp/wiki" || die "wiki not initialised yet: create any first page in the GitHub UI, then re-run"
cp "$ROOT"/docs/wiki/*.md "$tmp/wiki/"
cd "$tmp/wiki"
git add -A
if git diff --cached --quiet; then log "wiki already up to date"; exit 0; fi
git commit -q -m "docs(wiki): sync from docs/wiki @ $(git -C "$ROOT" rev-parse --short HEAD)"
git push -q
log "wiki published"
