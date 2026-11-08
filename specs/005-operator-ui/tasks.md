# Tasks: Interface opérateur Angular (005)

**Input**: `specs/005-operator-ui/spec.md`, `schemas/openapi/tela-api.v1.yaml`, `specs/002-tce-transfer-e2e/data-model.md`
Stories P1 uniquement (US1, US2) ; US3 (filtre par statut) reste à faire.

## Phase 1 — Setup
- [x] T001 Scaffolder `frontend/` (Angular 22.2, standalone, routing, CSS, TS strict) 
- [x] T002 Client typé généré depuis l'OpenAPI (`npm run gen:api` -> `src/app/api/schema.d.ts`) (FR-001)
- [x] T003 Proxy dev `/api` -> `127.0.0.1:8080` (`proxy.conf.json`)

## Phase 2 — Logique pure, tests d'abord
- [x] T010 [P] `core/amount.ts` + tests : décimal -> unités minimales sans flottant (FR-003)
- [x] T011 [P] `core/status.ts` + tests : libellés D-06, UNKNOWN = « Résultat en cours de vérification »
- [x] T012 [P] `core/timeline.ts` + tests : transitions observées uniquement (FR-004)
- [x] T013 [P] `core/freshness.ts` + tests : bandeaux retard (> 10 s), régression, indisponible (US1)
- [x] T014 [P] `core/idempotency.ts` + tests : clé par soumission, conservée au nouvel essai (US2)

## Phase 3 — US1 Soldes (P1)
- [x] T020 `ApiService` (balances, indexer-status, operations) sans appel hors `/api/v1` (FR-002)
- [x] T021 Page compte : indexé / en attente / disponible par jeton ; `availableRaw`/`heldTotal` en « Diagnostic » (FR-005)
- [x] T022 Bandeau de fraîcheur (dernier bloc, âge, retard, régression, 503)
- [x] T023 Dégradé explicite : pas de donnée périmée présentée comme actuelle (soldes masqués sur 503)

## Phase 4 — US2 Transfert (P1)
- [x] T030 Formulaire de transfert (validation adresses/montant, Idempotency-Key)
- [x] T031 Gestion 202 / 200 (rejeu) / 409 INSUFFICIENT_AVAILABLE (disponible affiché) / 400 / 503
- [x] T032 Détail d'opération : polling 1 s jusqu'à terminal, operationId, txHash, bloc, motif, horodatages
- [x] T033 Chronologie issue de `/transitions` + test composant
- [x] T034 Liste des opérations récentes du compte

## Phase 5 — Livraison
- [x] T040 `frontend/Dockerfile` (node 24.15-alpine (Angular 22 exige >= 24.15) -> nginx-unprivileged 1.30.0-alpine) et `nginx.conf` (CSP, nosniff, frame-ancestors, Referrer-Policy, proxy `/api/`)
- [x] T041 `e2e/transfer.spec.ts` Playwright (écrit, documenté dans `frontend/README.md`)
- [x] T042 `npm test` et `npm run build` verts
- [ ] T043 Exécuter le E2E Playwright contre la pile et déposer la trace dans `evidence/005-operator-ui/` (SC-001)
- [ ] T044 Audit axe sur les trois écrans (SC-002)
- [ ] T045 Intégrer le service `frontend` dans `compose.yaml` (hors périmètre de cet agent)
- [ ] T046 US3 : filtre par statut dans la liste (P2)
- [ ] T047 Authentification opérateur (NEEDS CLARIFICATION de la spec)
