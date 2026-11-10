#!/usr/bin/env node
// PreToolUse guard for the TELA agentic factory — v2.1 (spec 008 L1, #31; security review of PR #41 F1–F14).
//
// Decisions: allow (exit 0) · ask = human approval (JSON permissionDecision "ask", gates G4/G6/G8) · deny (exit 2).
// Target profile: FACTORY_TARGET (default "sandbox") → factory/targets/<name>.json. Unknown/unreadable/mismatched
// profile = most restrictive. Risk model (idea from the WeKnora audit, rewritten): read | write | destructive;
// destructive always denied; read/write follow the profile; an approval never widens to a riskier action.
// In bypassPermissions mode an "ask" cannot reach a human: outside the sandbox it becomes "deny" (F10).
// Defence in depth, NOT a security boundary: regexes over command text. Known residual bypasses (variables,
// aliases, code executed by interpreters such as `node -e execSync(...)`) are documented in guard.test.mjs.
import { readFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let input;
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("not an object"); }
catch { process.stderr.write("[factory-guard] BLOCKED: unreadable hook input\n"); process.exit(2); } // fail closed (F11)
const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};
const BYPASS = input.permission_mode === "bypassPermissions";

// ---------- profile ----------
const TARGET = (process.env.FACTORY_TARGET || "sandbox").trim();
const RESTRICTIVE = { name: `${TARGET} (profil inconnu)`, rpcHosts: [], actions: { reset: "deny", deploy: "deny", broadcast: "deny" },
  infra: { read: "deny", write: "deny" }, remoteShell: "deny" };
let profile = RESTRICTIVE;
if (/^[a-z0-9-]+$/.test(TARGET)) {
  try {
    const p = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "factory", "targets", `${TARGET}.json`), "utf8"));
    if (p.name === TARGET) profile = { ...RESTRICTIVE, ...p, actions: { ...RESTRICTIVE.actions, ...p.actions }, infra: { ...RESTRICTIVE.infra, ...p.infra } };
  } catch { /* keep RESTRICTIVE */ }
}
const SANDBOX = profile.name === "sandbox";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "::", "0.0.0.0", "besu", "web3signer", "postgres", "kafka", "ponder",
  "indexer", "backend", "adapter", "frontend", "host.docker.internal", "metadata.google.internal", "metadata"]);
// Control files: the rules themselves. Protected from agents in CI or on a real target (the local sandbox session is the human's).
const CONTROL = /(^|[\s"'=\/\\])(\.claude[\\/]|factory[\\/](targets[\\/]|perimeters\.json|human-gates\.yaml)|CLAUDE\.md\b)/i;
const PROTECT_CONTROL = Boolean(process.env.CI) || !SANDBOX;

// ---------- outcomes ----------
const deny = (msg) => { process.stderr.write(`[factory-guard] BLOCKED (${profile.name}): ${msg}\n`); process.exit(2); };
const ask = (msg) => {
  if (BYPASS && !SANDBOX) deny(`${msg} — validation humaine impossible en mode bypass sur une cible réelle`);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask",
    permissionDecisionReason: `[factory-guard] validation humaine requise (${profile.name}) : ${msg}` } }));
  process.exit(0);
};
const decide = (level, msg) => { if (level === "allow") return; if (level === "ask") ask(msg); deny(level === "deny" ? msg : `${msg} (décision « ${level} » inconnue)`); };

// ---------- helpers ----------
function hostIsInternal(h) {
  let host = String(h).toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const mapped = host.match(/^::ffff:(.+)$/);
  if (mapped) {
    host = mapped[1];
    const hex = host.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) { const a = parseInt(hex[1], 16), b = parseInt(hex[2], 16); host = `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`; }
  }
  if (LOCAL_HOSTS.has(host) || host.endsWith(".internal") || host.endsWith(".local") || !host.includes(".") && net.isIP(host) === 0) return true;
  if (net.isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIP(host) === 6) return host === "::" || host === "::1" || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
  return false;
}

