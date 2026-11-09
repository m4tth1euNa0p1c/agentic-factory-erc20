# Audit « Talan readiness » — 2026-11-09

**Objet** : préparer la factory agentique et la stack TELA à sortir de la sandbox locale pour travailler sur la stack et l'infra Talan (GitLab, nœuds Besu réels, key store Web3Signer, Kafka/PostgreSQL managés, déploiement CI).
**Base auditée** : `main` @ `8530a55`. PR #24 (gouvernance d'expériences) hors périmètre.
**Méthode** : 3 audits indépendants en lecture seule (factory/portabilité forge, couplage runtime/infra, hygiène/qualité). Le hook `guard.mjs` a été sondé avec 22 commandes (simulées, non exécutées).
**Statut des affirmations** : faits avec `fichier:ligne` ; les hypothèses sont marquées **(H)** et à confirmer avec Talan.

## Synthèse

| Axe | Verdict | Bloquants |
|---|---|---|
| Garde-fous factory | ❌ insuffisant hors sandbox | Le hook ne connaît que GitHub/Docker ; 22/22 commandes dangereuses « infra réelle » passent |
| Portabilité forge | ❌ couplé GitHub | `gh` codé en dur dans orchestrateur, skill factory-run, settings, hook, CI |
| Stack runtime | ❌ sandbox-only | gas 0 / tx legacy, pas de TLS/SASL, pas d'auth API, nginx lié au DNS Docker, aucun artefact de déploiement |
| Hygiène dépôt | ⚠️ correct, à rationaliser | Pas de bloat (61 Mo = sous-modules Foundry) ; preuves éparpillées, CI sans cache ni lint, specs/issues désynchronisées |

**Le dépôt n'est pas lourd** : `.git` = 61 Mo dont 57 Mo de sous-modules (OZ, forge-std) ; le dépôt propre ≈ 1,1 Mo. `evidence/` = 181 fichiers / 180 Ko.

## A. Factory — garde-fous et portabilité

### P0
- **A1 Hook insuffisant.** `guard.mjs` laisse passer (exit 0, testé) : `git push origin +main`, `git -C . push -f`, `cp .env x`, `node -e readFileSync('.env')`, `python -c open('.env')`, `env | grep KEY`, `export -p`, `kubectl delete ns`, `helm upgrade`, `terraform apply -auto-approve`, `ssh … systemctl stop besu`, `vault kv get`, `cast send --rpc-url https://… --private-key`, `curl … eth_signTransaction`, `gh pr merge` (sans `--admin`), `gh api …/rulesets`, `glab mr merge`, `glab api …/protected_branches`, `glab variable list`. `Grep` avec `glob: ".env"` non contrôlé (`guard.mjs:16`). Matcher sans WebFetch ni MCP (`settings.json:38`).
- **A2 Modèle de permissions.** Deny `.env` énumérés un par un (`settings.json:4-14`) au lieu de `.env*` ; pas de `disableBypassPermissionsMode` ; `gh pr:*` (donc `gh pr merge`) et `scripts/deploy-contracts.sh` auto-autorisés (`settings.json:20-23`).
- **A3 Couplage GitHub** : `orchestrator.md:10,14,18`, `factory-run/SKILL.md:13,17,18,20`, `factory.yml` (trigger `issue_comment`, corps du commentaire injecté dans le prompt l.37).
- **A4 Le vérificateur réinitialise l'environnement** (`verifier.md:12` : `sandbox.sh reset && up`) — destructif sur un environnement partagé.

