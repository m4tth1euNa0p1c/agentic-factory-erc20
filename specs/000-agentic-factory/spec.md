# Feature Specification: TELA Agentic Factory

**Feature Branch**: `main` (fondation)
**Created**: 2026-11-08
**Status**: Implemented (v0)
**Input**: « Une équipe d'agents qui analyse, développe, teste et documente TELA, avec un orchestrateur qui organise leur travail et exige des preuves de fonctionnement. »

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cycle piloté par spec (Priority: P1)
Un humain (ou un déclencheur CI) lance `/factory-run 002` ; l'orchestrateur sélectionne la prochaine tâche débloquée, la délègue à l'agent du périmètre, exige une vérification indépendante et une revue sécurité, puis met à jour tâches, registre, issue et PR.

**Acceptance Scenarios**:
1. **Given** une tâche ouverte dans `tasks.md`, **When** le cycle tourne, **Then** un seul agent spécialiste écrit dans son périmètre et un `evidence/<task>/REPORT.md` est produit par `verifier`.
2. **Given** un verdict FAIL 3 fois, **Then** l'issue reçoit le label `blocked` et le cycle s'arrête.

### User Story 2 — Garde-fous de sécurité des agents (Priority: P1)
**Acceptance Scenarios**:
1. **Given** un agent tente de lire `.env` ou `infra/.secrets/`, **Then** le hook `guard.mjs` bloque l'appel (exit 2).
2. **Given** un agent tente `git push --force` ou `--no-verify`, **Then** l'appel est bloqué.
3. **Given** une PR touchant `contracts/`, `adapter/`, `infra/`, `.github/`, **Then** une revue `security-auditor` (skill Cloudflare security-audit) est attachée.

### User Story 3 — Hypothèses visibles (Priority: P2)
Toute affirmation sur TELA est classée F/H/D/P dans `docs/registry/REGISTRE.md` et référencée par les specs.

## Requirements *(mandatory)*
- **FR-001**: Agents définis dans `.claude/agents/` : orchestrator, network-devops, smart-contracts, backend-java, blockchain-adapter, indexer, frontend, verifier, security-auditor.
- **FR-002**: Skills : Spec Kit (`speckit-*`), `security-audit` (Cloudflare, vendorisé, commit figé), `smart-contract-security`, `factory-run`.
- **FR-003**: Hooks PreToolUse testés (`node .claude/hooks/guard.test.mjs`) en CI.
- **FR-004**: Workflow GitHub `factory.yml` permettant de déclencher la factory par commentaire `/factory` (requiert le secret `ANTHROPIC_API_KEY`).

## Success Criteria *(mandatory)*
- **SC-001**: 100 % des tests de hooks verts.
- **SC-002**: Chaque PR fusionnée contient un lien vers une preuve `evidence/`.