// ---------- file tools ----------
const SECRET_PATH = /(^|[\\/])(\.env(?!\.example)(\.[\w-]+)?|infra[\\/]+\.secrets)([\\/]|$)/i;
const SECRET_GLOB = /(^|[\\/*{,])\.en[v?*[]/i;
if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Grep", "Glob"].includes(tool)) {
  const paths = [ti.file_path, ti.path, ti.notebook_path, ti.pattern].filter(Boolean).map(String);
  for (const p of paths) if (SECRET_PATH.test(p)) deny(`secret path ${p}`);
  if (ti.glob && (SECRET_GLOB.test(String(ti.glob)) || /\.secrets/i.test(String(ti.glob)))) deny(`secret glob ${ti.glob}`);
  if (PROTECT_CONTROL && ["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool))
    for (const p of paths) if (CONTROL.test(` ${p}`)) deny(`modification d'un fichier de règles de la factory : ${p}`);
}

// ---------- web ----------
if (tool === "WebFetch") {
  let host = "";
  try { host = new URL(String(ti.url)).hostname; } catch { deny("URL illisible"); }
  if (hostIsInternal(host)) deny(`WebFetch vers un hôte interne ${host}`);
}

// ---------- shell ----------
if (tool === "Bash" || tool === "PowerShell") {
  const raw = String(ti.command ?? "");
  // 1. drop free-text arguments (commit messages, PR bodies) unless they contain command substitution
  const text = raw.replace(/(\s)(-m|--message|--body|-b|--title|-t|--subject|--notes)(\s+|=)("((?:[^"\\]|\\.)*)"|'([^']*)')/g,
    (all, sp, flag, sep, q, dq) => (dq !== undefined && /\$\(|`/.test(dq) ? all : `${sp}${flag} _TEXT_`));
  // 2. normalised variants: git global options removed; quotes / backslash-escapes removed (`'kube''ctl'`, `k\ubectl`)
  const gitNorm = (s) => s.replace(/\bgit((\s+(-C|-c)\s+("[^"]*"|'[^']*'|\S+))|(\s+--(git-dir|work-tree|namespace|exec-path)=\S+)|(\s+(--no-pager|-P|--paginate|-p|--bare|--literal-pathspecs)))+(?=\s)/g, "git");
  const a = gitNorm(text);
  const b = gitNorm(text.replace(/["']/g, "").replace(/\\(?=[A-Za-z])/g, ""));
  const test = (re) => re.test(a) || re.test(b) || re.test(text); // text keeps git -c options (inline aliases, hooks path)

  const always = [
    // secrets
    [/(^|[\s"'=\/(:,;|&\\])\.env(?!\.example)(\.[\w-]+)?(?=$|[\s"'\/\\);:,|&])/i, "accès à un fichier .env (secrets)"],
    [/(^|[\s"'=\/(\\])\.en[?*[]/i, "motif désignant un fichier .env"],
    [/infra[\\/]+\.secrets|(^|[\s\/])\.secrets[\\/]/i, "accessing .secrets"],
    [/\/proc\/(\d+|self|1)\/environ/i, "reading process environment"],
    [/\/secrets\/|\/var\/lib\/web3signer|keystores?[\\/]|\.config[\\/]gh[\\/]hosts|\.docker[\\/]config\.json|\.kube[\\/]config|\.aws[\\/]credentials/i, "accessing credential/key material paths"],
    [/(^|[;&|(]\s*)(\S*[\\/])?(env|printenv|set)\s*($|[|;&>)])|\b(printenv|export\s+-p|declare\s+-[a-zA-Z]*x|compgen\s+-v)\b|process\.env\b|\b(gci|Get-ChildItem|dir|ls|Get-Item)\s+env:|GetEnvironmentVariables|\$env:\w*(KEY|TOKEN|SECRET|PASS)/im, "dumping environment"],
    [/--private-key\b|--mnemonic\b|\bPRIVATE_KEY=|--keystore\b/i, "clé privée en ligne de commande"],
    [/\bvault\s+\w/i, "accès au coffre Vault (secrets)"],
    [/\b(gh|glab)\s+(secret|variable)\b|\b(gh|glab)\s+auth\s+(token|status\b[^;&|]*(\s-t\b|--show-token))/i, "reading forge secrets/variables/tokens"],
    [/\bkubectl\b[^;&|]*\bsecrets?\b|get-secret-value|--with-decryption|\bssm\s+get-parameters?\b|\bsecretsmanager\b|\bkeyvault\s+secret\b|\bsecrets\s+versions\s+access\b/i, "lecture de secrets d'infrastructure"],
    [/\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b[^;&|]*(169\.254\.|metadata\.google|100\.100\.100\.200|\[?fd00:ec2)/i, "accès au service de métadonnées cloud"],
    // git / forge integrity
    [/git\s+push\b[^;&|]*(--force\b|--force-with-lease|--force-if-includes|--mirror\b|--prune\b|--delete\b|\s-[a-zA-Z]*[fd][a-zA-Z]*\b|\s\+[\w./:@^~-]+|\s:[\w./-]+)/i, "force push / suppression ou miroir de branches distantes"],
    [/git\s+push\b[^;&|]*(\s|:)(refs\/heads\/)?(main|master)([~^]\d*)*(\s|$|;|&|\|)/i, "push to main (open a PR from a spec branch)"],
    [/--no-verify\b|\bgit\s+commit\b[^;&|]*\s-[a-zA-Z]*n\b|core\.hooksPath|\balias\.\w+=/i, "skipping git hooks / inline alias"],
    [/git\s+reset\s+--hard\s+origin/i, "hard reset to remote"],
    [/gh\s+pr\s+merge\b[^;&|]*--admin/i, "bypassing branch protection"],
    [/\b(gh|glab)\s+api\b[^;&|]*(\/protection|rulesets|protected_branches|protected_tags|approval_rules|push_rule|\/environments)/i, "changing branch/environment protection"],
    [/\bgh\s+pr\s+review\b[^;&|]*(--approve|\s-a\b)|\bglab\s+mr\s+approve\b/i, "un agent n'approuve jamais une demande de changement"],
    [/\b(gh\s+api|glab\s+api|curl|wget|Invoke-RestMethod|irm|Invoke-WebRequest|iwr)\b[^;&|]*(\/merge\b|mergePullRequest|AutoMerge|\/approve\b|event=APPROVE|git\/refs|merge_requests\/\d+\/merge)/i, "fusion / approbation / réécriture de refs via l'API (porte G4)"],
    // host / containers
    [/rm\s+-rf\s+(\/|~|\$HOME|\*)(\s|$)/, "destructive rm"],
    [/\bdocker\s+(compose\s+)?(config|exec|cp|inspect)\b/i, "container introspection (use scripts/*.sh)"],
    [/\bdocker\s+(container\s+)?(exec|cp|inspect)\b/i, "container introspection (use scripts/*.sh)"],
    [/(^|[\s;&|(])(source|\.)\s+["']?[^\s;&|]*\.env\b(?!\.example)/i, "sourcing .env into the agent shell"],
    [/\bdocker\s+run\b[^;&|]*\s-v\s*["']?(\.|\$PWD|\$\(pwd\)|\$ROOT)["']?:/i, "mounting the repository root into a container (use scripts/sandbox-exec.sh)"],
    // non-analysable execution
    [/(^|[;&|(]\s*)eval\s/, "eval (commande non analysable)"],
    [/\b(Invoke-Expression|iex)\s/i, "Invoke-Expression (commande non analysable)"],
    // destructive infrastructure: always denied, whatever the profile
    [/\bkubectl\b[^;&|]*\s(delete|drain|replace\s+--force)\b/i, "kubectl destructif"],
    [/\bkubectl\s+config\b/i, "kubectl config (identifiants)"],
    [/\bhelm\b[^;&|]*\s(uninstall|delete)\b/i, "helm destructif"],
    [/\b(terraform|tofu)\b[^;&|]*\s(destroy|state\s+(rm|mv|push)|apply\b[^;&|]*-destroy)\b/i, "terraform destructif"],
    [/\baws\b[^;&|]*\s(terminate-instances|delete-[\w-]+|rb\b|rm\b[^;&|]*--recursive)/i, "aws destructif"],
  ];
  for (const [re, why] of always) if (test(re)) deny(why);
  // a real pipe into a shell (checked on the quoted form so that a quoted pattern like "a|bash" is not a pipe)
  if (/\|\s*(sudo\s+)?(sh|bash|zsh|dash|pwsh|powershell|iex)(\.exe)?(?=\s|$|[;&)])/i.test(a)) deny("exécution d'un flux dans un shell");

  // control files written through the shell (F3)
  if (PROTECT_CONTROL && (CONTROL.test(a) || CONTROL.test(b)) && /(>|\btee\b|\bsed\s+-i|\b(cp|mv|install|rm|truncate|Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|Remove-Item|New-Item)\b|writeFile)/i.test(b))
    deny("modification d'un fichier de règles de la factory par le shell");

  // bare `git push` while the current branch is main
  if (/(^|[;&|]\s*)git\s+push(\s+(-u|--set-upstream)?\s*origin)?\s*($|[;&|])/i.test(b)) {
    try {
      const { execSync } = await import("node:child_process");
      const br = execSync("git branch --show-current", { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      if (br === "main" || br === "master") deny("push from main (open a PR from a spec branch)");
    } catch { /* not a git repo: nothing to protect */ }
  }

  // --- profile-dependent decisions: collect all, apply the strictest ---
  const verdicts = [];
  const want = (level, msg) => verdicts.push([level, msg]);

  if (test(/deploy-contracts\.sh|\bforge\s+(script\b[^;&|]*--broadcast|create\b)/)) want(profile.actions.deploy, "déploiement de contrats");
  if (test(/sandbox\.sh\s+(reset|down)\b|\bdocker\s+compose\b[^;&|]*\sdown\b[^;&|]*\s(-v|--volumes)\b|\bdocker\s+volume\s+(rm|prune)\b/)) want(profile.actions.reset, "réinitialisation d'environnement");

  // signing / broadcasting on a chain (F2, F9)
  if (test(/\bcast\s+(send|publish|mktx|wallet\s+sign|rpc\s+eth_send)\b|eth_send(Raw)?Transaction|eth_sign\w*|personal_sign|\/api\/v1\/eth[12]\/sign|\bforge\s+create\b/i)) {
    const hosts = [];
    for (const m of b.matchAll(/\b(?:https?|wss?):\/\/(\[[^\]]+\]|[^\s/:"'?#]+)/gi)) hosts.push(m[1]);
    for (const m of b.matchAll(/(?:--rpc-url|--fork-url|\s-r|ETH_RPC_URL=)\s*=?\s*([^\s;&|]+)/g)) {
      const v = m[1];
      if (v.startsWith("$")) { hosts.push("$"); continue; }
      const h = v.replace(/^\w+:\/\//, "").replace(/^\[([^\]]+)\].*$/, "$1").split(/[/:?#]/)[0];
      if (h) hosts.push(h);
    }
    const noExplicit = hosts.length === 0 || hosts.includes("$");
    const unknownLevel = profile.actions.broadcast === "deny" ? "deny" : (SANDBOX ? profile.actions.broadcast : "ask");
    if (noExplicit) want(unknownLevel, "signature/diffusion sans endpoint explicite");
    for (const raw of hosts.filter((h) => h !== "$")) {
      const h = raw.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
      if (!SANDBOX && hostIsInternal(h)) want("deny", `endpoint local/sandbox ${h} utilisé avec le profil ${profile.name}`);
      else if ((profile.rpcHosts ?? []).includes(h)) want(profile.actions.broadcast, `signature/diffusion vers ${h}`);
      else if (SANDBOX) want("deny", `signature/diffusion vers un hôte hors sandbox ${h}`);
      else want(unknownLevel, `signature/diffusion vers un hôte non déclaré ${h}`);
    }
  }

  // infrastructure tools: every occurrence, verb found after flags (F1)
  const INFRA = [
    ["kubectl", /^(get|describe|logs|top|explain|version|api-resources|api-versions|cluster-info|events|auth|diff|wait)$/i,
      /^(apply|create|patch|scale|set|edit|label|annotate|rollout|expose|run|cp|exec|port-forward|attach|replace|autoscale|cordon|uncordon|taint|debug|proxy)$/i],
    ["helm", /^(list|ls|status|get|history|template|lint|show|search|version|diff|dependency|env)$/i, /^(install|upgrade|rollback|repo|push|plugin|registry|test)$/i],
    ["terraform|tofu", /^(plan|validate|fmt|show|version|providers|graph|init|output)$/i, /^(apply|import|taint|untaint|refresh|state|workspace|console|force-unlock)$/i],
    ["ansible-playbook|ansible", /(?!)/, /(?!)/],
    ["aws|az|gcloud", /^(describe-[\w-]+|list[\w-]*|get-[\w-]+|show)$/i, /(?!)/],
  ];
  for (const [names, readVerbs, writeVerbs] of INFRA) {
    for (const m of b.matchAll(new RegExp(String.raw`(^|[\s;&|(/\\])(${names})(\.exe)?\b([^;&|\n]*)`, "gi"))) {
      const tokens = m[4].trim().split(/\s+/).filter((t) => t && !t.startsWith("-"));
      const verb = tokens.find((t) => readVerbs.test(t) || writeVerbs.test(t));
      const level = verb && readVerbs.test(verb) ? profile.infra.read : profile.infra.write;
      want(level, `infrastructure : ${m[2]} ${verb ?? "(verbe inconnu = écriture)"}`);
    }
  }

  // remote shells (F12: full paths, rsync host:path)
  if (/(^|[\s;&|(\/\\])(ssh|scp|sftp)(\.exe)?\s/i.test(b) || /\brsync\b[^;&|]*\s[\w.@-]+:/i.test(b)) want(profile.remoteShell, "shell distant");

  // forge merges = human gate G4
  if (/\bgh\s+pr\s+merge\b|\bglab\s+mr\s+merge\b/i.test(b)) want("ask", "fusion (porte G4)");

  const rank = { deny: 3, ask: 2, allow: 1 };
  verdicts.sort((x, y) => (rank[y[0]] ?? 4) - (rank[x[0]] ?? 4));
  if (verdicts.length) decide(verdicts[0][0], verdicts[0][1]);
}
process.exit(0);
