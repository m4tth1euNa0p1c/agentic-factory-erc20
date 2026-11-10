#!/usr/bin/env node
// PreToolUse hook scoped to one factory agent: `node perimeter-guard.mjs <agent>` (declared in the agent's frontmatter).
// Enforces the agent's write perimeter from factory/perimeters.json (spec 008 L1 T006, #31; review PR #41 F3/F13).
//  - file tools: every path field must be inside the perimeter (symlinked parents resolved)
//  - shell: an agent may never write the factory's control files (rules, hooks, settings, profiles, perimeters)
// Unknown agent or unreadable map = no write allowed (fail closed). Runs in addition to guard.mjs.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agent = process.argv[2] ?? "";
const deny = (msg) => { process.stderr.write(`[perimeter-guard:${agent || "?"}] BLOCKED: ${msg}\n`); process.exit(2); };
let input;
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); if (input === null || typeof input !== "object") throw 0; } catch { deny("unreadable hook input"); }
const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};
const CONTROL = /(^|[\s"'=\/\\])(\.claude[\\/]|factory[\\/](targets[\\/]|perimeters\.json|human-gates\.yaml)|CLAUDE\.md\b)/i;

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(ti.command ?? "").replace(/["']/g, "");
  if (CONTROL.test(cmd) && /(>|\btee\b|\bsed\s+-i|\b(cp|mv|install|rm|truncate|ln|Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|Remove-Item|New-Item)\b|writeFile)/i.test(cmd))
    deny("un agent ne modifie jamais les fichiers de règles de la factory (.claude/, factory/targets, factory/perimeters.json, factory/human-gates.yaml, CLAUDE.md)");
  process.exit(0);
}
if (!["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) process.exit(0);

let allowed = [];
try {
  const map = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "factory", "perimeters.json"), "utf8"));
  allowed = map.agents?.[agent] ?? [];
} catch { /* fail closed */ }
if (!allowed.length) deny(`aucun périmètre d'écriture déclaré pour l'agent « ${agent} » (factory/perimeters.json)`);

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());
const realRoot = existsSync(root) ? realpathSync(root) : root;
const fields = [ti.file_path, ti.notebook_path, ti.path].filter((v) => v !== undefined && v !== null && v !== "");
if (!fields.length) deny("aucun chemin cible");
for (const p of fields.map(String)) {
  const abs = path.resolve(root, p);
  let rel = path.relative(root, abs).split(path.sep).join("/");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) deny(`écriture hors du dépôt : ${p}`);
  // resolve the deepest existing parent so that a symlinked directory cannot redirect the write
  let probe = abs;
  while (!existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const realProbe = realpathSync(probe);
  if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) deny(`écriture hors du dépôt via un lien : ${p}`);
  if (CONTROL.test(` ${rel}`)) deny(`fichier de règles de la factory : ${rel}`);
  if (!allowed.some((a) => (a.endsWith("/") ? rel.startsWith(a) : rel === a))) deny(`écriture hors périmètre (${allowed.join(", ")}) : ${rel}`);
}
process.exit(0);
