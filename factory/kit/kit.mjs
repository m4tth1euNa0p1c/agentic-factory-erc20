#!/usr/bin/env node
// TELA Agentic Factory kit: extract the reusable factory modules from this repo and install them elsewhere.
//   list                                         modules and resolved files
//   export  [--modules a,b] [--out DIR]          -> DIR/factory-kit-<sha>/ + .tar.gz with KIT-MANIFEST.json (sha256)
//   install <target> [--modules a,b] [--from KIT_DIR|KIT.tar.gz] [--project NAME] [--force] [--dry-run]
//   status  <target> [--from ...]                locally modified / outdated vs source
// Only git-tracked files are exported; secret-looking paths are refused even if listed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = "factory/kit/manifest.json";
const LOCK = ".factory-kit.lock";
const SECRET = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|\.secrets(\/|$)|infra\/\.secrets\/|evidence\/)/i;

const die = (m) => { console.error(`[factory-kit] ${m}`); process.exit(1); };
const log = (m) => console.log(`[factory-kit] ${m}`);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const git = (args, cwd = ROOT) => execFileSync("git", args, { cwd, encoding: "utf8" });

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force" || a === "--dry-run") o[a.slice(2)] = true;
    else if (a.startsWith("--")) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

function resolveModules(manifest, wanted) {
  const names = wanted ? wanted.split(",").map((s) => s.trim()).filter(Boolean) : ["core"];
  const out = new Set();
  const add = (n) => {
    const m = manifest.modules[n];
    if (!m) die(`module inconnu : ${n} (disponibles : ${Object.keys(manifest.modules).join(", ")})`);
    (m.requires ?? []).forEach(add);
    out.add(n);
  };
  names.forEach(add);
  return [...out];
}

/** Build the kit description from THIS repo: files (git-tracked) + templates. */
function fromRepo(modulesArg) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), "utf8"));
  const modules = resolveModules(manifest, modulesArg);
  const files = new Map(); // relPath -> module
  const templates = new Map(); // templatePath -> destPath
  for (const n of modules) {
    const m = manifest.modules[n];
    const tracked = git(["ls-files", "-z", "--", ...m.paths]).split("\0").filter(Boolean);
    for (const p of m.paths) {
      if (!tracked.some((t) => t === p || t.startsWith(p))) die(`chemin du module ${n} absent ou non suivi par git : ${p}`);
    }
    for (const f of tracked) {
      if (SECRET.test(f)) die(`refus : chemin sensible dans le module ${n} : ${f}`);
      files.set(f, n);
    }
    for (const [t, d] of Object.entries(m.templates ?? {})) templates.set(t, d);
  }
  let sourceSha = "unknown";
  try { sourceSha = git(["rev-parse", "--short", "HEAD"]).trim(); } catch {}
  return {
    sourceSha, modules, templates: Object.fromEntries(templates),
    files: [...files.keys()].sort().map((p) => ({ path: p, module: files.get(p), sha256: sha256(fs.readFileSync(path.join(ROOT, p))) })),
    read: (p) => fs.readFileSync(path.join(ROOT, p)),
  };
}

/** Load an exported kit (directory or .tar.gz). */
function fromKit(src) {
  let dir = path.resolve(src);
  if (/\.(tar\.gz|tgz)$/.test(dir)) {
    // extract in a fresh temp dir using relative names only (GNU tar on Windows reads "C:" as a remote host)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "factory-kit-"));
    fs.copyFileSync(dir, path.join(tmp, "kit.tar.gz"));
    execFileSync("tar", ["-xzf", "kit.tar.gz"], { cwd: tmp });
    const top = fs.readdirSync(tmp).filter((e) => e !== "kit.tar.gz");
    if (top.length !== 1) die("archive de kit inattendue (un seul dossier racine attendu)");
    dir = path.join(tmp, top[0]);
  }
  const km = JSON.parse(fs.readFileSync(path.join(dir, "KIT-MANIFEST.json"), "utf8"));
  for (const f of km.files) {
    const got = sha256(fs.readFileSync(path.join(dir, f.path)));
    if (got !== f.sha256) die(`kit corrompu : ${f.path} (sha256 différent)`);
  }
  return { ...km, read: (p) => fs.readFileSync(path.join(dir, p)) };
}

function safeJoin(base, rel) {
  const p = path.resolve(base, rel);
  if (p !== base && !p.startsWith(base + path.sep)) die(`chemin hors de la cible refusé : ${rel}`);
  return p;
}

function cmdList(o) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), "utf8"));
  for (const [n, m] of Object.entries(manifest.modules)) {
    console.log(`\n■ ${n}${m.requires ? ` (requiert ${m.requires.join(", ")})` : ""}\n  ${m.description}\n  portabilité : ${m.portability}`);
  }
  const kit = fromRepo(o.modules ?? Object.keys(manifest.modules).join(","));
  console.log(`\n${kit.files.length} fichiers (source ${kit.sourceSha}) ; gabarits : ${Object.values(kit.templates).join(", ")}`);
  if (o.verbose) kit.files.forEach((f) => console.log(`  [${f.module}] ${f.path}`));
}

