#!/usr/bin/env bash
# Tableau des validations humaines en attente (lecture seule, gh CLI).
# Usage : scripts/human-gates.sh [--json]
# Portes : factory/human-gates.yaml — doc : docs/wiki/Validations-humaines.md
set -euo pipefail
command -v gh >/dev/null || { echo "gh CLI requis" >&2; exit 1; }

issues() { gh issue list --state open --label "$1" --limit 100 --json number,title,url,labels; }
g1=$(issues needs-clarification)
g2=$(issues human-action)
g7=$(gh issue list --state open --label security --limit 100 --json number,title,url,labels)
g4=$(gh pr list --state open --limit 100 --json number,title,url,isDraft,reviewDecision,statusCheckRollup \
      --jq '[.[] | {number,title,url,isDraft,
               checks: ([.statusCheckRollup[]? | (.conclusion // .status)] | group_by(.) | map({(.[0]): length}) | add // {})}]')

if [[ "${1:-}" == "--json" ]]; then
  printf '{"G1_clarification":%s,"G2_human_action":%s,"G4_pull_requests":%s,"G7_security_followups":%s}\n' "$g1" "$g2" "$g4" "$g7"
  exit 0
fi

row() { gh_json="$1"; printf '%s' "$gh_json" | node -e '
  const a = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!a.length) console.log("  (rien)");
  for (const i of a) console.log(`  #${i.number}  ${i.title}${i.isDraft ? "  [brouillon]" : ""}${i.checks ? "  checks=" + JSON.stringify(i.checks) : ""}`);'; }
echo "G1 · Clarifications attendues (label needs-clarification)"; row "$g1"
echo "G2 · Actions humaines (label human-action)";               row "$g2"
echo "G4 · PR en attente de relecture / fusion";                  row "$g4"
echo "G7 · Risques résiduels sécurité suivis (label security)";   row "$g7"
echo "Portes : factory/human-gates.yaml"
