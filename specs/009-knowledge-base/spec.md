# Feature Specification: Base de connaissances de la factory

**Feature Branch**: `009-knowledge-curator`
**Created**: 2026-11-10
**Status**: Implemented (v1)
**Input**: « Auditer WeKnora pour prendre les meilleures parties et créer agent + skill qui maintiennent les explications pour la factory SDD. » Décision D-25. Audit WeKnora : hors dépôt (`C:\Users\matth\audits\WeKnora-audit\`), confidentiel.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Les explications suivent le code (Priority: P1)
Quand une source change (spec, preuve, registre, code), les pages qui en dérivent sont signalées périmées et recompilées par l'agent `knowledge-curator` avant la PR.

**Acceptance Scenarios**:
1. **Given** une source modifiée, **When** `knowledge-lint` s'exécute, **Then** la page qui la déclare est `stale-page`.
2. **Given** les pages recompilées, **When** `--update-sources` puis `knowledge-lint`, **Then** 0 erreur et plus de `stale-page`.

### User Story 2 — Les explications ne mentent pas (Priority: P1)
Lien cassé, chemin inexistant, ID de registre inconnu, hypothèse présentée comme fait : la CI échoue.

### User Story 3 — Répondre avec citations (Priority: P2)
Mode `ask` : réponse uniquement depuis les fichiers lus, chaque affirmation citée, sinon « pas de source ». Mesure : questions de référence.

## Requirements *(mandatory)*
- **FR-001**: Agent `knowledge-curator` à périmètre d'écriture `docs/wiki/`, `docs/knowledge/`, `tests/knowledge/` ; registre en proposition seulement.
- **FR-002**: Skill `knowledge-maintenance` (ingest, lint, ask, flag) + règles d'écriture.
- **FR-003**: `scripts/knowledge-lint.mjs` déterministe (règles E/W, score de santé, `--json`, `--update-sources`), auto-testé.
- **FR-004**: `docs/knowledge/sources.json` : page → sources + sha256.
- **FR-005**: `tests/knowledge/golden-qa.json` + `scripts/knowledge-eval.mjs`.
- **FR-006**: Intégration : `/factory-run` étape 7b, CI, factory kit (module `knowledge`), wiki.

## Success Criteria *(mandatory)*
- **SC-001**: auto-test du lint 13/13.
- **SC-002**: wiki courant : 0 erreur, 0 page non sourcée.
- **SC-003**: questions de référence 10/10.
- **SC-004**: le contrôle a trouvé au moins une incohérence réelle avant intégration (preuve qu'il est utile) — constaté : la page *Talan-Readiness* publiée citait l'audit 008 et H-12…H-17 absents de la branche (7 erreurs).

## Hors périmètre
- Recherche vectorielle / déploiement de WeKnora (option B, réévaluable comme expérience G9).
- Patterns WeKnora destinés aux garde-fous (politique de risque, approbation liée à l'appel exact) : versés à #31.
