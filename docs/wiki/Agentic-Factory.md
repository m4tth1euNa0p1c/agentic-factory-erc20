# Agentic Factory

## Agents (`.claude/agents/`)

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

Lire les sources et SC, sélectionner une tâche, réutiliser/cadrer une fiche, contrôler le départ,
déléguer au spécialiste, vérifier indépendamment, examiner la sécurité, décider puis livrer par PR.
Chaque itération consomme le même budget global. Les inconnues restent visibles; regrouper les
questions utiles et poursuivre les préparatifs indépendants déjà autorisés.

## Contrôles exécutables

```bash
node scripts/experiment-gate.mjs validate experiments/EXP-002-validation.json
node scripts/experiment-gate.mjs start experiments/EXP-002-validation.json
node scripts/experiment-gate.mjs evaluate <fiche.json> <run.json>
node --test scripts/experiment-gate.test.mjs
```

La fiche pilote est DRAFT : `validate` peut réussir, tandis que `start` doit refuser un lancement
avant renseignement des inconnues. Cela ne bloque pas la préparation de l'essai.

Le contrôle vérifie la structure, la couverture des SC en mode acceptation de spec, les seuils,
les tailles d'échantillon déclarées, les empreintes et les budgets soumis. Il ne prouve ni la
véracité d'une mesure ni l'indépendance humaine d'un rôle; il n'a pas accès à la facturation.
Les instructions de rôle guident l'agent. Les limites du runner/fournisseur et les protections
de branche assurent les contraintes techniques correspondantes.

## Garde-fous existants

- Hook `PreToolUse` : cas testés d'accès aux secrets, introspection de conteneurs et commandes Git dangereuses; pas une isolation universelle.
- Permissions déclarées dans `.claude/settings.json`.
- `scripts/sandbox-exec.sh` : copie des fichiers commités, sans réseau, FS lecture seule, limites de ressources pour les commandes qui passent effectivement par ce wrapper.
- Un GO local ne déclenche pas de déploiement, de dépense ou de fusion automatique.

## Enseignements réutilisés

- Références globales : risque de consommation par un autre émetteur, corrigé par le scoping.
- Besu accessible par deux réseaux : couper un seul réseau ne simule pas toujours l'incident attendu.
- Ponder peut indexer avant la reprise de l'adaptateur : le statut peut converger directement vers SETTLED.
- Une valeur bornée à zéro ne démontre pas l'invariant brut; un test doit pouvoir détecter ce qu'il affirme vérifier.
- Une liste de jobs verts ne remplace pas la couverture de tous les critères de succès d'une spec.
