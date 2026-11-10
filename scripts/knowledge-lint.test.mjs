// Self-test of knowledge-lint on a synthetic tree (one case per rule). Run: node scripts/knowledge-lint.test.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LINT = path.join(path.dirname(fileURLToPath(import.meta.url)), "knowledge-lint.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "klint-"));
const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), s); };
w("docs/registry/REGISTRE.md", "| ID | x |\n|---|---|\n| H-01 | hyp |\n| D-01 | dec |\n");
w("specs/a.md", "source v1\n");
w("docs/wiki/Home.md", "[[Good]] [[Missing]] [[Bad-Facts]]\n");
w("docs/wiki/Good.md", "Voir `specs/a.md` et D-01.\n```\n`specs/ignored-in-code.md` [[Ignored]]\n```\n");
w("docs/wiki/Bad-Facts.md", "H-01 est confirmé. `specs/nope.md` D-99 `specs/<NNN>/x.md`\n");
w("docs/wiki/Orphan.md", "rien `docs/../.env` `.env`\n");
w(".env", "SECRET=1\n");
w("docs/knowledge/sources.json", JSON.stringify({ pages: {
  "docs/wiki/Home.md": { sources: [{ path: "specs/a.md" }] },
  "docs/wiki/Good.md": { sources: [{ path: "specs/a.md", sha256: "0".repeat(64) }] },
  "docs/wiki/Bad-Facts.md": { sources: [{ path: "specs/gone.md" }, { path: "../outside.txt" }, { path: ".env" }] } } }));

const run = (...a) => { try { return { code: 0, out: execFileSync("node", [LINT, "--root", tmp, "--json", ...a], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status, out: e.stdout }; } };
const r = run(); const rep = JSON.parse(r.out.trim().split("\n").pop());
const has = (rule, file) => rep.findings.some((f) => f.rule === rule && (!file || f.file.endsWith(file)));
const cases = [
  ["exit 1 on errors", r.code === 1],
  ["broken-wiki-link", has("broken-wiki-link", "Home.md")],
  ["broken-path", has("broken-path", "Bad-Facts.md")],
  ["placeholder path ignored", !rep.findings.some((f) => f.msg.includes("<NNN>"))],
  ["code block ignored", !rep.findings.some((f) => f.msg.includes("ignored-in-code") || f.msg.includes("Ignored"))],
  ["unknown-registry-id", has("unknown-registry-id", "Bad-Facts.md")],
  ["known id accepted", !rep.findings.some((f) => f.msg.includes("D-01"))],
  ["hypothesis-as-fact", has("hypothesis-as-fact", "Bad-Facts.md")],
  ["sources-missing", has("sources-missing", "Bad-Facts.md")],
  ["stale-page", has("stale-page", "Good.md")],
  ["orphan-page", has("orphan-page", "Orphan.md")],
  ["unsourced-page", has("unsourced-page", "Orphan.md")],
  ["forbidden source ../", rep.findings.some((f) => f.rule === "forbidden-path" && f.msg.includes("../outside.txt"))],
  ["forbidden secret source", rep.findings.some((f) => f.rule === "forbidden-path" && f.msg.endsWith(": .env"))],
  ["forbidden cited path", rep.findings.some((f) => f.rule === "forbidden-path" && f.file.endsWith("Orphan.md"))],
];
cases.push(["--update-sources without pages refused", run("--update-sources").code === 2]);
run("--update-sources", "docs/wiki/Home.md");
const partial = JSON.parse(run().out.trim().split("\n").pop());
cases.push(["--update-sources <page> leaves other pages stale", partial.findings.some((f) => f.rule === "stale-page" && f.file.endsWith("Good.md"))]);
const sj = fs.readFileSync(path.join(tmp, "docs/knowledge/sources.json"), "utf8");
cases.push(["no hash ever written for a secret", !/".env",\s*"sha256"/.test(sj)]);
run("--update-sources", "docs/wiki/Good.md");
const after = JSON.parse(run().out.trim().split("\n").pop());
cases.push(["--update-sources clears stale", !after.findings.some((f) => f.rule === "stale-page")]);
let fail = 0;
for (const [name, ok] of cases) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) fail++; }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${cases.length - fail}/${cases.length}`);
process.exit(fail ? 1 : 0);