### P1
- **A5 Périmètres d'agents non appliqués** : énoncés en prose (`backend-java.md:7`…), aucun contrôle par le hook. (H) les versions récentes de Claude Code exposent le type d'agent dans l'entrée du hook PreToolUse.
- **A6 Règles dupliquées et contradictoires** : sélection de tâche (milestone/labels vs `tasks.md`), déclencheur de revue sécurité (4 listes différentes : `CLAUDE.md:23`, `factory-run:16`, `constitution.md:39`, PR template l.12), chemin des preuves (`evidence/<task-id>/` dans 7 agents vs `evidence/<spec>/<x>/runs/<RUN_ID>/` dans la constitution).
- **A7 Déterminisme** : modèles en alias (`sonnet`/`opus`), seule borne `--max-turns 80`, pas de manifeste de run (modèle, hash de prompt, versions), « 3 essais puis blocage » non appliqué.
- **A8 Couplages sandbox** dans agents/skills : noms de réseaux Docker (`network-devops.md:11`, `smart-contract-security/SKILL.md:22`), endpoints `127.0.0.1`/`besu:8545` (`sandbox.sh`, `tests/e2e/lib.sh`, `db-read.sh:9`), chemin utilisateur (`security-auditor.md:13`).
- **A9** Constitution/CLAUDE.md/wiki parlent de « PR », `Refs #N`, milestone GitHub, wiki GitHub (`publish-wiki.sh:5,7`).

## B. Runtime / infra — ce qui serait faux sur un réseau réel

