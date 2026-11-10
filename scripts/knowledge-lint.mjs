#!/usr/bin/env node
// Deterministic health check of the factory's explanations (wiki + knowledge pages). No network, no deps.
// Pattern inspired by WeKnora's wiki lint (idea only, rewritten; see docs/registry D-25).
//
//   node scripts/knowledge-lint.mjs                 report + exit 1 on errors
//   node scripts/knowledge-lint.mjs --json          machine-readable report
//   node scripts/knowledge-lint.mjs --update-sources <page.md>...  re-pin the sources of the pages you curated
//   node scripts/knowledge-lint.mjs --update-sources --all        re-pin every page (human decision only)
//   node scripts/knowledge-lint.mjs --root <dir>    lint another tree (tests)
//
// Checks
//   E broken-wiki-link   [[Page]] with no docs/wiki/Page.md
//   E broken-path        `repo/path` cited in backticks that does not exist (known top-level dirs only)
//   E unknown-registry-id  F-/H-/D-/P-NN not present in docs/registry/REGISTRE.md
//   E hypothesis-as-fact a line citing H-NN states it as established ("est confirmé", "c'est un fait", "prouvé")
//   E forbidden-path     cited or declared path is absolute, has "..", escapes the repo (symlink) or looks secret
//                        (never read, hashed or probed: the scripts must not bypass the guard hook — review K-1)
//   E sources-missing    docs/knowledge/sources.json lists a source file that no longer exists
//   W stale-page         a declared source changed since the page was last curated (sha256 differs)
//   W orphan-page        page linked from nowhere (Home and _Sidebar excepted)
//   W unsourced-page     page has no entry in sources.json
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = path.resolve(opt("--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

const WIKI = "docs/wiki";
const KNOWLEDGE = "docs/knowledge";
const SOURCES = `${KNOWLEDGE}/sources.json`;
const REGISTRY = "docs/registry/REGISTRE.md";
const PATH_ROOTS = ["specs/", "docs/", "scripts/", "factory/", "evidence/", ".claude/", ".specify/", "tests/", "schemas/",
  "infra/", "contracts/", "backend/", "adapter/", "indexer/", "frontend/", ".github/"];
const FACT_WORDS = /(est confirmée?|c'est un fait|est prouvée?|établie? comme fait|is confirmed|proven fact)/i;

// Same spirit as .claude/hooks/guard.mjs: secrets are never read, even indirectly through a JSON list.
export const SECRET_PATH = /(^|\/)(\.env(\.[^/]*)?$|[^/]*\.(pem|key|p12|pfx|keystore)$|\.secrets(\/|$)|keystores?(\/|$)|id_(rsa|ed25519|ecdsa)[^/]*$)/i;
/** Absolute path of a repo-relative path, or null if unsafe (absolute, "..", secret-looking, escapes via symlink). */
export function safePath(root, p) {
  if (typeof p !== "string" || !p || path.isAbsolute(p) || /^[a-zA-Z]:/.test(p)) return null;
  const norm = p.replace(/\\/g, "/");
  if (norm.split("/").includes("..") || SECRET_PATH.test(norm)) return null;
  const abs = path.resolve(root, norm);
  if (!abs.startsWith(root + path.sep)) return null;
  if (fs.existsSync(abs) && !fs.realpathSync(abs).startsWith(fs.realpathSync(root) + path.sep)) return null;
  return abs;
}
const exists = (p) => { const a = safePath(ROOT, p); return a !== null && fs.existsSync(a); };
const read = (p) => fs.readFileSync(safePath(ROOT, p), "utf8");
const sha256 = (p) => createHash("sha256").update(fs.readFileSync(safePath(ROOT, p))).digest("hex");

function pages() {
  const out = [];
  for (const dir of [WIKI, KNOWLEDGE]) {
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith(".md")) out.push(`${dir}/${f}`);
  }
  return out.sort();
}

function registryIds() {
  if (!exists(REGISTRY)) return null;
  return new Set([...read(REGISTRY).matchAll(/^\|\s*\**([FHDP]-\d+)/gm)].map((m) => m[1]));
}

function stripCode(md) { // ignore fenced blocks (diagrams, shell) for prose checks
  return md.replace(/```[\s\S]*?```/g, (b) => "\n".repeat(b.split("\n").length - 1));
}

export function lint() {
  const findings = [];
  const add = (sev, rule, file, line, msg) => findings.push({ sev, rule, file, line, msg });
  const all = pages();
  const names = new Set(all.filter((p) => p.startsWith(WIKI)).map((p) => path.basename(p, ".md")));
  const ids = registryIds();
  const sources = exists(SOURCES) ? JSON.parse(read(SOURCES)) : { pages: {} };
  const inbound = new Map(all.map((p) => [p, 0]));

  for (const p of all) {
    const text = read(p);
    const prose = stripCode(text);
    prose.split("\n").forEach((line, i) => {
      const n = i + 1;
      for (const m of line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
        const target = m[1].trim().replace(/ /g, "-");
        if (!names.has(target)) add("E", "broken-wiki-link", p, n, `[[${m[1]}]] : page ${WIKI}/${target}.md absente`);
        else inbound.set(`${WIKI}/${target}.md`, (inbound.get(`${WIKI}/${target}.md`) ?? 0) + (p.endsWith(`/${target}.md`) ? 0 : 1));
      }
      for (const m of line.matchAll(/`([^`\s]+)`/g)) {
        let c = m[1].replace(/[),.;]+$/, "").replace(/:\d+(-\d+)?(,\d+)*$/, "").replace(/#.*$/, "");
        if (!PATH_ROOTS.some((r) => c.startsWith(r))) continue;
        if (/[<>*{}$…]|NNN|\.\.\./.test(c)) continue; // placeholders and globs
        if (safePath(ROOT, c) === null) add("E", "forbidden-path", p, n, `chemin cité refusé (hors dépôt ou sensible) : ${c}`);
        else if (!exists(c)) add("E", "broken-path", p, n, `chemin cité inexistant : ${c}`);
      }
      if (ids) for (const m of line.matchAll(/\b([FHDP]-\d{2,})\b/g)) {
        if (!ids.has(m[1])) add("E", "unknown-registry-id", p, n, `${m[1]} absent du registre`);
      }
      if (/\bH-\d{2,}\b/.test(line) && FACT_WORDS.test(line)) add("E", "hypothesis-as-fact", p, n, "hypothèse H-xx présentée comme un fait");
    });
  }

  for (const p of all) {
    const base = path.basename(p, ".md");
    if (p.startsWith(WIKI) && !["Home", "_Sidebar", "_Footer"].includes(base) && (inbound.get(p) ?? 0) === 0) add("W", "orphan-page", p, 0, "aucune page ne pointe vers celle-ci");
    if (base.startsWith("_") || base === "INDEX" || base === "FLAGS") continue;
    const decl = sources.pages?.[p];
    if (!decl) { add("W", "unsourced-page", p, 0, `aucune source déclarée dans ${SOURCES}`); continue; }
    for (const s of decl.sources ?? []) {
      if (safePath(ROOT, s.path) === null) add("E", "forbidden-path", p, 0, `source refusée (hors dépôt ou sensible) : ${s.path}`);
      else if (!exists(s.path)) add("E", "sources-missing", p, 0, `source déclarée inexistante : ${s.path}`);
      else if (s.sha256 && s.sha256 !== sha256(s.path)) add("W", "stale-page", p, 0, `source modifiée depuis la dernière curation : ${s.path}`);
    }
  }
  const errors = findings.filter((f) => f.sev === "E").length;
  const warnings = findings.length - errors;
  return { pages: all.length, errors, warnings, health: Math.max(0, 100 - 10 * errors - 2 * warnings), findings };
}

function updateSources(only) { // only = page paths to re-pin, or null for --all
  const sources = exists(SOURCES) ? JSON.parse(read(SOURCES)) : { pages: {} };
  let n = 0;
  for (const want of only ?? []) if (!sources.pages?.[want]) { console.error(`[knowledge-lint] page non déclarée dans ${SOURCES} : ${want}`); process.exit(2); }
  for (const [page, decl] of Object.entries(sources.pages ?? {})) {
    if (only && !only.includes(page)) continue;
    for (const s of decl.sources ?? []) {
      if (exists(s.path)) { const h = sha256(s.path); if (s.sha256 !== h) { s.sha256 = h; n++; } }
    }
  }
  sources.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(ROOT, SOURCES), JSON.stringify(sources, null, 2) + "\n");
  console.log(`[knowledge-lint] ${n} empreinte(s) mise(s) à jour dans ${SOURCES}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (flag("--update-sources")) {
    const i = args.indexOf("--update-sources");
    const list = [];
    for (let k = i + 1; k < args.length && !args[k].startsWith("--"); k++) list.push(args[k].replace(/\\/g, "/"));
    if (!flag("--all") && list.length === 0) { console.error("[knowledge-lint] --update-sources exige les pages curées (ou --all, décision humaine)"); process.exit(2); }
    updateSources(flag("--all") ? null : list);
  }
  const r = lint();
  if (flag("--json")) console.log(JSON.stringify(r));
  else {
    for (const f of r.findings) console.log(`${f.sev} ${f.rule.padEnd(20)} ${f.file}${f.line ? ":" + f.line : ""}  ${f.msg}`);
    console.log(`[knowledge-lint] ${r.pages} pages · ${r.errors} erreur(s) · ${r.warnings} avertissement(s) · santé ${r.health}/100`);
  }
  process.exit(r.errors ? 1 : 0);
}
