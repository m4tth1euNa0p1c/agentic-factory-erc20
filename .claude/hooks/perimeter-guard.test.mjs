// node .claude/hooks/perimeter-guard.test.mjs — per-agent write perimeters (factory/perimeters.json)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "perimeter-guard.mjs");
const ROOT = path.resolve(path.dirname(HOOK), "..", "..");
const call = (agent, tool_name, file_path) =>
  spawnSync("node", [HOOK, agent], { input: JSON.stringify({ tool_name, tool_input: { file_path } }), env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } }).status;

const cases = [
  ["backend-java", "Edit", "backend/src/main/java/X.java", 0],
  ["backend-java", "Write", "adapter/src/main.ts", 2],
  ["backend-java", "Write", ".github/workflows/ci.yml", 2],
  ["blockchain-adapter", "Write", "adapter/src/signer.ts", 0],
  ["smart-contracts", "Write", "contracts/src/Tela.sol", 0],
  ["smart-contracts", "Write", "contracts/../backend/x", 2],
  ["network-devops", "Write", "compose.yaml", 0],
  ["network-devops", "Write", "compose.yaml.bak", 2],
  ["network-devops", "Edit", ".github/workflows/ci.yml", 0],
  ["verifier", "Write", "evidence/002/x/REPORT.md", 0],
  ["verifier", "Edit", "backend/src/x.java", 2],
  ["orchestrator", "Edit", "specs/008-talan-readiness/tasks.md", 0],
  ["orchestrator", "Edit", "docs/registry/REGISTRE.md", 0],
  ["orchestrator", "Write", "backend/pom.xml", 2],
  ["security-auditor", "Write", "evidence/security/pr40.md", 0],
  ["security-auditor", "Write", "scripts/x.sh", 2],
  ["unknown-agent", "Write", "README.md", 2],
  ["backend-java", "Read", "adapter/src/main.ts", 0],
  ["backend-java", "Write", path.join(ROOT, "backend", "abs.txt"), 0],
  ["backend-java", "Write", "C:/Windows/x.txt", 2],
];
let fail = 0;
for (const [agent, tool, file, want] of cases) {
  const got = call(agent, tool, file);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} exit=${got} want=${want} ${agent} ${tool} ${file}`);
}
console.log(`${cases.length - fail}/${cases.length}`);
process.exit(fail ? 1 : 0);
