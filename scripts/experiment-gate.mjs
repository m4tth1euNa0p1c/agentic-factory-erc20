#!/usr/bin/env node
/** Deterministic evidence/completeness gate. Never executes document commands or authorizes spending. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const obj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const hash = (value, size) => typeof value === 'string' && new RegExp(`^[a-fA-F0-9]{${size}}$`).test(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
const assurance = {
  authorizationGranted: false,
  assurance: 'Checks document completeness, declared limits, SC coverage and artifact integrity only; does not prove measurement truth, pre-registration chronology, reviewer independence or enforce provider billing.'
};
function shape(value, keys, at, errors) {
  if (!obj(value)) { errors.push(`${at}: expected object`); return false; }
  for (const key of keys) if (!Object.hasOwn(value, key)) errors.push(`${at}.${key}: required`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`${at}.${key}: unknown property`);
  return true;
}
function check(ok, message, errors) { if (!ok) errors.push(message); }
function stringField(value, at, errors, nullable = false) { check((nullable && value === null) || text(value), `${at}: expected nonempty string${nullable ? ' or null' : ''}`, errors); }
function numberField(value, at, errors, { nullable = false, integer = false, min = -Infinity } = {}) {
  check((nullable && value === null) || (finite(value) && value >= min && (!integer || Number.isSafeInteger(value))), `${at}: expected finite ${integer ? 'integer' : 'number'} >= ${min}${nullable ? ' or null' : ''}`, errors);
}
function strings(value, at, errors) {
  if (!Array.isArray(value)) { errors.push(`${at}: expected array`); return; }
  check(value.every(text), `${at}: entries must be nonempty strings`, errors);
  check(new Set(value).size === value.length, `${at}: duplicate entries`, errors);
}
function relativePath(value) {
  if (!text(value) || path.isAbsolute(value) || value.includes('\\') || value.includes('\0')) throw new Error('path must be repository-relative');
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..')) throw new Error('empty, dot and traversal components are forbidden');
  if (parts.some(p => p === '.git' || p === '.secrets' || p === '.env' || p.startsWith('.env.'))) throw new Error('secret or git metadata path is forbidden');
  return value;
}
export function safeRead(relative, root) {
  relativePath(relative);
  const base = fs.realpathSync(root);
  const resolved = fs.realpathSync(path.resolve(base, relative));
  const remainder = path.relative(base, resolved);
  if (!remainder || remainder.startsWith('..' + path.sep) || path.isAbsolute(remainder)) throw new Error('path escapes repository root');
  relativePath(remainder.split(path.sep).join('/'));
  if (!fs.statSync(resolved).isFile()) throw new Error('expected regular file');
  return fs.readFileSync(resolved);
}
export function extractSuccessCriteria(markdown) {
  // Definition forms: bullets, numbered bullets, headings, plain SC-xxx: lines and table rows.
  const found = new Set();
  for (const line of markdown.split(/\r?\n/)) {
    // A heading supplies its own definition boundary; prose still needs explicit punctuation.
    const heading = line.match(/^\s*#{1,6}[ \t]+(?:\*\*|__)?`?(SC-\d{3,})`?(?:\*\*|__)?(?=[ \t]|$|[:—–-])/);
    const match = heading ?? line.match(/^\s*(?:(?:[-*+] |\d+[.)] )\s*|\|\s*)?(?:\*\*|`)?(SC-\d{3,})(?:\*\*|`)?\s*(?::|[—–-]|\|)/);
    if (match) found.add(match[1]);
  }
  return [...found].sort();
}
export function validatePlan(plan, { root = process.cwd() } = {}) {
  const e = [];
  if (!shape(plan, ['schemaVersion', 'id', 'spec', 'scope', 'status', 'problem', 'hypothesis', 'reference', 'criteria', 'budget', 'decision'], 'plan', e)) return e;
  check(plan.schemaVersion === 1, 'plan.schemaVersion: expected 1', e);
  check(identifier(plan.id), 'plan.id: invalid identifier', e);
  check(['experiment', 'spec_acceptance'].includes(plan.scope), 'plan.scope: invalid enum', e);
  check(['DRAFT', 'READY'].includes(plan.status), 'plan.status: invalid enum', e);
  try { relativePath(plan.spec); } catch (error) { e.push(`plan.spec: ${error.message}`); }
  const draft = plan.status === 'DRAFT';
  if (shape(plan.problem, ['who', 'difficulty', 'sourceRefs'], 'plan.problem', e)) {
    for (const key of ['who', 'difficulty']) stringField(plan.problem[key], `plan.problem.${key}`, e, draft);
    strings(plan.problem.sourceRefs, 'plan.problem.sourceRefs', e);
    if (!draft) check(plan.problem.sourceRefs?.length > 0, 'plan.problem.sourceRefs: READY requires sources', e);
  }
  if (shape(plan.hypothesis, ['change', 'expectedImprovement', 'falsifiedBy'], 'plan.hypothesis', e))
    for (const key of ['change', 'expectedImprovement', 'falsifiedBy']) stringField(plan.hypothesis[key], `plan.hypothesis.${key}`, e, draft);
  if (shape(plan.reference, ['currentMethod', 'sourceRefs'], 'plan.reference', e)) {
    stringField(plan.reference.currentMethod, 'plan.reference.currentMethod', e, draft);
    strings(plan.reference.sourceRefs, 'plan.reference.sourceRefs', e);
    if (!draft) check(plan.reference.sourceRefs?.length > 0, 'plan.reference.sourceRefs: READY requires sources', e);
  }
  if (!Array.isArray(plan.criteria) || !plan.criteria.length) e.push('plan.criteria: expected nonempty array');
  else {
    const ids = new Set();
    plan.criteria.forEach((c, i) => {
      const at = `plan.criteria[${i}]`;
      if (!shape(c, ['id', 'requirementRefs', 'required', 'kind', 'metric', 'unit', 'operator', 'target', 'minimumSamples', 'comparison', 'measurement', 'command'], at, e)) return;
      check(identifier(c.id) && !ids.has(c.id), `${at}.id: invalid or duplicate identifier`, e); ids.add(c.id);
      strings(c.requirementRefs, `${at}.requirementRefs`, e);
      check(typeof c.required === 'boolean', `${at}.required: expected boolean`, e);
      check(['success', 'guardrail'].includes(c.kind), `${at}.kind: invalid enum`, e);
      if (c.kind === 'guardrail') check(c.required === true, `${at}: guardrails must be required`, e);
      for (const key of ['metric', 'unit', 'measurement', 'command']) stringField(c[key], `${at}.${key}`, e, draft);
      check(['gte', 'lte', 'eq', 'lt', 'gt'].includes(c.operator), `${at}.operator: invalid enum`, e);
      check(['absolute', 'decrease', 'increase'].includes(c.comparison), `${at}.comparison: invalid enum`, e);
      numberField(c.target, `${at}.target`, e, { nullable: draft });
      numberField(c.minimumSamples, `${at}.minimumSamples`, e, { nullable: draft, integer: true, min: 1 });
    });
    check(plan.criteria.some(c => c?.required === true), 'plan.criteria: at least one required criterion', e);
  }
  if (shape(plan.budget, ['limits', 'authorityRef'], 'plan.budget', e)) {
    stringField(plan.budget.authorityRef, 'plan.budget.authorityRef', e, draft);
    if (shape(plan.budget.limits, ['wallMinutes', 'moneyAmount', 'currency', 'humanMinutes', 'iterations'], 'plan.budget.limits', e)) {
      for (const key of ['wallMinutes', 'moneyAmount', 'humanMinutes', 'iterations'])
        numberField(plan.budget.limits[key], `plan.budget.limits.${key}`, e, { nullable: draft, integer: key === 'iterations', min: key === 'iterations' ? 1 : 0 });
      check(typeof plan.budget.limits.currency === 'string' && /^[A-Z]{3}$/.test(plan.budget.limits.currency), 'plan.budget.limits.currency: expected ISO-style uppercase currency code', e);
    }
  }
  if (shape(plan.decision, ['go', 'modify', 'stop', 'inconclusive'], 'plan.decision', e))
    for (const key of ['go', 'modify', 'stop', 'inconclusive']) stringField(plan.decision[key], `plan.decision.${key}`, e, draft);
  if (!draft && e.length === 0) {
    try {
      const spec = safeRead(plan.spec, root).toString('utf8');
      if (plan.scope === 'spec_acceptance') {
        const defined = extractSuccessCriteria(spec);
        if (!defined.length) e.push('plan.spec: no SC definitions found; spec acceptance coverage cannot be established');
        const covered = new Set(plan.criteria.filter(c => c.required).flatMap(c => c.requirementRefs));
        for (const id of defined) if (!covered.has(id)) e.push(`plan.criteria: missing required coverage for ${id}`);
      }
    } catch (error) { e.push(`plan.spec: ${error.message}`); }
  }
  return e;
}
function timestamp(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= maxDay && hour < 24 && minute < 60 && second < 60;
}
export function validateRun(run) {
  const e = [];
  if (!shape(run, ['schemaVersion', 'experimentId', 'runId', 'planSha256', 'commitSha', 'configSha256', 'startedAt', 'endedAt', 'status', 'invalidReason', 'observations', 'evidence', 'budgetUsage'], 'run', e)) return e;
  check(run.schemaVersion === 1, 'run.schemaVersion: expected 1', e);
  for (const key of ['experimentId', 'runId']) check(identifier(run[key]), `run.${key}: invalid identifier`, e);
  for (const [key, size] of [['planSha256', 64], ['commitSha', 40], ['configSha256', 64]]) check(run[key] === null || hash(run[key], size), `run.${key}: expected ${size}-character hexadecimal hash or null`, e);
  for (const key of ['startedAt', 'endedAt']) check(run[key] === null || timestamp(run[key]), `run.${key}: expected ISO timestamp or null`, e);
  if (timestamp(run.startedAt) && timestamp(run.endedAt)) check(Date.parse(run.endedAt) >= Date.parse(run.startedAt), 'run.endedAt: precedes startedAt', e);
  check(['VALID', 'INVALID'].includes(run.status), 'run.status: invalid enum', e);
  check(run.status === 'INVALID' ? text(run.invalidReason) : run.invalidReason === null, 'run.invalidReason: required text for INVALID, null for VALID', e);
  const evidenceIds = new Set();
  if (!Array.isArray(run.evidence)) e.push('run.evidence: expected array');
  else run.evidence.forEach((item, i) => {
    const at = `run.evidence[${i}]`;
    if (!shape(item, ['id', 'path', 'sha256'], at, e)) return;
    check(identifier(item.id) && !evidenceIds.has(item.id), `${at}.id: invalid or duplicate identifier`, e); evidenceIds.add(item.id);
    try { relativePath(item.path); } catch (error) { e.push(`${at}.path: ${error.message}`); }
    check(hash(item.sha256, 64), `${at}.sha256: expected SHA256`, e);
  });
  const obsIds = new Set();
  const links = (ids, at) => { strings(ids, at, e); if (Array.isArray(ids)) for (const id of ids) check(evidenceIds.has(id), `${at}: unregistered evidence ${id}`, e); };
  if (!Array.isArray(run.observations)) e.push('run.observations: expected array');
  else run.observations.forEach((o, i) => {
    const at = `run.observations[${i}]`;
    if (!shape(o, ['criterionId', 'value', 'samples', 'evidenceIds', 'baseline'], at, e)) return;
    check(identifier(o.criterionId) && !obsIds.has(o.criterionId), `${at}.criterionId: invalid or duplicate identifier`, e); obsIds.add(o.criterionId);
    numberField(o.value, `${at}.value`, e, { nullable: true });
    numberField(o.samples, `${at}.samples`, e, { integer: true, min: 0 });
    links(o.evidenceIds, `${at}.evidenceIds`);
    if (o.baseline !== null && shape(o.baseline, ['value', 'evidenceIds'], `${at}.baseline`, e)) {
      numberField(o.baseline.value, `${at}.baseline.value`, e);
      links(o.baseline.evidenceIds, `${at}.baseline.evidenceIds`);
    }
  });
  if (shape(run.budgetUsage, ['wallMinutes', 'moneyAmount', 'moneyStatus', 'moneySource', 'humanMinutes', 'iterations'], 'run.budgetUsage', e)) {
    for (const key of ['wallMinutes', 'moneyAmount', 'humanMinutes', 'iterations']) numberField(run.budgetUsage[key], `run.budgetUsage.${key}`, e, { nullable: true, min: 0, integer: key === 'iterations' });
    check(['MEASURED', 'UPPER_BOUND', 'UNMEASURED'].includes(run.budgetUsage.moneyStatus), 'run.budgetUsage.moneyStatus: invalid enum', e);
    stringField(run.budgetUsage.moneySource, 'run.budgetUsage.moneySource', e, true);
    if (run.budgetUsage.moneyStatus === 'UNMEASURED') check(run.budgetUsage.moneyAmount === null, 'run.budgetUsage.moneyAmount: UNMEASURED must be null', e);
  }
  return e;
}
export function startExperiment(plan, options = {}) {
  const errors = validatePlan(plan, options);
  if (errors.length) return { outcome: 'INVALID_DOCUMENT', reasons: errors, ...assurance };
  if (plan.status !== 'READY') return { outcome: 'INCONCLUSIVE', reasons: ['PLAN_NOT_READY: DRAFT may contain unknowns; it cannot pass the start checkpoint'], ...assurance };
  return { outcome: 'READY', reasons: ['Declared readiness checkpoint passed; no work or spending has been triggered'], ...assurance };
}
const compare = (value, operator, target) => ({ gte: value >= target, lte: value <= target, eq: value === target, lt: value < target, gt: value > target })[operator];
export function evaluateExperiment(plan, run, { root = process.cwd(), planBytes } = {}) {
  const errors = [...validatePlan(plan, { root }), ...validateRun(run)];
  if (errors.length) return { outcome: 'INVALID_DOCUMENT', reasons: errors, criteria: [], ...assurance };
  const reasons = [], gaps = [], stops = [];
  const result = { outcome: 'INCONCLUSIVE', scope: plan.scope, experimentId: plan.id, runId: run.runId, specAccepted: false, specAcceptanceGatePassed: false, criteria: [], evidence: [], budget: {}, reasons, ...assurance };
  if (plan.status !== 'READY') gaps.push('PLAN_NOT_READY');
  if (run.status !== 'VALID') gaps.push(`INVALID_RUN: ${run.invalidReason}`);
  if (run.experimentId !== plan.id) gaps.push('EXPERIMENT_ID_MISMATCH');
  if (planBytes === undefined) gaps.push('PLAN_RAW_BYTES_MISSING');
  else {
    try {
      if (JSON.stringify(JSON.parse(planBytes.toString())) !== JSON.stringify(plan)) gaps.push('PLAN_OBJECT_DIFFERS_FROM_RAW_BYTES');
    } catch { gaps.push('PLAN_RAW_BYTES_INVALID'); }
    if (!run.planSha256 || sha256(planBytes) !== run.planSha256.toLowerCase()) gaps.push('PLAN_HASH_MISMATCH');
  }
  for (const key of ['commitSha', 'configSha256', 'startedAt', 'endedAt']) if (run[key] === null) gaps.push(`PROVENANCE_MISSING: ${key}`);
  const evidenceOK = new Set();
  for (const item of run.evidence) {
    try {
      if (sha256(safeRead(item.path, root)) !== item.sha256.toLowerCase()) throw new Error('SHA256 mismatch');
      evidenceOK.add(item.id); result.evidence.push({ id: item.id, status: 'VERIFIED' });
    } catch (error) { result.evidence.push({ id: item.id, status: 'INVALID', reason: error.message }); gaps.push(`EVIDENCE_INVALID: ${item.id}: ${error.message}`); }
  }
  const obs = new Map(run.observations.map(o => [o.criterionId, o]));
  const ids = new Set(plan.criteria.map(c => c.id));
  for (const id of obs.keys()) if (!ids.has(id)) gaps.push(`UNRECOGNIZED_CRITERION: ${id}`);
  const linked = list => list.length > 0 && list.every(id => evidenceOK.has(id));
  for (const c of plan.criteria) {
    const o = obs.get(c.id), cr = { id: c.id, required: c.required, kind: c.kind, status: 'INCONCLUSIVE', reasons: [] };
    result.criteria.push(cr);
    if (!o || o.value === null) cr.reasons.push('OBSERVATION_MISSING');
    if (o && !linked(o.evidenceIds)) cr.reasons.push('EVIDENCE_MISSING_OR_INVALID');
    if (o && o.samples < c.minimumSamples) cr.reasons.push(`INSUFFICIENT_SAMPLES: ${o.samples}/${c.minimumSamples}`);
    if (c.target === null || c.minimumSamples === null) cr.reasons.push('THRESHOLD_UNKNOWN');
    if (c.comparison !== 'absolute' && (!o?.baseline || !linked(o.baseline.evidenceIds))) cr.reasons.push('BASELINE_WITH_EVIDENCE_REQUIRED');
    if (o && c.comparison === 'absolute' && o.baseline !== null) cr.reasons.push('UNEXPECTED_BASELINE_FOR_ABSOLUTE');
    let value = o?.value;
    if (c.comparison !== 'absolute' && o?.baseline) value = c.comparison === 'decrease' ? o.baseline.value - o.value : o.value - o.baseline.value;
    if (value !== undefined && value !== null && !finite(value)) cr.reasons.push('COMPARISON_NONFINITE');
    cr.measured = value ?? null; cr.target = c.target; cr.operator = c.operator; cr.samples = o?.samples ?? 0;
    // A verified observed guardrail breach cannot be excused by a small sample count.
    const guardrailBreach = c.kind === 'guardrail' && finite(value) && c.target !== null && cr.reasons.every(r => r.startsWith('INSUFFICIENT_SAMPLES:')) && !compare(value, c.operator, c.target);
    if (guardrailBreach) cr.status = 'FAIL';
    else if (cr.reasons.length === 0) cr.status = compare(value, c.operator, c.target) ? 'PASS' : 'FAIL';
    if (c.required && cr.status === 'INCONCLUSIVE') gaps.push(`CRITERION_INCONCLUSIVE: ${c.id}`);
    if (c.kind === 'guardrail' && cr.status === 'FAIL') stops.push(`GUARDRAIL_FAILED: ${c.id}`);
  }
  const limits = plan.budget.limits, used = run.budgetUsage;
  const duration = timestamp(run.startedAt) && timestamp(run.endedAt) ? (Date.parse(run.endedAt) - Date.parse(run.startedAt)) / 60000 : null;
  let remaining = true;
  for (const key of ['wallMinutes', 'moneyAmount', 'humanMinutes', 'iterations']) {
    let value = used[key];
    if (key === 'wallMinutes' && duration !== null) value = value === null ? duration : Math.max(value, duration);
    result.budget[key] = { limit: limits[key], declared: used[key], evaluated: value };
    if (limits[key] === null || used[key] === null) { gaps.push(`BUDGET_UNKNOWN: ${key}`); remaining = false; }
    if (limits[key] !== null && value !== null && value > limits[key]) stops.push(`BUDGET_EXCEEDED: ${key}`);
    if (limits[key] !== null && value !== null && value >= limits[key]) remaining = false;
  }
  if (used.moneyStatus === 'UNMEASURED' || !text(used.moneySource)) gaps.push('COST_NOT_ESTABLISHED');
  if (duration !== null && used.wallMinutes !== null && Math.abs(duration - used.wallMinutes) > 1) gaps.push('WALL_TIME_INCONSISTENT: timestamps differ from declared wallMinutes by more than one minute');
  if (stops.length) { result.outcome = 'STOP'; reasons.push(...stops, ...gaps); }
  else if (gaps.length) { result.outcome = 'INCONCLUSIVE'; reasons.push(...gaps); }
  else if (result.criteria.some(c => c.required && c.status === 'FAIL')) {
    result.outcome = remaining ? 'MODIFY' : 'STOP'; reasons.push(remaining ? 'OBJECTIVE_FAILED_WITH_BUDGET_REMAINING' : 'OBJECTIVE_FAILED_WITHOUT_BUDGET_REMAINING');
  } else {
    result.outcome = 'GO'; result.specAcceptanceGatePassed = plan.scope === 'spec_acceptance';
    reasons.push(plan.scope === 'experiment' ? 'All required experiment criteria passed; this does not accept the whole spec' : 'Declared required criteria cover all detected SC definitions and pass; semantic adequacy still needs independent review');
  }
  return result;
}
function main() {
  let args = process.argv.slice(2), root = process.cwd();
  try {
    const index = args.indexOf('--root');
    if (index !== -1) { if (!args[index + 1]) throw new Error('--root requires a repository directory'); root = args[index + 1]; args.splice(index, 2); }
    const [action, planPath, runPath] = args;
    if (!['validate', 'start', 'evaluate'].includes(action) || args.length !== (action === 'evaluate' ? 3 : 2)) throw new Error('Usage: experiment-gate.mjs validate|start <plan.json> | evaluate <plan.json> <run.json> [--root <repo>]');
    const readInput = input => {
      const relative = path.isAbsolute(input) ? path.relative(path.resolve(root), input) : input;
      return safeRead(relative, root);
    };
    const bytes = readInput(planPath), plan = JSON.parse(bytes.toString('utf8'));
    let report;
    if (action === 'validate') {
      const errors = validatePlan(plan, { root });
      report = { outcome: errors.length ? 'INVALID_DOCUMENT' : 'VALID_PLAN', status: plan.status, reasons: errors.length ? errors : [plan.status === 'DRAFT' ? 'Document valid; DRAFT is preparation only and does not pass the start checkpoint' : 'Document valid; no work or spending has been triggered'], ...assurance };
    } else if (action === 'start') report = { ...startExperiment(plan, { root }), planSha256: sha256(bytes) };
    else report = evaluateExperiment(plan, JSON.parse(readInput(runPath).toString('utf8')), { root, planBytes: bytes });
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = report.outcome === 'INVALID_DOCUMENT' ? 2 : ['GO', 'VALID_PLAN', 'READY'].includes(report.outcome) ? 0 : 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ outcome: 'INVALID_DOCUMENT', reasons: [error.message], ...assurance }, null, 2) + '\n'); process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
