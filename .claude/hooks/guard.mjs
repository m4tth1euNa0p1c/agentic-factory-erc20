#!/usr/bin/env node
// PreToolUse guard for the TELA agentic factory — v2 (spec 008 L1, #31).
//
// Decisions: allow (exit 0) · ask = human approval (JSON permissionDecision "ask", gates G4/G6/G8) · deny (exit 2).
// Target profile: FACTORY_TARGET (default "sandbox") → factory/targets/<name>.json. Unknown or unreadable profile
// = most restrictive (infra, remote shell, deploy, reset, broadcast all denied).
// Risk model (idea from the WeKnora audit, rewritten): every action is read | write | destructive; destructive is
// always denied, write/read follow the profile; an approval never widens to a riskier action.
// Defence in depth, NOT a security boundary: regexes over command text (see audit 008 §A1 and guard.test.mjs).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};

// ---------- profile ----------
const TARGET = (process.env.FACTORY_TARGET || "sandbox").trim();
const RESTRICTIVE = { name: `${TARGET} (profil inconnu)`, rpcHosts: [], actions: { reset: "deny", deploy: "deny", broadcast: "deny" },
  infra: { read: "deny", write: "deny" }, remoteShell: "deny" };
let profile = RESTRICTIVE;
if (/^[a-z0-9-]+$/.test(TARGET)) {
  try {
    const p = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "factory", "targets", `${TARGET}.json`), "utf8"));
    profile = { ...RESTRICTIVE, ...p, actions: { ...RESTRICTIVE.actions, ...p.actions }, infra: { ...RESTRICTIVE.infra, ...p.infra } };
  } catch { /* keep RESTRICTIVE */ }
}
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "besu", "web3signer", "0.0.0.0"]);

// ---------- outcomes ----------
const deny = (msg) => {
  process.stderr.write(`[factory-guard] BLOCKED (${profile.name}): ${msg}\n`);
  process.exit(2);
};
const ask = (msg) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask",
    permissionDecisionReason: `[factory-guard] validation humaine requise (${profile.name}) : ${msg}` } }));
  process.exit(0);
};
const decide = (level, msg) => { if (level === "deny") deny(msg); if (level === "ask") ask(msg); if (level !== "allow") deny(`${msg} (décision « ${level} » inconnue)`); };

