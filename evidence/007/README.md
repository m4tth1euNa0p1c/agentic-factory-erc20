# Validation de la gouvernance des expériences

Date : 2026-11-08. Base distante : `d9a6a6ef1dd00ccb0f2a66dcc47437659ef80bde`.
Les empreintes exactes des fichiers testés figurent dans `validation-manifest.json` ; les
preuves ont été créées avant l'attribution du commit de livraison, sans inventer son SHA.
Livraison : [PR #24](https://github.com/m4tth1euNa0p1c/agentic-factory-erc20/pull/24).
Premier commit du code et des preuves : `9753f2ba29b73dc877687973ab80c0b566b0e93b`.

## Résultats locaux

| Vérification | Résultat | Trace |
|---|---|---|
| Contrôle de décision | 21 tests réussis, zéro échec | `decision-tests.log` |
| Hook de sécurité existant | 21 cas réussis | `existing-hook-tests.log` |
| Fiche pilote 002 | VALID_PLAN / DRAFT | `pilot-validate.json` |
| Départ de ce pilote | INCONCLUSIVE, code 1 attendu | `pilot-start.json` |
| YAML, frontmatter et schémas JSON | Valides | `validation-manifest.json` |
| Essai des skills en contexte neuf | A GO, B INCONCLUSIVE, C STOP, sur fixtures uniquement | `forward-test/SYNTHETIC-FORWARD-TEST-REPORT.md` |
| Rejeu des fixtures archivées avec le code final | Mêmes trois résultats | `forward-test-final-replay.json` |
| Revue indépendante de code/sécurité | Deux points corrigés ; aucun défaut restant identifié | `independent-review.md` |

La première revue a découvert une omission de titres SC sans ponctuation. `review-red.log`
conserve le test qui reproduisait un GO injustifié ; `review-green.log` conserve le passage
après correction. Le test couvre neuf formes de titre. Un autre test vérifie le second bilan
cumulatif d'une campagne de dix minutes et deux itérations.

## Reproduire les contrôles ciblés

Depuis la racine du dépôt :

```bash
node --test scripts/experiment-gate.test.mjs
node .claude/hooks/guard.test.mjs
node scripts/experiment-gate.mjs validate experiments/EXP-002-validation.json
node scripts/experiment-gate.mjs start experiments/EXP-002-validation.json
```

La dernière commande doit rendre INCONCLUSIVE et sortir avec le code 1 tant que le pilote
reste DRAFT. Ce résultat ne constitue pas un échec du validateur.

Exemple de rejeu d'une **fixture synthétique** archivée, sans lancer de produit :

```bash
node scripts/experiment-gate.mjs evaluate experiments/EXP-SYNTHETIC-SANDBOX-A.json evidence/experiments/EXP-SYNTHETIC-SANDBOX-A/SYNTHETIC-A-r1/run.json --root evidence/007/forward-test
```

Remplacer A par B ou C pour les autres alternatives ; leurs codes attendus sont 1.
Les traces initiales de l'agent neuf sont conservées sans réécriture. Les chemins absolus
mentionnés dans son rapport identifient son répertoire de travail d'origine ; les fichiers
ont été archivés ici avec leurs chemins relatifs et leurs empreintes inchangés.

## Portée de la preuve

Ces résultats démontrent le comportement du contrôle et l'utilisabilité des skills sur les
cas examinés. Ils ne démontrent pas un gain réel de productivité, une campagne TELA réussie,
la vérité d'un coût déclaré ou la présence d'une autorisation. Le coût des modèles et de
l'environnement de cette session reste inconnu ; les montants des fixtures sont fictifs.

Le contrôle CI ajouté teste le mécanisme et la structure du pilote. Il ne collecte pas les
mesures des futures expériences et n'impose pas seul leur acceptation sémantique. Les agents
doivent appliquer le protocole et la revue indépendante aux rapports de chaque campagne.
Le statut de la CI GitHub de livraison est suivi dans la PR, séparément de ces tests locaux.
