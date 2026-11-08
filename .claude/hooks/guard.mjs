#!/usr/bin/env node
// PreToolUse guard for the TELA agentic factory.
// Blocks (exit 2) access to secrets and dangerous git/shell operations.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};

const SECRET_PATH = /(^|[\\/])(\.env(?!\.example)(\.[\w-]+)?|infra[\\/]\.secrets)([\\/]|$)/i;
const deny = (msg) => {
  process.stderr.write(`[factory-guard] BLOCKED: ${msg}\n`);
  process.exit(2);
};

const paths = [ti.file_path, ti.path, ti.notebook_path, ti.pattern].filter(Boolean);
if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Grep", "Glob"].includes(tool)) {
  for (const p of paths) if (SECRET_PATH.test(String(p))) deny(`secret path ${p}`);
}

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(ti.command ?? "");
  const rules = [
    [/(cat|type|less|more|head|tail|Get-Content|gc|sed|awk|grep|rg)\b[^|;&]*(\s|["'\/\\])\.env(?!\.example)\b/i, "reading .env"],
    [/infra[\\/]\.secrets/i, "accessing infra/.secrets"],
    [/git\s+push\b[^;&|]*(--force\b|-f\b|--force-with-lease)/i, "force push"],
    [/--no-verify\b/, "skipping git hooks"],
    [/git\s+reset\s+--hard\s+origin/i, "hard reset to remote"],
    [/rm\s+-rf\s+(\/|~|\$HOME|\*)(\s|$)/, "destructive rm"],
    [/(printenv|env)\s*$|\bset\s*$/m, "dumping environment"],
    [/gh\s+(secret|auth\s+token)/i, "reading GitHub secrets/tokens"],
  ];
  for (const [re, why] of rules) if (re.test(cmd)) deny(why);
}
process.exit(0);
