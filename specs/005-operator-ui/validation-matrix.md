# Matrice de validation — 005

| Exigence | Vérification | Fichier | État |
|---|---|---|---|
| FR-001 client typé | types générés depuis l'OpenAPI, `npm run gen:api` ; compilation stricte | `frontend/src/app/api/schema.d.ts` | build vert |
| FR-002 pas d'accès direct Besu/Web3Signer/Kafka | seul `ApiService` (`/api/v1`) ; CSP `default-src 'self'` | `core/api.service.ts`, `nginx.conf` | revue + build |
| FR-003 décimal 6 déc. -> chaîne entière | tests unitaires (0, 1 unité, 6 déc., >6 rejeté, zéros, valeurs énormes) | `core/amount.spec.ts` | vert |
| FR-004 chronologie = transitions observées | tests unitaires + test composant (RECEIVED, PUBLISHED, SETTLED sans BROADCAST) | `core/timeline.spec.ts`, `operation-detail.spec.ts` | vert |
| FR-005 `available` affiché, `availableRaw`/`heldTotal` en diagnostic | structure de la page compte (section repliée) | `account-page.ts` | revue ; pas de test automatisé, E2E à venir |
| US1-1 bandeau « indexation en retard » | tests unitaires (seuil 10 s, régression, 503) | `core/freshness.spec.ts` | vert |
| US2-1 suivi jusqu'à SETTLED | test composant (arrêt du polling à SETTLED) + E2E | `operation-detail.spec.ts`, `e2e/transfer.spec.ts` | unitaire vert ; **E2E PASS** (`evidence/005-operator-ui/playwright/`) |
| US2-2 UNKNOWN = vérification, pas échec | `status.spec.ts`, `operation-detail.spec.ts` | idem | vert |
| US2-3 409 affiche le disponible | logique dans `transfer-page.ts` | — | pas de test automatisé |
| Clé d'idempotence conservée au nouvel essai | tests unitaires | `core/idempotency.spec.ts` | vert |
| SC-001 Playwright parcours nominal | `frontend/e2e/transfer.spec.ts` | `evidence/005-operator-ui/playwright/evidence.json` | **PASS 2/2** sur la stack réelle (backend 7d4a02d) |
| SC-002 audit axe sans violation critique | — (à ajouter : @axe-core/playwright) | | **non démontré** |
