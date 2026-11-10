#!/usr/bin/env node
// PreToolUse hook scoped to the knowledge-curator agent (declared in its frontmatter).
// Turns the agent's prose perimeter into an enforced one (security review K-2, PR #40):
//   - Write/Edit/MultiEdit/NotebookEdit only under docs/wiki/, docs/knowledge/, tests/knowledge/
//   - Bash only an exact allowlist (no chaining, redirection, substitution)
// Runs in addition to .claude/hooks/guard.mjs (secrets, force-push, ...), never instead of it.
import { readFileSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};
const root = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());
const deny = (msg) => { process.stderr.write(`[knowledge-curator-guard] BLOCKED: ${msg}\n`); process.exit(2); };

const WRITABLE = ["docs/wiki/", "docs/knowledge/", "tests/knowledge/"];

if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
  const p = String(ti.file_path ?? ti.notebook_path ?? "");
  const abs = path.resolve(root, p);
  const rel = path.relative(root, abs).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) deny(`écriture hors du dépôt : ${p}`);
  if (!WRITABLE.some((w) => rel.startsWith(w))) deny(`écriture hors périmètre (${WRITABLE.join(", ")}) : ${rel}`);
}

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(ti.command ?? "").trim();
  if (/[;&|`<>]|\$\(|\n/.test(cmd)) deny("chaînage, redirection ou substitution interdits pour cet agent");
  const PAGE = String.raw`docs/(wiki|knowledge)/[\w.\-]+\.md`;
  const ALLOW = [
    /^node scripts\/knowledge-lint\.mjs( --json)?$/,
    new RegExp(String.raw`^node scripts/knowledge-lint\.mjs --update-sources( ${PAGE})+$`),
    /^node scripts\/knowledge-lint\.test\.mjs$/,
    /^node scripts\/knowledge-eval\.mjs( --json)?( --min (0(\.\d+)?|1))?$/,
    /^git (status|diff|log)( [\w./@^~:=\-]+)*$/,
  ];
  if (!ALLOW.some((re) => re.test(cmd))) deny(`commande hors liste autorisée : ${cmd}`);
}

if (tool === "WebFetch" || tool.startsWith("mcp__")) deny(`outil ${tool} non autorisé pour le curateur`);
process.exit(0);
