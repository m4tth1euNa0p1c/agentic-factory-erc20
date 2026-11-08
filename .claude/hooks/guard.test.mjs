// node .claude/hooks/guard.test.mjs  — regression tests for guard.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const guard = join(dirname(fileURLToPath(import.meta.url)), "guard.mjs");
const dot = "." + "env"; // avoid tripping the guard on this file's own command line
const cases = [
  [{ tool_name: "Read", tool_input: { file_path: `C:/x/${dot}` } }, 2],
  [{ tool_name: "Read", tool_input: { file_path: `C:/x/${dot}.local` } }, 2],
  [{ tool_name: "Read", tool_input: { file_path: `C:/x/${dot}.example` } }, 0],
  [{ tool_name: "Read", tool_input: { file_path: "infra/.secrets/besu/key" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: `cat ${dot}` } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "git push --force origin main" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "git commit --no-verify -m x" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "git push -u origin main" } }, 0],
  [{ tool_name: "Bash", tool_input: { command: "bash scripts/sandbox.sh up" } }, 0],
  [{ tool_name: "Bash", tool_input: { command: "gh secret list" } }, 2],
];
let fail = 0;
for (const [input, want] of cases) {
  const r = spawnSync(process.execPath, [guard], { input: JSON.stringify(input) });
  const ok = r.status === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} exit=${r.status} want=${want} ${JSON.stringify(input.tool_input)}`);
}
process.exit(fail ? 1 : 0);