// ---------- file tools ----------
const SECRET_PATH = /(^|[\\/])(\.env(?!\.example)(\.[\w-]+)?|infra[\\/]\.secrets)([\\/]|$)/i;
const SECRET_GLOB = /(^|[\\/*{,])\.env(?!\.example)/i;
if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Grep", "Glob"].includes(tool)) {
  for (const p of [ti.file_path, ti.path, ti.notebook_path, ti.pattern].filter(Boolean)) if (SECRET_PATH.test(String(p))) deny(`secret path ${p}`);
  if (ti.glob && (SECRET_GLOB.test(String(ti.glob)) || /\.secrets/i.test(String(ti.glob)))) deny(`secret glob ${ti.glob}`);
}

// ---------- web ----------
if (tool === "WebFetch") {
  let host = "";
  try { host = new URL(String(ti.url)).hostname.replace(/^\[|\]$/g, ""); } catch { deny("URL illisible"); }
  if (LOCAL_HOSTS.has(host) || /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|fc|fd|fe80)/i.test(host) || host === "metadata.google.internal")
    deny(`WebFetch vers un hôte interne ${host}`);
}

// ---------- shell ----------
if (tool === "Bash" || tool === "PowerShell") {
  const raw = String(ti.command ?? "");
  // strip git global options so that `git -C . push -f` / `git -c x=y push` look like `git push`
  const cmd = raw.replace(/\bgit((\s+(-C|-c)\s+("[^"]*"|'[^']*'|\S+))|(\s+--(git-dir|work-tree|namespace)=\S+))+/g, "git");

  const always = [
    // secrets
    [/(^|[\s"'=\/(:,;|&])\.env(?!\.example)(\.[\w-]+)?(?=$|[\s"'\/);:,|&])/i, "accès à un fichier .env (secrets)"],
    [/infra[\\/]\.secrets/i, "accessing infra/.secrets"],
    [/\/proc\/(\d+|self|1)\/environ/i, "reading process environment"],
    [/\/secrets\/|\/var\/lib\/web3signer|keystores?\//i, "accessing key material paths"],
    [/(^|[;&|(]\s*)(env|printenv|set)\s*($|[|;&>)])|\b(printenv|export\s+-p|declare\s+-[a-zA-Z]*x|compgen\s+-v)\b/m, "dumping environment"],
    [/--private-key\b|--mnemonic\b|\bPRIVATE_KEY=|--keystore\b/i, "clé privée en ligne de commande"],
    [/\bvault\s+\w/i, "accès au coffre Vault (secrets)"],
    [/\b(gh|glab)\s+(secret|variable)\b|\bgh\s+auth\s+token\b|\bglab\s+auth\s+status\b[^;&|]*(-t|--show-token)/i, "reading forge secrets/variables/tokens"],
    // git / forge integrity
    [/git\s+push\b[^;&|]*(--force\b|--force-with-lease|--force-if-includes|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s\+[\w./:@^~-]+)/i, "force push"],
    [/git\s+push\b[^;&|]*(\s|:)(refs\/heads\/)?(main|master)(\s|$|;|&|\|)/i, "push to main (open a PR from a spec branch)"],
    [/--no-verify\b/, "skipping git hooks"],
    [/git\s+reset\s+--hard\s+origin/i, "hard reset to remote"],
    [/gh\s+pr\s+merge\b[^;&|]*--admin/i, "bypassing branch protection"],
    [/\b(gh|glab)\s+api\b[^;&|]*(\/protection|rulesets|protected_branches|protected_tags|approval_rules|push_rule|\/environments)/i, "changing branch/environment protection"],
    [/\bgh\s+pr\s+review\b[^;&|]*(--approve|-a\b)|\bglab\s+mr\s+approve\b/i, "un agent n'approuve jamais une demande de changement"],
    // host / containers
    [/rm\s+-rf\s+(\/|~|\$HOME|\*)(\s|$)/, "destructive rm"],
    [/\bdocker\s+(compose\s+)?(config|exec|cp|inspect)\b/i, "container introspection (use scripts/*.sh)"],
    [/\bdocker\s+(container\s+)?(exec|cp|inspect)\b/i, "container introspection (use scripts/*.sh)"],
    [/(^|[\s;&|(])(source|\.)\s+["']?[^\s;&|]*\.env\b(?!\.example)/i, "sourcing .env into the agent shell"],
    [/\bdocker\s+run\b[^;&|]*\s-v\s*["']?(\.|\$PWD|\$\(pwd\)|\$ROOT)["']?:/i, "mounting the repository root into a container (use scripts/sandbox-exec.sh)"],
    // non-analysable execution
    [/\|\s*(sudo\s+)?(sh|bash|zsh|dash|pwsh|powershell|iex)\b/i, "exécution d'un flux dans un shell"],
    [/(^|[;&|(]\s*)eval\s/, "eval (commande non analysable)"],
    [/\b(Invoke-Expression|iex)\s/i, "Invoke-Expression (commande non analysable)"],
    // destructive infrastructure: always denied, whatever the profile
    [/\bkubectl\b[^;&|]*\s(delete|drain|replace\s+--force)\b/i, "kubectl destructif"],
    [/\bkubectl\s+config\b/i, "kubectl config (identifiants)"],
    [/\bhelm\b[^;&|]*\s(uninstall|delete)\b/i, "helm destructif"],
    [/\b(terraform|tofu)\b[^;&|]*\s(destroy|state\s+(rm|mv|push)|apply\b[^;&|]*-destroy)\b/i, "terraform destructif"],
  ];
  for (const [re, why] of always) if (re.test(cmd)) deny(why);

  // bare `git push` while the current branch is main
  if (/(^|[;&|]\s*)git\s+push(\s+(-u|--set-upstream)?\s*origin)?\s*($|[;&|])/i.test(cmd)) {
    try {
      const { execSync } = await import("node:child_process");
      const br = execSync("git branch --show-current", { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      if (br === "main" || br === "master") deny("push from main (open a PR from a spec branch)");
    } catch { /* not a git repo: nothing to protect */ }
  }

  // --- profile-dependent decisions (deny-first: collect, then apply the strictest) ---
  const verdicts = [];
  const want = (level, msg) => verdicts.push([level, msg]);

  // environment lifecycle
  if (/scripts\/sandbox\.sh\s+(reset|down)\b|\bdocker\s+compose\b[^;&|]*\sdown\b[^;&|]*\s-v\b/.test(cmd)) want(profile.actions.reset, "réinitialisation d'environnement");
  if (/scripts\/deploy-contracts\.sh|\bforge\s+script\b[^;&|]*--broadcast/.test(cmd)) want(profile.actions.deploy, "déploiement de contrats");

  // signing / broadcasting on a chain
  if (/\bcast\s+(send|publish|mktx|wallet\s+sign)\b|eth_send(Raw)?Transaction|eth_sign\w*|personal_sign/i.test(cmd)) {
    const hosts = [...cmd.matchAll(/\b(?:https?|wss?):\/\/(\[[^\]]+\]|[^\s/:"'?#]+)/gi)].map((m) => m[1].replace(/^\[|\]$/g, "").toLowerCase());
    if (hosts.length === 0) want(profile.name === "sandbox" ? profile.actions.broadcast : "ask", "signature/diffusion sans endpoint explicite");
    for (const h of hosts) {
      if (profile.name !== "sandbox" && LOCAL_HOSTS.has(h)) want("deny", `endpoint de sandbox ${h} utilisé avec le profil ${profile.name}`);
      else if ((profile.rpcHosts ?? []).includes(h)) want(profile.actions.broadcast, `signature/diffusion vers ${h}`);
      else if (profile.name === "sandbox") want("deny", `signature/diffusion vers un hôte hors sandbox ${h}`);
      else want(profile.actions.broadcast === "deny" ? "deny" : "ask", `signature/diffusion vers un hôte non déclaré ${h}`);
    }
  }

  // infrastructure tools: read vs write
  const INFRA = [
    [/\bkubectl\s+(\S+)/i, /^(get|describe|logs|top|explain|version|api-resources|api-versions|cluster-info|events|auth)$/i],
    [/\bhelm\s+(\S+)/i, /^(list|ls|status|get|history|template|lint|show|search|version|diff|dependency)$/i],
    [/\b(?:terraform|tofu)\s+(\S+)/i, /^(plan|validate|fmt|show|version|providers|graph|init)$/i],
    [/\b(?:ansible-playbook|ansible)\b()/i, /(?!)/], // no read-only verb: always "write"
    [/\b(?:aws|az|gcloud)\s+\S+\s+(\S+)/i, /^(describe|list|get|show)/i],
  ];
  for (const [re, readVerbs] of INFRA) {
    const m = cmd.match(re);
    if (!m) continue;
    const verb = (m[1] ?? "").toLowerCase();
    want(verb && readVerbs.test(verb) ? profile.infra.read : profile.infra.write, `infrastructure : ${m[0].trim()}`);
  }

  // remote shells
  if (/(^|[\s;&|(])(ssh|scp|sftp|rsync\s+[^;&|]*:)\s/.test(cmd)) want(profile.remoteShell, "shell distant");

  // forge merges = human gate G4
  if (/\bgh\s+pr\s+merge\b|\bglab\s+mr\s+merge\b/i.test(cmd)) want("ask", "fusion (porte G4)");

  const rank = { deny: 3, ask: 2, allow: 1 };
  verdicts.sort((a, b) => (rank[b[0]] ?? 4) - (rank[a[0]] ?? 4));
  if (verdicts.length) decide(verdicts[0][0], verdicts[0][1]);
}
process.exit(0);
