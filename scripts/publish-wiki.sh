#!/usr/bin/env bash
# Sync docs/wiki/*.md to the GitHub wiki. Requires the wiki to be initialised once in the web UI
# (GitHub only creates <repo>.wiki.git after a first page is saved) — see docs/HUMAN-ACTIONS.md.
. "$(dirname "$0")/lib.sh"
REPO="${WIKI_REPO:-https://github.com/m4tth1euNa0p1c/agentic-factory-erc20.wiki.git}"
SHA="$(cd "$ROOT" && git rev-parse --short HEAD)"   # computed from $ROOT before changing directory
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
# clone with a relative path: absolute MSYS paths are not converted for Git for Windows (MSYS_NO_PATHCONV)
(cd "$tmp" && git clone -q "$REPO" wiki) || die "wiki not initialised yet: create any first page in the GitHub UI, then re-run"
cp "$ROOT"/docs/wiki/*.md "$tmp/wiki/"
cd "$tmp/wiki"
git add -A
if git diff --cached --quiet; then log "wiki already up to date"; exit 0; fi
git commit -q -m "docs(wiki): sync from docs/wiki @ $SHA"
git push -q
log "wiki published"
