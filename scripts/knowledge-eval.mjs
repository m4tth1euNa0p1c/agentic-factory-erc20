#!/usr/bin/env node
// Replays tests/knowledge/golden-qa.json: is each piece of knowledge present and findable?
// Usage: node scripts/knowledge-eval.mjs [--json] [--min 0.9]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safePath } from "./knowledge-lint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const min = Number(args[args.indexOf("--min") + 1] ?? NaN);
const qa = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/knowledge/golden-qa.json"), "utf8"));
const norm = (s) => s.normalize("NFC").toLowerCase();

const results = qa.questions.map(({ id, q, expect }) => {
  const missing = [];
  for (const { file, terms } of expect) {
    const p = safePath(ROOT, file); // never read secrets or files outside the repo (review K-1)
    if (p === null) { missing.push(`${file} (chemin refusé)`); continue; }
    if (!fs.existsSync(p)) { missing.push(`${file} (absent)`); continue; }
    const text = norm(fs.readFileSync(p, "utf8"));
    for (const t of terms) if (!text.includes(norm(t))) missing.push(`${file} ∌ « ${t} »`);
  }
  return { id, q, ok: missing.length === 0, missing };
});
const score = results.filter((r) => r.ok).length / results.length;
if (args.includes("--json")) console.log(JSON.stringify({ score, results }));
else {
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id} ${r.q}${r.ok ? "" : "\n     " + r.missing.join("\n     ")}`);
  console.log(`[knowledge-eval] couverture ${(score * 100).toFixed(0)} % (${results.filter((r) => r.ok).length}/${results.length})`);
}
process.exit(Number.isFinite(min) && score < min ? 1 : 0);
