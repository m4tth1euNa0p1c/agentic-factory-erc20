# TELA · Interface opérateur (spec 005)

Angular 22 (composants standalone, signaux, TypeScript strict). Aucune dépendance UI. Le navigateur ne parle
qu'à l'API TELA (`/api/v1`, chemin relatif) : aucune clé, aucun appel direct Besu / Web3Signer / Kafka.

## Commandes
Prérequis : Node >= 22.22.3 ou >= 24.15.

| Commande | Rôle |
|---|---|
| `npm ci` | installe les dépendances |
| `npm start` | serveur de dev http://127.0.0.1:4200, proxy `/api` -> `http://127.0.0.1:8080` (`proxy.conf.json`) |
| `npm test` | tests unitaires (runner Vitest d'Angular 22, mode non interactif) |
| `npm run build` | build de production dans `dist/frontend/browser` |
| `npm run gen:api` | régénère `src/app/api/schema.d.ts` depuis `schemas/openapi/tela-api.v1.yaml` (FR-001) |
| `npm run e2e` | Playwright (voir ci-dessous) |

## Écrans
- `/` : compte (adresse saisie, aucune valeur par défaut) : soldes indexé / en attente / disponible par jeton,
  fraîcheur de l'indexation (bandeaux « Indexation en retard » si âge > 10 s, régression / indisponible),
  section « Diagnostic » repliée (`availableRaw`, `heldTotal`), opérations récentes.
- `/transfer` : formulaire de transfert. Montant décimal (6 décimales) converti en unités minimales sans flottant ;
  une clé `Idempotency-Key` (UUID) par soumission, conservée tant que le contenu est identique (nouvel essai).
  Réponses 202 / 200 (rejeu) / 409 `INSUFFICIENT_AVAILABLE` (affiche le disponible) / 400 / 503.
- `/operations/:id` : détail, polling 1 s jusqu'à SETTLED / FAILED / REJECTED, chronologie construite uniquement
  à partir des transitions observées (D-14).

## Test E2E Playwright (non exécuté en CI locale)
Nécessite la pile TELA démarrée (API sur 127.0.0.1:8080) et un compte émetteur approvisionné en TCE.

```bash
npx playwright install chromium
E2E_FROM=0x<émetteur> E2E_TO=0x<destinataire> npm run e2e   # lance `npm start` séparément
```
Variables : `E2E_FROM`, `E2E_TO` (adresses publiques), `E2E_AMOUNT` (défaut `1,5`), `UI_BASE_URL`
(défaut `http://127.0.0.1:4200`), `E2E_EVIDENCE_DIR` (défaut `../evidence/005-operator-ui/playwright`, traces
et captures d'écran). Spec : `e2e/transfer.spec.ts`.

## Image de production
`docker build -t tela/frontend:dev frontend` : build Node 24.15 alpine (Angular 22 exige >= 24.15 ; 24.13 est trop ancien) puis `nginxinc/nginx-unprivileged`
(port 8080). `nginx.conf` proxifie `/api/` vers `http://backend:8080` et pose CSP `default-src 'self'`,
`X-Content-Type-Options`, `frame-ancestors 'none'`, `Referrer-Policy`. L'inlining du CSS critique est
désactivé pour rester compatible avec la CSP.
