import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateExperiment, validatePlan, startExperiment, sha256, extractSuccessCriteria } from './experiment-gate.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-gate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'specs'));
  fs.mkdirSync(path.join(root, 'evidence'));
  fs.writeFileSync(path.join(root, 'specs/spec.md'), '- **SC-001**: Complete ten runs.\n- **SC-002**: No double debit.\nA reference to SC-003 is not a definition.\n');
  fs.writeFileSync(path.join(root, 'evidence/result.json'), '{"observed":10}\n');
  const plan = {
    schemaVersion: 1, id: 'EXP-001', spec: 'specs/spec.md', scope: 'experiment', status: 'READY',
    problem: { who: 'Verifier', difficulty: 'Missing repeated runs', sourceRefs: ['issue:8'] },
    hypothesis: { change: 'Repeat with isolated records', expectedImprovement: 'Ten passing runs', falsifiedBy: 'A repeated run fails' },
    reference: { currentMethod: 'Three runs', sourceRefs: ['evidence/previous'] },
    criteria: [{ id: 'repetitions', requirementRefs: ['SC-001'], required: true, kind: 'success', metric: 'passing_runs', unit: 'runs', operator: 'gte', target: 10, minimumSamples: 10, comparison: 'absolute', measurement: 'Count all runs, including failures', command: 'node test.mjs' }],
    budget: { limits: { wallMinutes: 30, moneyAmount: 5, currency: 'EUR', humanMinutes: 10, iterations: 3 }, authorityRef: 'user-request:bounded-trial' },
    decision: { go: 'All required criteria pass', modify: 'Objective fails with budget remaining', stop: 'Guardrail or budget breached', inconclusive: 'Missing evidence' }
  };
  const planBytes = JSON.stringify(plan);
  const run = {
    schemaVersion: 1, experimentId: plan.id, runId: 'run-001', planSha256: sha256(planBytes), commitSha: 'a'.repeat(40), configSha256: 'b'.repeat(64), startedAt: '2026-11-08T10:00:00Z', endedAt: '2026-11-08T10:05:00Z', status: 'VALID', invalidReason: null,
    observations: [{ criterionId: 'repetitions', value: 10, samples: 10, evidenceIds: ['result'], baseline: null }],
    evidence: [{ id: 'result', path: 'evidence/result.json', sha256: sha256(fs.readFileSync(path.join(root, 'evidence/result.json'))) }],
    budgetUsage: { wallMinutes: 5, moneyAmount: 1, moneyStatus: 'MEASURED', moneySource: 'Provider billing export: trial-001', humanMinutes: 2, iterations: 1 }
  };
  const evaluate = () => evaluateExperiment(plan, run, { root, planBytes });
  const reseal = () => { const b = JSON.stringify(plan); run.planSha256 = sha256(b); return evaluateExperiment(plan, run, { root, planBytes: b }); };
  return { root, plan, run, planBytes, evaluate, reseal };
}

test('complete evidence yields scoped GO with explicit assurance limitations', t => {
  const f = fixture(t); const report = f.evaluate();
  assert.equal(report.outcome, 'GO');
  assert.equal(report.scope, 'experiment');
  assert.equal(report.specAccepted, false);
  assert.equal(report.criteria[0].status, 'PASS');
  assert.equal(report.authorizationGranted, false);
});

test('missing evidence and altered artifacts cannot yield GO', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.root, 'evidence/result.json'));
  assert.equal(f.evaluate().outcome, 'INCONCLUSIVE');
  fs.writeFileSync(path.join(f.root, 'evidence/result.json'), 'changed');
  assert.equal(f.evaluate().outcome, 'INCONCLUSIVE');
});

test('an invalid run cannot yield GO', t => {
  const f = fixture(t); f.run.status = 'INVALID'; f.run.invalidReason = 'Setup failed';
  assert.equal(f.evaluate().outcome, 'INCONCLUSIVE');
});

test('insufficient samples and missing observations block GO', t => {
  const f = fixture(t); f.run.observations[0].samples = 3;
  assert.equal(f.evaluate().outcome, 'INCONCLUSIVE');
  f.run.observations = [];
  assert.equal(f.evaluate().outcome, 'INCONCLUSIVE');
});

test('unknown costs or attention are never treated as zero', t => {
  const f = fixture(t); f.run.budgetUsage.moneyAmount = null; f.run.budgetUsage.moneyStatus = 'UNMEASURED'; f.run.budgetUsage.moneySource = null;
  assert.equal(f.evaluate().outcome, 'INCONCLUSIVE');
  f.run.budgetUsage.moneyAmount = 1; f.run.budgetUsage.moneyStatus = 'MEASURED'; f.run.budgetUsage.moneySource = 'Billing'; f.run.budgetUsage.humanMinutes = null;
  assert.equal(f.evaluate().outcome, 'INCONCLUSIVE');
});

