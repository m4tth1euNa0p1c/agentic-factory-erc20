# Tasks — 008 Talan readiness

Ordre = chemin critique. `[P]` = parallélisable. Chaque tâche : preuve sous `evidence/008/<tâche>/`, PASS du `verifier`, revue `security-auditor` pour L1/L2/L4/L6.

## L1 — Garde-fous v2 (P0, US1) — prérequis à toute cible réelle
- [x] T001 Ajouter à `guard.test.mjs` les 22 contournements de l'audit A1 (doivent échouer avant correctif)
- [x] T002 `factory/targets/{sandbox,talan-dev,talan-staging}.json` (JSON : lisible sans dépendance par le hook) + lecteur de profil (`FACTORY_TARGET`, défaut `sandbox`)
- [x] T003 `guard.mjs` v2 : familles de règles FR-002, refus par défaut des commandes non analysables visant l'infra, contrôle de `glob`, matcher WebFetch/MCP
- [x] T004 `settings.json` durci (FR-003)
- [x] T005 `verifier.md` : reset uniquement en `sandbox`, contrôles en lecture sinon
- [x] T006 [P] `factory/perimeters.json` + application par le hook (FR-004), journalisation si type d'agent absent

## L2 — Abstraction forge et source unique (P0, US2)
- [ ] T010 `factory/forge/forge.sh` + `github.sh` + `gitlab.sh`, tests à blanc
- [ ] T011 `factory/policy.yaml` (déclencheur revue sécurité, layout preuves, limite d'essais, modèles épinglés)
- [ ] T012 Réécrire `orchestrator.md`, `factory-run/SKILL.md`, `verifier.md`, `security-auditor.md` pour n'utiliser que `forge.sh` et `policy.yaml`
- [ ] T013 Constitution + CLAUDE.md : vocabulaire neutre (« demande de changement », `Refs:`), renvoi à `policy.yaml`
- [ ] T014 [P] Check CI : aucun `gh ` hors `factory/forge/github.sh` (SC-002)

## L3 — Hygiène (P0/P1, US4) — indépendant, peut démarrer tout de suite
- [ ] T020 [P] Rétention des preuves : `summary.json` par scénario, runs en artefacts, `.gitignore` corrigé, migration des 156 fichiers
- [ ] T021 [P] `specs/ANALYSIS.md`, README à jour (005 livrée, 007, 008, A-03 résolue)
- [ ] T022 [P] Tri des issues : fermer #11 ; regrouper #17/#20/#27/#29 en backlog de durcissement ; labels #21–#23 ; réserver 006 pour #12
- [ ] T023 [P] CI : cache npm/Foundry/buildx, sous-modules shallow, fusion sandbox-e2e + e2e-002 ; mesure avant/après (SC-004)
- [ ] T024 [P] Images épinglées par digest, `.nvmrc`, Node aligné
- [ ] T025 [P] Lint/format : eslint+prettier, spotless, `forge fmt`+solhint, shellcheck ; job `lint`
- [ ] T026 [P] ABI générées depuis `contracts/out` ; drift-check `schema.d.ts`
- [ ] T027 [P] Harnais E2E sans Python

## L4 — Configuration 12-factor (P0, US3)
- [ ] T030 `deployments/<env>.json` + `config/profiles/<env>.env` ; `deploy-contracts.sh` refuse hors `sandbox`
- [ ] T031 Adaptateur : config zod stricte, `GAS_PRICING_MODE`, TLS/auth RPC et Web3Signer, SASL/TLS Kafka, readiness
- [ ] T032 Indexeur : `PONDER_REORG_WINDOW` obligatoire, `PONDER_SCHEMA`, start block du manifeste, Dockerfile multi-étapes
- [ ] T033 Backend : `@ConfigurationProperties @Validated`, SSL Postgres/Kafka, Prometheus, logs JSON
- [ ] T034 Frontend : `nginx.conf.template` (upstream, résolveur, Host par env)
- [ ] T035 Postgres : migrations à la place du script d'init ; topics Kafka déclaratifs
- [ ] T036 Non-régression : 4 scénarios E2E 002 en sandbox (SC-003)

## L5 — Artefacts de déploiement (P1, US5) — forme selon H-16
- [ ] T040 Charts Helm (ou Compose prod) avec probes, securityContext, NetworkPolicies
- [ ] T041 SBOM CycloneDX, signature cosign, push par digest

## L6 — CI GitLab (P1, US5) — selon H-12
- [ ] T050 `.gitlab-ci.yml` équivalent à `ci.yml`
- [ ] T051 Job factory protégé : déclenchement manuel/planifié, spec validée `^\d{3}$`, `resource_group`, secrets en variables masquées/protégées ou Vault
- [ ] T052 Templates `.gitlab/issue_templates`, `.gitlab/merge_request_templates` ; `publish-wiki.sh` paramétré
