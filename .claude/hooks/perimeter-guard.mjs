#!/usr/bin/env node
// PreToolUse hook scoped to one factory agent: `node perimeter-guard.mjs <agent>` (declared in the agent's frontmatter).
// Enforces the agent's write perimeter from factory/perimeters.json (spec 008 L1 T006, #31).
// Unknown agent or unreadable map = no write allowed (fail closed). Runs in addition to guard.mjs.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agent = process.argv[2] ?? "";
const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};
const deny = (msg) => { process.stderr.write(`[perimeter-guard:${agent || "?"}] BLOCKED: ${msg}\n`); process.exit(2); };

if (!["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) process.exit(0);

let allowed = [];
try {
  const map = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "factory", "perimeters.json"), "utf8"));
  allowed = map.agents?.[agent] ?? [];
} catch { /* fail closed */ }
if (!allowed.length) deny(`aucun périmètre d'écriture déclaré pour l'agent « ${agent} » (factory/perimeters.json)`);

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());
const p = String(ti.file_path ?? ti.notebook_path ?? "");
const rel = path.relative(root, path.resolve(root, p)).split(path.sep).join("/");
if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) deny(`écriture hors du dépôt : ${p}`);
const ok = allowed.some((a) => (a.endsWith("/") ? rel.startsWith(a) : rel === a));
if (!ok) deny(`écriture hors périmètre (${allowed.join(", ")}) : ${rel}`);
process.exit(0);
