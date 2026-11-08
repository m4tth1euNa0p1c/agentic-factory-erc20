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
  [{ tool_name: "Bash", tool_input: { command: "git push -u origin main" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "git push origin HEAD:main" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "git push -u origin 002-validation" } }, 0],
  [{ tool_name: "Bash", tool_input: { command: "gh pr merge 21 --admin --merge" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "gh api -X DELETE repos/x/y/branches/main/protection" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "bash scripts/sandbox.sh up" } }, 0],
  [{ tool_name: "Bash", tool_input: { command: "gh secret list" } }, 2],
  // security review M-1 regressions
  [{ tool_name: "Bash", tool_input: { command: "docker compose config" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "docker compose exec -T besu cat /secrets/key" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "docker exec tela-web3signer-1 ls" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "docker inspect tela-postgres-1" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "cat /proc/1/environ" } }, 2],
  [{ tool_name: "Bash", tool_input: { command: `source ${dot} && echo $X` } }, 2],
  [{ tool_name: "Bash", tool_input: { command: `. ./${dot}` } }, 2],
  [{ tool_name: "Bash", tool_input: { command: 'docker run --rm -v "$PWD:/x" alpine ls /x' } }, 2],
  [{ tool_name: "Bash", tool_input: { command: "docker compose logs --tail=50 besu" } }, 0],
  [{ tool_name: "Bash", tool_input: { command: "docker compose ps" } }, 0],
  [{ tool_name: "Bash", tool_input: { command: "tests/e2e/run.sh 001-contracts" } }, 0],
];
let fail = 0;
for (const [input, want] of cases) {
  const r = spawnSync(process.execPath, [guard], { input: JSON.stringify(input) });
  const ok = r.status === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} exit=${r.status} want=${want} ${JSON.stringify(input.tool_input)}`);
}
process.exit(fail ? 1 : 0);