function cmdExport(o) {
  const kit = fromRepo(o.modules);
  const outDir = path.resolve(o.out ?? path.join(ROOT, "dist"));
  const name = `factory-kit-${kit.sourceSha}`;
  const dir = path.join(outDir, name);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const f of kit.files) {
    const dst = safeJoin(dir, f.path);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, kit.read(f.path));
  }
  const { read, ...meta } = kit;
  fs.writeFileSync(path.join(dir, "KIT-MANIFEST.json"), JSON.stringify({ ...meta, exportedAt: new Date().toISOString() }, null, 2) + "\n");
  execFileSync("tar", ["-czf", `${name}.tar.gz`, name], { cwd: outDir });
  log(`modules ${kit.modules.join(", ")} : ${kit.files.length} fichiers`);
  log(`kit : ${path.join(outDir, name + ".tar.gz")} (et dossier ${dir})`);
}

function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function cmdInstall(o) {
  const target = path.resolve(o._[1] ?? die("usage : install <dossier-cible>"));
  if (!fs.existsSync(target)) die(`cible inexistante : ${target}`);
  if (path.resolve(target) === ROOT) die("la cible est le dépôt source");
  const kit = o.from ? fromKit(o.from) : fromRepo(o.modules);
  const vars = { PROJECT: o.project ?? path.basename(target), SOURCE_SHA: kit.sourceSha, MODULES: kit.modules.join(", ") };
  const lock = { sourceSha: kit.sourceSha, modules: kit.modules, installedAt: new Date().toISOString(), files: {} };
  const report = { created: [], unchanged: [], skipped: [], overwritten: [], side: [] };

  const put = (rel, buf, { sideOnConflict = false } = {}) => {
    const dst = safeJoin(target, rel);
    if (fs.existsSync(dst)) {
      const cur = fs.readFileSync(dst);
      if (sha256(cur) === sha256(buf)) { report.unchanged.push(rel); lock.files[rel] = sha256(buf); return; }
      if (!o.force) {
        if (sideOnConflict) {
          const side = rel.replace(/(\.[^./]+)?$/, ".factory-kit$1");
          if (!o["dry-run"]) { fs.mkdirSync(path.dirname(safeJoin(target, side)), { recursive: true }); fs.writeFileSync(safeJoin(target, side), buf); }
          report.side.push(`${rel} → ${side}`);
        } else report.skipped.push(rel);
        return;
      }
      report.overwritten.push(rel);
    } else report.created.push(rel);
    if (!o["dry-run"]) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, buf); }
    lock.files[rel] = sha256(buf);
  };

  for (const f of kit.files) put(f.path, kit.read(f.path));
  for (const [tpl, dest] of Object.entries(kit.templates)) put(dest, Buffer.from(render(kit.read(tpl).toString("utf8"), vars)), { sideOnConflict: true });

  if (!o["dry-run"]) fs.writeFileSync(path.join(target, LOCK), JSON.stringify(lock, null, 2) + "\n");
  for (const [k, v] of Object.entries(report)) if (v.length) log(`${k} (${v.length})${v.length <= 12 ? "\n  " + v.join("\n  ") : ""}`);
  log(`${o["dry-run"] ? "[dry-run] rien écrit" : `installé dans ${target} ; verrou ${LOCK}`}`);
  if (report.side.length) log("des fichiers existaient : versions du kit écrites à côté (*.factory-kit*), à fusionner à la main");
  log("ensuite, dans la cible : node .claude/hooks/guard.test.mjs puis /speckit-constitution");
}

function cmdStatus(o) {
  const target = path.resolve(o._[1] ?? ".");
  const lockPath = path.join(target, LOCK);
  if (!fs.existsSync(lockPath)) die(`pas de ${LOCK} dans ${target}`);
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  let src = null;
  try { src = o.from ? fromKit(o.from) : fromRepo(lock.modules.join(",")); } catch {}
  const srcSha = src ? new Map(src.files.map((f) => [f.path, f.sha256])) : null;
  const rows = { modifiedLocally: [], missing: [], outdated: [], newInSource: [] };
  for (const [rel, h] of Object.entries(lock.files)) {
    const p = path.join(target, rel);
    if (!fs.existsSync(p)) rows.missing.push(rel);
    else if (sha256(fs.readFileSync(p)) !== h) rows.modifiedLocally.push(rel);
    if (srcSha?.has(rel) && srcSha.get(rel) !== h) rows.outdated.push(rel);
  }
  if (srcSha) for (const k of srcSha.keys()) if (!(k in lock.files)) rows.newInSource.push(k);
  log(`installé depuis ${lock.sourceSha} le ${lock.installedAt} ; modules ${lock.modules.join(", ")}${src ? ` ; source actuelle ${src.sourceSha}` : ""}`);
  for (const [k, v] of Object.entries(rows)) log(`${k}: ${v.length}${v.length ? "\n  " + v.join("\n  ") : ""}`);
  if (o.json) console.log(JSON.stringify({ lock: { sourceSha: lock.sourceSha, modules: lock.modules }, sourceSha: src?.sourceSha ?? null, ...rows }));
}

const o = parseArgs(process.argv.slice(2));
const cmd = o._[0];
({ list: cmdList, export: cmdExport, install: cmdInstall, status: cmdStatus }[cmd] ?? (() => {
  console.log("usage : factory-kit.sh list|export|install <cible>|status <cible> [--modules core,blockchain,stack-tela,governance] [--from KIT] [--project NOM] [--force] [--dry-run] [--json]");
  process.exit(cmd ? 1 : 0);
}))(o);
