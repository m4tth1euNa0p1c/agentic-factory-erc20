# Feature Specification: Talan readiness — factory portable et stack déployable hors sandbox

**Feature Branch**: `008-talan-readiness`
**Created**: 2026-11-09
**Status**: Draft
**Input**: « Optimiser le repository au max pour préparer l'agentic factory et l'envoyer sur la stack et l'infra Talan (GitLab, nœuds…) ; d'abord audit, ensuite branche. » Audit : `docs/audit/2026-11-09-talan-readiness.md`. Registre : H-04, H-11, D-23, H-12…H-17.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — La factory ne peut pas abîmer une infra réelle (Priority: P1)
En tant que propriétaire, je lance la factory avec `FACTORY_TARGET=talan-dev` ; toute action non explicitement autorisée par le profil de cible (push forcé, merge, lecture de secret, kubectl/helm/terraform/ssh/vault mutants, signature ou diffusion vers un endpoint non listé, reset d'environnement) est refusée avant exécution.

**Acceptance Scenarios**:
1. **Given** le profil `talan-dev`, **When** un agent tente l'une des 22 commandes de contournement de l'audit (A1), **Then** le hook la bloque (exit 2) et le test `guard.test.mjs` le démontre.
2. **Given** le profil `sandbox`, **When** le vérificateur rejoue les scénarios, **Then** il peut réinitialiser la sandbox ; **Given** un profil réel, **Then** il ne fait que des contrôles en lecture.
3. **Given** un profil inconnu ou absent, **Then** la factory retombe sur `sandbox` côté outils et refuse tout endpoint non local.

### User Story 2 — La factory fonctionne sur GitHub ou GitLab (Priority: P1)
Les agents et skills passent par une interface forge unique (`issue-list`, `issue-find`, `issue-comment`, `mr-open`, `mr-update`, `label`) avec deux implémentations (`gh`, `glab`).

**Acceptance Scenarios**:
1. **Given** `FORGE=gitlab` et `glab` authentifié, **When** `/factory-run NNN` s'exécute, **Then** aucune commande `gh` n'est invoquée (vérifié par un test à blanc / dry-run).
2. Les règles (déclencheur de revue sécurité, chemin des preuves, limite d'essais, modèles épinglés) existent en un seul endroit (`factory/policy.yaml`).

### User Story 3 — Chaque service se configure par environnement (Priority: P1)
Un service démarre contre `sandbox` ou `talan-dev` sans modification de code : endpoints, chainId, mode de gas, bloc de départ, fenêtre de réorg, TLS/SASL, schéma Ponder viennent de la configuration et sont validés au démarrage.

**Acceptance Scenarios**:
1. **Given** une variable obligatoire manquante, **Then** le service refuse de démarrer avec un message nommant la variable.
2. **Given** `GAS_PRICING_MODE=eip1559`, **Then** l'adaptateur émet des tx de type 2 (test unitaire) ; `zero` reste le défaut sandbox.
3. Le scénario E2E nominal passe toujours en sandbox (non-régression).

### User Story 4 — Dépôt rationalisé (Priority: P2)
Preuves : un résumé par scénario versionné, les runs bruts en artefacts CI. CI avec cache et lint. Specs, analyse croisée, README et issues reflètent l'état réel.

### User Story 5 — Déployable depuis la CI (Priority: P2)
Images construites, signées et poussées par digest ; manifestes de déploiement (forme selon H-16) ; pipeline GitLab équivalent à la CI GitHub.

### Edge Cases
- Commande composée ou encodée (`bash -c`, `eval`, sous-shell, variables) visant une action interdite → refus par défaut si non analysable.
- Profil réel mais endpoint de la sandbox → refus (pas de mélange de cibles).
- Valeurs Talan inconnues (H-12…H-17) → les profils réels contiennent des `[NEEDS CLARIFICATION]` ; aucun défaut silencieux.

## Requirements *(mandatory)*
- **FR-001**: Profils de cible `factory/targets/{sandbox,talan-dev,talan-staging}.yaml` : endpoints autorisés, chainId, actions permises (`deploy`, `reset`, `broadcast`), commandes infra autorisées (lecture seule par défaut), source des secrets.
- **FR-002**: Hook v2 en refus par défaut pour les familles : push forcé (toutes formes), merge/approve/protection/variables forge, lecture de `.env*` par tout processus, dump d'environnement, kubectl/helm/terraform/ssh/vault mutants, `--private-key`, `eth_send*`/`eth_sign*` hors allowlist ; matcher étendu à WebFetch et MCP ; champ `glob` contrôlé.
- **FR-003**: `settings.json` : `disableBypassPermissionsMode`, deny `.env*`, plus d'auto-autorisation de `gh pr:*` ni de déploiement.
- **FR-004**: Périmètres d'agents dans `factory/perimeters.json`, appliqués par le hook quand le type d'agent est disponible (sinon journalisé).
- **FR-005**: Interface forge `factory/forge/forge.sh` + backends `github.sh`, `gitlab.sh`.
- **FR-006**: `factory/policy.yaml` source unique ; agents, skills, CLAUDE.md, templates y renvoient.
- **FR-007**: Contrat de configuration par service, documenté et validé au démarrage (zod côté adaptateur, `@ConfigurationProperties @Validated` côté backend).
- **FR-008**: Adaptateur : modes de gas `zero|legacy|eip1559`, TLS/auth RPC et Web3Signer, SASL/TLS Kafka, readiness réelle.
- **FR-009**: Indexeur : `PONDER_REORG_WINDOW` obligatoire, schéma paramétrable, bloc de départ depuis le manifeste de déploiement.
- **FR-010**: Manifeste `deployments/<env>.json` (adresses, chainId, bloc de déploiement) consommé par tous les services.
- **FR-011**: Politique de rétention des preuves (résumé versionné, runs en artefacts).
- **FR-012**: CI : cache npm/Foundry/buildx, lint par langage, une seule mise en route de la stack E2E.

## Success Criteria *(mandatory)*
- **SC-001**: 100 % des commandes de contournement de l'audit (A1) bloquées en profil réel, 0 régression sur les 25 cas existants de `guard.test.mjs`.
- **SC-002**: 0 occurrence de `gh ` hors `factory/forge/github.sh` et de la CI GitHub (grep en CI).
- **SC-003**: Les 4 scénarios E2E 002 passent en sandbox après refactor de configuration.
- **SC-004**: Durée de la CI réduite d'au moins 30 % à périmètre de tests constant (mesure avant/après sur `main`).
- **SC-005**: Chaque inconnue H-12…H-17 est soit tranchée (fait), soit visible dans le profil concerné.

## Hors périmètre
- Authentification de l'API (#12, spec 006 réservée) — prérequis séparé avant tout environnement partagé.
- Exécution réelle contre l'infra Talan : nécessite les réponses H-12…H-17 et l'accord du propriétaire.
