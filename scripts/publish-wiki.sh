#!/usr/bin/env bash
# Sync docs/wiki/*.md to the GitHub wiki. Requires the wiki to be initialised once in the web UI
# (GitHub only creates <repo>.wiki.git after a first page is saved) — see docs/HUMAN-ACTIONS.md.
. "$(dirname "$0")/lib.sh"
REPO="${WIKI_REPO:-https://github.com/m4tth1euNa0p1c/agentic-factory-erc20.wiki.git}"
SHA="$(cd "$ROOT" && git rev-parse --short HEAD)"   # computed from $ROOT before changing directory
# Publication guards (security review K-3, PR #40): the wiki is outside the PR/CI path, so check here.
( cd "$ROOT" && git diff --quiet HEAD -- docs/wiki && [ -z "$(git ls-files --others --exclude-standard -- docs/wiki)" ] ) \
  || die "docs/wiki has uncommitted changes: commit them (they must go through review) before publishing"
BRANCH="$(cd "$ROOT" && git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" && "${WIKI_ALLOW_BRANCH:-}" != "1" ]]; then
  die "publishing from '$BRANCH': only main is published by default (set WIKI_ALLOW_BRANCH=1 to publish a reviewed branch on purpose)"
fi
command -v docker >/dev/null || die "docker required for the gitleaks scan of docs/wiki"
docker run --rm -v "$(hostpath "$ROOT/docs/wiki"):/wiki:ro" "${GITLEAKS_IMAGE:-zricethezav/gitleaks:v8.30.1}" \
  dir /wiki --redact --no-banner --exit-code 1 >/dev/null 2>&1 \
  || die "gitleaks found a potential secret in docs/wiki (run it manually for details); nothing published"
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