test('a documented conservative cost bound is accepted', t => {
  const f = fixture(t); f.run.budgetUsage.moneyStatus = 'UPPER_BOUND'; f.run.budgetUsage.moneySource = 'Token count times maximum unit price';
  assert.equal(f.evaluate().outcome, 'GO');
});

test('post-registration threshold changes cannot yield GO', t => {
  const f = fixture(t); f.plan.criteria[0].target = 1;
  assert.notEqual(evaluateExperiment(f.plan, f.run, { root: f.root, planBytes: JSON.stringify(f.plan) }).outcome, 'GO');
});

test('spec acceptance covers each defined SC, experiment scope does not', t => {
  const f = fixture(t);
  assert.equal(f.evaluate().outcome, 'GO');
  f.plan.scope = 'spec_acceptance';
  assert.match(validatePlan(f.plan, { root: f.root }).join(' '), /SC-002/);
  assert.notEqual(f.reseal().outcome, 'GO');
  f.plan.criteria[0].requirementRefs.push('SC-002');
  assert.equal(f.reseal().outcome, 'GO');
  assert.equal(f.reseal().specAccepted, false);
  assert.equal(f.reseal().specAcceptanceGatePassed, true);
});

test('spec acceptance cannot omit SC definitions expressed as Markdown headings', t => {
  const f = fixture(t);
  f.plan.scope = 'spec_acceptance';
  const headings = [
    '### SC-002',
    '### **SC-002**',
    '### `SC-002`',
    '### __SC-002__',
    '### **`SC-002`**',
    '### SC-002 No double debit',
    '### **SC-002** No double debit',
    '### `SC-002` No double debit',
    '### SC-002 ###'
  ];
  for (const heading of headings) {
    fs.writeFileSync(path.join(f.root, 'specs/spec.md'), `- **SC-001**: Complete ten runs.\n\n${heading}\n\nNo double debit.\n`);
    f.plan.criteria[0].requirementRefs = ['SC-001'];
    const errors = validatePlan(f.plan, { root: f.root });
    const report = f.reseal();
    assert.deepEqual({ missingCoverage: errors.some(error => error.includes('SC-002')), outcome: report.outcome },
      { missingCoverage: true, outcome: 'INVALID_DOCUMENT' }, heading);
    f.plan.criteria[0].requirementRefs.push('SC-002');
    assert.deepEqual(validatePlan(f.plan, { root: f.root }), [], heading);
    assert.equal(f.reseal().outcome, 'GO', heading);
  }
});

test('SC extraction deduplicates definitions and ignores prose references', () => {
  const text = '- **SC-001**: A\n| SC-002 | B |\n### SC-003 — C\nSC-004: D\n- **SC-001**: repeated\nSee SC-999 and FR-001.\nSC-998 is a prose reference.\n**SC-997** is another reference.\n`SC-996` is another reference.\n### Discussion of SC-995\n### SC-994suffix is not an SC identifier\n';
  assert.deepEqual(extractSuccessCriteria(text), ['SC-001', 'SC-002', 'SC-003', 'SC-004']);
});

test('traversal, secret paths and outgoing symlinks cannot be read as evidence', t => {
  const f = fixture(t);
  for (const p of ['../outside', '.env', 'infra/.secrets/key', '.git/config', '/etc/passwd']) {
    f.run.evidence[0].path = p;
    assert.notEqual(f.evaluate().outcome, 'GO', p);
  }
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'proof'), '{"observed":10}\n');
  fs.symlinkSync(path.join(outside, 'proof'), path.join(f.root, 'evidence/link'));
  f.run.evidence[0].path = 'evidence/link';
  assert.equal(f.evaluate().outcome, 'INCONCLUSIVE');
});

test('budget overrun and observed guardrail violations stop the trial', t => {
  const f = fixture(t); f.run.budgetUsage.moneyAmount = 6;
  assert.equal(f.evaluate().outcome, 'STOP');
  f.run.budgetUsage.moneyAmount = 1; f.plan.criteria[0].kind = 'guardrail'; f.run.observations[0].value = 0;
  assert.equal(f.reseal().outcome, 'STOP');
});

test('objective failure modifies only with budget remaining', t => {
  const f = fixture(t); f.run.observations[0].value = 5;
  assert.equal(f.evaluate().outcome, 'MODIFY');
  f.run.budgetUsage.iterations = 3;
  assert.equal(f.evaluate().outcome, 'STOP');
});

