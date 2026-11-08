#!/usr/bin/env python3
"""Read-only integration checks. Requires PyYAML and jsonschema; no target stack execution."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

import jsonschema
import yaml

parser = argparse.ArgumentParser()
parser.add_argument('--base-ref', default='98ef63b9fdc72b608d3f9f764bb01c32ae4d5f45')
args = parser.parse_args()
root = Path.cwd()


def read(path):
    return (root / path).read_text()


def base(path):
    return subprocess.check_output(['git', 'show', f'{args.base_ref}:{path}'], text=True)


checks = []


def check(name, condition, detail=None):
    checks.append({'name': name, 'passed': bool(condition), 'detail': detail})


schema_paths = ['schemas/factory/experiment.v1.json', 'schemas/factory/experiment-run.v1.json']
schemas = [json.loads(read(path)) for path in schema_paths]
for path, schema in zip(schema_paths, schemas):
    jsonschema.Draft202012Validator.check_schema(schema)
    check('schema-valid:' + path, True)
for path, schema in [
    ('.claude/skills/design-experiment/assets/experiment.template.json', schemas[0]),
    ('.claude/skills/evaluate-experiment/assets/run.template.json', schemas[1]),
    ('experiments/EXP-002-validation.json', schemas[0]),
]:
    jsonschema.Draft202012Validator(schema).validate(json.loads(read(path)))
    check('document-valid:' + path, True)

for path in [
    '.claude/agents/experiment-designer.md', '.claude/agents/orchestrator.md',
    '.claude/agents/verifier.md', '.claude/skills/design-experiment/SKILL.md',
    '.claude/skills/evaluate-experiment/SKILL.md', '.claude/skills/factory-run/SKILL.md',
]:
    body = read(path)
    frontmatter = yaml.safe_load(body.split('---', 2)[1])
    check('frontmatter-valid:' + path, isinstance(frontmatter, dict))
yaml.safe_load(read('.github/ISSUE_TEMPLATE/task.yml'))
check('issue-template-yaml-valid', True)

old_constitution = base('.specify/memory/constitution.md')
constitution = read('.specify/memory/constitution.md')
old_principles = old_constitution.split('### I. ', 1)[1].split('## Delivery Workflow', 1)[0].strip()
principles = constitution.split('### I. ', 1)[1].split('### VIII.', 1)[0].strip()
check('principles-I-through-VII-preserved', principles == old_principles)
check('constitution-1.2.0-and-VIII', 'Version: 1.2.0' in constitution and '### VIII.' in constitution)

registry = read('docs/registry/REGISTRE.md')
registry_rows = lambda text: re.findall(r'^\|\s+[FHDP]-\d+\s+\|.*$', text, re.M)
old_rows = registry_rows(base('docs/registry/REGISTRE.md'))
rows = registry_rows(registry)
ids = re.findall(r'^\|\s+([FHDP]-\d+)\s+\|', registry, re.M)
check('historical-registry-rows-preserved', all(row in rows for row in old_rows), len(old_rows))
check('registry-ids-unique', len(ids) == len(set(ids)))
check('new-governance-ids', 'D-25' in ids and 'P-23' in ids)

spec = read('specs/007-experiment-governance/spec.md')
matrix = read('specs/007-experiment-governance/validation-matrix.md')
requirements = re.findall(r'^- \*\*((?:FR|SC)-\d+)\*\*:', spec, re.M)
mapped = re.findall(r'^\|\s+((?:FR|SC)-\d+)\s+\|', matrix, re.M)
check('matrix-covers-every-FR-and-SC-once', set(requirements) == set(mapped) and len(mapped) == len(set(mapped)), {'requirements': requirements, 'mapped': mapped})

addition = '      - name: experiment decision gates\n        run: |\n          node --test scripts/experiment-gate.test.mjs\n          node scripts/experiment-gate.mjs validate experiments/EXP-002-validation.json\n'
ci = read('.github/workflows/ci.yml')
old_ci = base('.github/workflows/ci.yml')
check('CI-only-four-added-lines', ci.count(addition) == 1 and ci.replace(addition, '') == old_ci)
jobs = yaml.safe_load(ci)['jobs']
old_jobs = yaml.safe_load(old_ci)['jobs']
check('CI-ten-jobs-preserved', len(jobs) == 10 and set(jobs) == set(old_jobs), list(jobs))
check('frontend-job-unchanged', jobs['frontend'] == old_jobs['frontend'])
for path in [
    '.claude/hooks/guard.mjs', '.claude/hooks/guard.test.mjs', '.claude/settings.json',
    '.github/workflows/factory.yml', 'specs/002-tce-transfer-e2e/validation-matrix.md',
    'specs/005-operator-ui/validation-matrix.md',
]:
    check('main-file-preserved:' + path, read(path) == base(path))

initial = json.loads(read('evidence/007/validation-manifest.json'))
initial_hashes = {item['path']: item['sha256'] for item in initial['files']}
archive_path = 'experiments/archive/EXP-002-validation.initial-draft.json'
archive_bytes = (root / archive_path).read_bytes()
check('initial-pilot-archive-exact', hashlib.sha256(archive_bytes).hexdigest() == initial_hashes['experiments/EXP-002-validation.json'])
archive = json.loads(archive_bytes)
active = json.loads(read('experiments/EXP-002-validation.json'))
changed_keys = [key for key in set(archive) | set(active) if archive.get(key) != active.get(key)]
check('pilot-only-context-changed', set(changed_keys) == {'problem', 'reference'}, sorted(changed_keys))
for path in ['scripts/experiment-gate.mjs', 'scripts/experiment-gate.test.mjs', *schema_paths]:
    check('gate-contract-unchanged:' + path, hashlib.sha256((root / path).read_bytes()).hexdigest() == initial_hashes[path])

report = {'passed': all(item['passed'] for item in checks), 'baseRef': args.base_ref, 'checks': checks}
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if report['passed'] else 1)
