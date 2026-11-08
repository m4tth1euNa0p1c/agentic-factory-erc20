# TELA Agentic Factory Constitution

Version: 1.2.0 · Ratified: 2026-11-08 · Last amended: 2026-11-08 (1.1.0: success-criteria traceability, per-run evidence; 1.2.0: measured, bounded experiments)

## Core Principles

### I. Spec-Driven, Evidence-Closed (NON-NEGOTIABLE)
Every change starts from a spec in `specs/NNN-*/` (spec → plan → tasks → implement, via Spec Kit).
A task is **done only when evidence exists**: a reproducible command, its output stored under
`evidence/`, and for any blockchain effect the `operationId`, `txHash`, receipt status and the
observed balance delta. "It works" without evidence is rejected by the verifier agent.
**Every** functional requirement **and every success criterion (SC-xxx)** of a spec is mapped in
`specs/NNN-*/validation-matrix.md` to a task, an executable test and a per-run proof
(`evidence/<spec>/<x>/runs/<RUN_ID>/` with `run.json`: full SHA, dirty flag, configuration, image digests, CI link).
A spec is "validated" only when all its SC rows have a PASS proof attached to a SHA; otherwise its status reads
"functional scenarios pass; criteria X, Y not demonstrated". An assertion must test the guarantee itself
(raw values, not display values that are clamped or derived from it).

### II. Visible Assumptions
Nothing inferred about the real TELA is presented as fact. Every statement about the target system
is recorded in `docs/registry/REGISTRE.md` as **FAIT** (sourced), **HYPOTHÈSE**, **DÉCISION** or
**PREUVE** (linked evidence). Specs reference registry IDs (`F-xx`, `H-xx`, `D-xx`, `P-xx`).

### III. Contracts Before Parallel Work
Interfaces shared between agents — REST API (OpenAPI), Kafka messages (JSON Schema in `schemas/`),
statuses, error codes, Solidity ABIs — are fixed and versioned before parallel implementation.
Breaking a shared contract requires a new version (`.v2`) and an orchestrator decision.

### IV. Exactly-Once Business Effect
Message-level guarantees are not trusted for external effects. Each business operation carries a
unique `operationId`; the on-chain contract rejects replays; the adapter persists the signed
transaction before broadcasting. An **unknown** result never releases a reservation; only a
confirmed failure does.

### V. Security by Default
Least privilege everywhere (separate DB roles, isolated Docker networks, Besu without admin APIs,
Web3Signer reachable only by the adapter). No secret in git, in logs or in agent context; ports bound
to `127.0.0.1`. Images and actions pinned. Security review (`security-audit` skill, guidance mode)
is mandatory on every PR touching contracts, signing, auth, or infra; full audit before any release.

### VI. Test-First & Reproducible
Tests are written from acceptance scenarios before implementation (Red → Green). The whole sandbox
starts with one scripted command; scenarios are replayable and deterministic (fixed chain id, seeded
accounts, pinned versions).

### VII. Simplicity
Smallest design that satisfies the spec. No speculative abstraction; deviations are justified in the
plan's *Complexity Tracking* table.

### VIII. Measured, Bounded Experiments
Frame every new experiment with a concrete problem and affected actor, a falsifiable hypothesis,
the current reference method, measurable criteria, a budget for time/money/human attention, and
predefined GO/MODIFY/STOP/INCONCLUSIVE rules. Reuse an existing protocol for tasks within its scope.
Freeze thresholds before observing results; retain invalid attempts and unknown costs explicitly.
An independent verifier compares observations to the protocol and reference. No missing evidence,
unmeasured required resource or checkbox-only success becomes GO. Track cumulative resource use
across retries and stop at the agreed boundary; existing authorization remains valid within scope.
Keep native per-run provenance intact. A separate experiment report references those artifacts
and records cumulative resource use; runner metadata is not automatically an experiment report,
and missing historical costs remain unknown. Existing PASS evidence retains its stated scope and
SHA; adding this principle does not automatically rerun previously validated campaigns.
A local gate checks submitted data, not provider billing or the truth of a measurement. GO for an
experiment does not authorize a release, new expenditure or acceptance of an entire spec.

## Delivery Workflow
- One spec = one feature branch `NNN-short-name` = one GitHub milestone; each user story = one issue.
- PRs target `main`, require green CI (build, tests, Slither, Gitleaks, Trivy) and a verifier report.
- Commits follow Conventional Commits and reference the issue (`Refs #N`).

## Governance
This constitution supersedes other practices. Amendments: PR modifying this file + version bump
(SemVer: MAJOR for removed/redefined principle, MINOR for added principle, PATCH for wording) +
entry in `docs/registry/REGISTRE.md`. Agents must check plans against these principles
(*Constitution Check* gate in `plan.md`).