test('timestamp duration cannot conceal wall-time budget overrun', t => {
  const f = fixture(t); f.run.endedAt = '2026-11-08T10:31:00Z';
  assert.equal(f.evaluate().outcome, 'STOP');
  f.run.endedAt = '2026-11-08T10:08:00Z';
  assert.equal(f.evaluate().outcome, 'INCONCLUSIVE');
});

test('a second cumulative checkpoint keeps the campaign start and total usage', t => {
  const f = fixture(t);
  assert.equal(f.evaluate().outcome, 'GO');
  const campaignStart = f.run.startedAt;
  f.run.runId = 'run-002';
  f.run.endedAt = '2026-11-08T10:10:00Z';
  f.run.budgetUsage.wallMinutes = 10;
  f.run.budgetUsage.moneyAmount = 2;
  f.run.budgetUsage.humanMinutes = 4;
  f.run.budgetUsage.iterations = 2;
  const report = f.evaluate();
  assert.equal(f.run.startedAt, campaignStart);
  assert.equal(report.outcome, 'GO');
  assert.deepEqual(report.budget.wallMinutes, { limit: 30, declared: 10, evaluated: 10 });
  assert.deepEqual(report.budget.iterations, { limit: 3, declared: 2, evaluated: 2 });
});

test('baseline comparisons need their own linked evidence', t => {
  const f = fixture(t); f.plan.criteria[0].comparison = 'decrease'; f.plan.criteria[0].target = 2;
  assert.equal(f.reseal().outcome, 'INCONCLUSIVE');
  f.run.observations[0].baseline = { value: 12, evidenceIds: ['result'] };
  assert.equal(f.reseal().outcome, 'GO');
});

test('strict inequality preserves preregistered less-than thresholds', t => {
  const f = fixture(t); f.plan.criteria[0].operator = 'lt'; f.plan.criteria[0].target = 10;
  assert.equal(f.reseal().outcome, 'MODIFY');
  f.run.observations[0].value = 9;
  assert.equal(f.reseal().outcome, 'GO');
});

test('DRAFT validates with unknown budgets but cannot start', t => {
  const f = fixture(t); f.plan.status = 'DRAFT'; f.plan.budget.limits.moneyAmount = null; f.plan.budget.authorityRef = null;
  assert.deepEqual(validatePlan(f.plan, { root: f.root }), []);
  assert.notEqual(startExperiment(f.plan, { root: f.root }).outcome, 'READY');
  assert.notEqual(f.reseal().outcome, 'GO');
});

test('READY is a declared checkpoint, not spending permission', t => {
  const f = fixture(t); const report = startExperiment(f.plan, { root: f.root });
  assert.equal(report.outcome, 'READY');
  assert.equal(report.authorizationGranted, false);
});

test('unknown properties and nonfinite numbers are rejected', t => {
  const f = fixture(t); f.plan.allowAutoApprove = true;
  assert.equal(f.evaluate().outcome, 'INVALID_DOCUMENT');
  delete f.plan.allowAutoApprove; f.run.observations[0].value = Infinity;
  assert.equal(f.evaluate().outcome, 'INVALID_DOCUMENT');
});

test('commands in plan JSON are inert text and CLI returns documented exits', t => {
  const f = fixture(t);
  f.plan.criteria[0].command = 'touch SHOULD_NOT_EXIST';
  const bytes = JSON.stringify(f.plan); f.run.planSha256 = sha256(bytes);
  fs.writeFileSync(path.join(f.root, 'plan.json'), bytes);
  fs.writeFileSync(path.join(f.root, 'run.json'), JSON.stringify(f.run));
  const script = new URL('./experiment-gate.mjs', import.meta.url).pathname;
  const cli = (...args) => spawnSync(process.execPath, [script, ...args, '--root', f.root], { cwd: f.root, encoding: 'utf8' });
  let result = cli('evaluate', 'plan.json', 'run.json');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).outcome, 'GO');
  assert.equal(fs.existsSync(path.join(f.root, 'SHOULD_NOT_EXIST')), false);
  f.run.budgetUsage.moneyAmount = null; f.run.budgetUsage.moneyStatus = 'UNMEASURED'; f.run.budgetUsage.moneySource = null;
  fs.writeFileSync(path.join(f.root, 'run.json'), JSON.stringify(f.run));
  assert.equal(cli('evaluate', 'plan.json', 'run.json').status, 1);
  fs.writeFileSync(path.join(f.root, 'run.json'), '{}');
  assert.equal(cli('evaluate', 'plan.json', 'run.json').status, 2);
});
