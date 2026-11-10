// Tests of the knowledge-curator perimeter hook. Run: node .claude/hooks/knowledge-curator-guard.test.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "knowledge-curator-guard.mjs");
const ROOT = path.resolve(path.dirname(HOOK), "..", "..");
const call = (tool_name, tool_input) =>
  spawnSync("node", [HOOK], { input: JSON.stringify({ tool_name, tool_input }), env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } }).status;

const cases = [
  // allowed
  ["Write", { file_path: "docs/wiki/Architecture.md" }, 0],
  ["Edit", { file_path: path.join(ROOT, "docs/knowledge/sources.json") }, 0],
  ["Write", { file_path: "tests/knowledge/golden-qa.json" }, 0],
  ["Bash", { command: "node scripts/knowledge-lint.mjs" }, 0],
  ["Bash", { command: "node scripts/knowledge-lint.mjs --update-sources docs/wiki/Home.md docs/wiki/Securite.md" }, 0],
  ["Bash", { command: "node scripts/knowledge-eval.mjs --min 1" }, 0],
  ["Bash", { command: "git diff --name-only main...HEAD" }, 0],
  ["Read", { file_path: "specs/002-tce-transfer-e2e/spec.md" }, 0],
  // blocked: writes outside the perimeter
  ["Write", { file_path: "docs/registry/REGISTRE.md" }, 2],
  ["Edit", { file_path: "scripts/knowledge-lint.mjs" }, 2],
  ["Write", { file_path: ".github/workflows/ci.yml" }, 2],
  ["Write", { file_path: "docs/wiki/../registry/REGISTRE.md" }, 2],
  ["Write", { file_path: "../outside.md" }, 2],
  // blocked: commands
  ["Bash", { command: "node scripts/knowledge-lint.mjs --update-sources --all" }, 2],
  ["Bash", { command: "scripts/publish-wiki.sh" }, 2],
  ["Bash", { command: "gh issue create -t x" }, 2],
  ["Bash", { command: "node scripts/knowledge-lint.mjs; rm -rf docs" }, 2],
  ["Bash", { command: "node scripts/knowledge-lint.mjs > docs/registry/REGISTRE.md" }, 2],
  ["Bash", { command: "git push origin HEAD" }, 2],
  ["Bash", { command: "git log $(cat x)" }, 2],
  ["WebFetch", { url: "https://example.com" }, 2],
];
let fail = 0;
for (const [tool, input, want] of cases) {
  const got = call(tool, input);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} exit=${got} want=${want} ${tool} ${JSON.stringify(input)}`);
}
console.log(`${cases.length - fail}/${cases.length}`);
process.exit(fail ? 1 : 0);