### P0
- **B1 Gas nul + tx legacy** : `adapter/src/processor.ts:92` (`gasPrice: 0n`), `signer.ts:12`, `deploy-contracts.sh:10` ; valide uniquement si H-04 (zeroBaseFee) est vraie chez Talan.
- **B2 Contrats** : la sandbox déploie et alimente ses propres contrats ; chez Talan ils existent déjà et `transferWithReference` est notre ajout (H-11). Compatibilité non prouvée (#13) — **premier risque fonctionnel**.
- **B3 Bloc de départ** : `TOKENS_START_BLOCK` vaut 0 par défaut (`adapter/src/config.ts:23`, `ponder.config.ts:16`, `compose.yaml:165,185`) → backfill depuis la genèse et `findReferenceLog` scanne depuis 0 (`chain.ts:81-90`).
- **B4 Kafka sans SASL/TLS** (`adapter/src/main.ts:23`, `compose.yaml:107`).
- **B5 API sans authentification** (`backend/pom.xml`, OpenAPI sans `security`) → #12.
- **B6 Web3Signer/Besu sans TLS ni auth** (`signer.ts:18`, `chain.ts:20`).
- **B7 nginx lié à Docker** : résolveur `127.0.0.11`, upstream `backend:8080`, allowlist Host (`frontend/nginx.conf:13,25,26`).
- **B8 PostgreSQL** : rôles/schémas créés par un script d'init de conteneur (`infra/postgres/init/01-roles.sh`), Ponder exige `CREATE ON DATABASE` (l.20), pas de `sslmode`.
- **B9 Aucun artefact de déploiement** : ni Helm/Kustomize, ni push registry, images `tela/*:dev`.

### P1
- **B10 `reorgWindow: 0`** (`ponder.config.ts:30`, D-23) correct seulement avec finalité instantanée (QBFT/IBFT2) → paramètre par environnement.
- **B11 Nonces** (`processor.ts:86-88`) : trou de nonce si une tx journalisée est évincée du txpool ; collision si un autre système Talan signe pour les mêmes comptes (H).
- **B12 Web3Signer en mode eth1 sur clés fichiers** (`compose.yaml:60-64`, `bootstrap-env.sh:37-50`) → Vault/KMS/HSM à configurer ; l'adaptateur n'utilise que `eth_signTransaction` (peu d'impact code).
- **B13 Paramètres sandbox** : chainId 48151 (`bootstrap-env.sh:20`), Kafka RF 1, schéma Ponder fixe `ponder_tela` (`indexer/Dockerfile:11`).
- **B14 Images** : aucune épinglée par digest (contredit `veille-2026-11.md:41`), tags flottants (`maven:3.9-eclipse-temurin-25`), image indexer mono-étape avec devDependencies, Node 24.13 vs 24.15.
- **B15 Observabilité** : logs texte côté backend, actuator `health,info` seulement, `/health` de l'adaptateur sans contrôle Kafka/DB/RPC, aucune métrique.

## C. Hygiène et qualité

### P0
- **C1 Preuves** : 156 fichiers `runs/` versionnés ; la règle `.gitignore` `evidence/runs/` ne correspond pas au chemin réel ; nommage incohérent (`002/`, `005-operator-ui/`, `legacy/`).
- **C2 Docs/issues désynchronisées** : `specs/ANALYSIS.md:3,9,25` (couvre 000–005, ignore 005 livrée et A-03 résolue) ; #11 livrée par #28 ; #17/#20/#27/#29 = même nature (suivis de durcissement) ; #21–#23 sans labels ; #12 réserve « 006 » sans dossier.
- **C3 CI sans cache** : pas de `cache: npm`, ni cache Foundry, ni buildx ; sous-modules clonés en entier ×3 ; la stack est démarrée deux fois (sandbox-e2e + e2e-002).

### P1
- **C4 Aucun lint/format** (eslint, spotless, solhint/`forge fmt`, shellcheck).
- **C5 Couverture** : pas de seuil (forge affiche, pas de JaCoCo, pas de couverture vitest) ; indexeur sans tests ; backend 2 classes de test pour 18 sources.
- **C6 ABI copiée 3 fois** (`contracts/abi`, `adapter/src/abi.ts`, `indexer/abis/TelaTokenAbi.ts`) → générer depuis `contracts/out`.
- **C7 Scénarios jamais exécutés en CI** : `002-adapter.sh`, `probe-readmodel-consistency.sh`, campagnes SC, Playwright.
- **C8 Harnais E2E** dépend de Python (`jget`, sc003, sc004) → `jq`/Node.

### P2
- SBOM + signature cosign ; Renovate (GitLab) groupé ; branches fusionnées à supprimer ; tests de mutation.

## Inconnues à lever avec Talan (deviennent des hypothèses H-12…H-17)

| ID | Question | Conditionne |
|---|---|---|
| H-12 | GitLab Talan : auto-hébergé ? version ? runners Docker ou Kubernetes ? registry ? | Lot 2 (forge), Lot 6 (CI) |
| H-13 | Réseau Besu : consensus/finalité (QBFT ?), base fee / min gas price, permissioning, TLS/JWT RPC | B1, B10, B6 |
| H-14 | Contrats TELA réels : adresses, bloc de déploiement, présence d'une référence d'opération | B2, B3 |
| H-15 | Key store Web3Signer : Vault, HSM, AWS/Azure KMS ? mTLS client ? | B12, B6 |
| H-16 | Cible de déploiement : Kubernetes + Helm, ou VM + Compose ? Vault / External Secrets ? | B9, B8 |
| H-17 | Kafka et PostgreSQL managés : SASL mécanisme, TLS, droits DDL accordés | B4, B8 |

## Plan d'optimisation (spec 008)

| Lot | Contenu | Prio | Dépend de |
|---|---|---|---|
| L1 Garde-fous v2 | Profils de cible, hook « refus par défaut » sur infra réelle, settings durcis, verifier non destructif hors sandbox, tests de contournement | P0 | — |
| L2 Abstraction forge | `factory/forge/` (github \| gitlab), agents/skills neutres, `factory/policy.yaml` source unique | P0 | L1 |
| L3 Hygiène | Rétention des preuves, ANALYSIS/README, tri des issues, cache CI, digests, lint | P0/P1 | — |
| L4 Configuration 12-factor | Profils `config/profiles/*`, contrat de config validé par service, gas EIP-1559, start block, reorgWindow, TLS/SASL, nginx templatisé | P0 | H-13…H-17 pour les valeurs |
| L5 Artefacts de déploiement | Helm (ou Compose prod selon H-16), migrations Postgres, topics IaC, images signées par digest | P1 | L4, H-16 |
| L6 CI GitLab | `.gitlab-ci.yml` équivalent, job factory protégé (variable de pipeline validée, pas de texte libre) | P1 | L2, H-12 |

La factory ne doit **jamais** viser un environnement Talan avant que L1 soit fusionné et vérifié.
