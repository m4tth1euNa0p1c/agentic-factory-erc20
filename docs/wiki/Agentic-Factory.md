# Agentic Factory

## Agents (10 rôles dans `.claude/agents/`)

| Agent | Périmètre | Livrable |
|---|---|---|
| orchestrator | specs, interfaces, registre, délégation, budget et décision | décision justifiée et prochaine étape bornée |
| experiment-designer | problème, hypothèse, référence, critères, budget et règles de décision | fiche d'expérience, sans auto-validation |
| network-devops | infra/, scripts/, compose, .github | contrôles du sandbox |
| smart-contracts | contracts/ | tests Foundry, couverture, Slither |
| backend-java | backend/ | tests métier et Testcontainers |
| blockchain-adapter | adapter/ | tests et scénarios de reprise |
| indexer | indexer/ | convergence indexée/on-chain |
| frontend | frontend/ | parcours Playwright |
| verifier | evidence/, scénarios tests/e2e | mesures, oracles indépendants et décision étayée |
| security-auditor | examen sécurité et rapports | revue security-audit |

## Skills

- Spec Kit : `speckit-specify / plan / tasks / analyze / implement / converge / clarify / checklist / constitution`.
- `security-audit` (Cloudflare, vendorisé @c1c8a8c, MIT) et `smart-contract-security`.
- `factory-run` : sélection et orchestration d'un essai borné.
- `design-experiment` : protocole à six rubriques et seuils préalables.
- `evaluate-experiment` : comparaison des résultats, preuves et budget.

## Six questions avant d'élargir le travail

| Question | Responsable | Trace |
|---|---|---|
| Qui rencontre quelle difficulté ? | experiment-designer | problem + sources |
| Quelle amélioration testons-nous ? | experiment-designer | hypothesis + réfutation |
| Comment fait-on aujourd'hui ? | experiment-designer, puis verifier pour la mesure | reference + baseline |
| Quel résultat justifiera la poursuite ? | designer; verifier contrôle | criteria + artefacts |
| Quel temps, coût et effort humain consacrer ? | orchestrator | budget + consommations cumulées |
| Poursuivre, modifier ou arrêter ? | orchestrator sur preuves indépendantes | GO/MODIFY/STOP/INCONCLUSIVE |

## Cycle `/factory-run NNN`

Lire les sources, le registre et les validations existantes, puis contrôler la matrice
`specs/NNN-*/validation-matrix.md` : chaque FR **et chaque SC** doit relier une tâche, un test
exécutable et une preuve par run attachée à un SHA. Un SC sans test crée une tâche avant toute
nouvelle exécution; une incohérence CRITICAL bloque le cycle.

Sélectionner une tâche débloquée, réutiliser/cadrer une fiche, contrôler le départ, déléguer au
spécialiste, vérifier indépendamment, examiner la sécurité, décider puis livrer par PR. Chaque
itération consomme le même budget global, avec au plus trois tentatives (ou moins si le protocole
l'impose). Les inconnues restent visibles; regrouper les questions utiles et poursuivre les
préparatifs indépendants déjà autorisés.

Les campagnes 002 ont déjà démontré SC-001 à SC-004 sur `7d4a02d` (registre P-21). Leur preuve
reste valable dans ce périmètre. La fiche pilote `EXP-002-validation` est DRAFT et ne commande
aucune relance automatique; un nouvel essai exige une question ou un changement explicite et
un budget connu avant son départ. L'UI 005 conserve ses preuves propres (registre P-22).

## Contrôles exécutables

```bash
node scripts/experiment-gate.mjs validate experiments/EXP-002-validation.json
node --test scripts/experiment-gate.test.mjs
```

Pour un nouvel essai avec fiche READY et budget renseigné, contrôler le départ puis évaluer son
rapport séparé :

```bash
node scripts/experiment-gate.mjs start <fiche.json>
node scripts/experiment-gate.mjs evaluate <fiche.json> <rapport-experience.json>
```

`validate` peut accepter une fiche DRAFT; `start` doit refuser son lancement. Cela ne bloque pas
la préparation et ne remet pas en cause les preuves techniques historiques déjà acquises.

Les sorties et `run.json` sous `evidence/<spec>/<scénario>/runs/<RUN_ID>/` conservent la provenance
native du runner : SHA complet, dirty flag, configuration, digests d'images et lien CI. Le rapport
conforme à `schemas/factory/experiment-run.v1.json` est distinct, référence ces artefacts et porte
les consommations cumulées, y compris les tentatives invalides. Les JSON du runner 002 ne sont
pas automatiquement conformes à ce contrat; ne pas les réécrire pour leur attribuer des coûts.
Une consommation inconnue reste `null`/`UNMEASURED` dans le rapport d'expérience.

Le contrôle vérifie la structure, la couverture des SC en mode acceptation de spec, les seuils,
les tailles d'échantillon déclarées, les empreintes et les budgets soumis. Il ne prouve ni la
véracité d'une mesure ni l'indépendance humaine d'un rôle; il n'a pas accès à la facturation.
Les instructions de rôle guident l'agent. Les limites du runner/fournisseur et les protections
de branche assurent les contraintes techniques correspondantes.

## Garde-fous

- Hook `PreToolUse` (`.claude/hooks/guard.mjs`) : **garde-fou par expressions régulières, testé contre 25 cas** — défense en profondeur, pas une frontière de sécurité (il ne prouve pas qu'aucun programme ne peut lire un secret ; il bloque aussi parfois du simple texte qui mentionne une commande interdite). Il bloque notamment la lecture de `.env`/clés, introspection de conteneurs, `/proc/*/environ`, `source .env`, montage de la racine, force-push, push vers `main`, contournement des hooks git et de la protection de branche.
- `main` protégée côté serveur : PR obligatoire, 9 checks requis, admins inclus. La CI compte aussi le job `frontend`, dixième job encore non requis par cette protection.
- Permissions dans `.claude/settings.json` : allowlist fermée (scripts, gh issue/pr, docker compose ps/logs/up/down).
- Code cible exécuté via `scripts/sandbox-exec.sh` : copie des fichiers commités par `git archive`, `--network none`, FS lecture seule, limites de ressources pour les commandes qui passent effectivement par ce wrapper.
- Un GO local ne déclenche pas de déploiement, de dépense ou de fusion automatique.

## Enseignements réutilisés

- Revue M-4 : références globales → squatting possible → références scopées par émetteur.
- E2E US4 : couper `chain` ne coupait pas Besu (Besu est aussi sur `signing`).
- E2E US2 : Ponder peut indexer avant que l'adaptateur ne redémarre → règlement sur preuve on-chain (D-14).
- Une valeur bornée à zéro ne démontre pas l'invariant brut; un test doit pouvoir détecter ce qu'il affirme vérifier.
- Une liste de jobs verts ne remplace pas la couverture de tous les critères de succès d'une spec.
