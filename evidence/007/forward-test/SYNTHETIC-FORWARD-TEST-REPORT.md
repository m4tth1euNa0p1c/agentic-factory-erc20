# Test prospectif d’utilisabilité — FIXTURES SYNTHÉTIQUES

## Verdict

Les deux skills permettent de construire sans lecture de leur suite de tests un protocole puis un dossier évalué par le CLI réel. A produit GO, B INCONCLUSIVE, C STOP. Ces résultats sont observés sur des fixtures et ne démontrent aucun gain réel du script de préparation. Aucun code produit, accès réseau ou appel fournisseur payant n’a été exécuté. Le coût de l’inférence utilisée pour cette rédaction n’a pas été mesuré et n’est pas présenté comme nul; les montants 0,80 EUR et 7 EUR appartiennent uniquement aux scénarios fictifs.

## Périmètre suivi

Sources lues: les deux SKILL.md, leurs deux assets JSON, les deux schémas contractuels et l’aide d’usage fournie par le CLI. Aucun fichier experiment-gate.test.mjs ni rapport d’un autre agent n’a été lu. Le dépôt source n’a pas été modifié. Les fichiers sont limités au répertoire temporaire forward-experiment-skill-test.

Le protocole opérationnel garde DRAFT et authorityRef=null. validate renvoie VALID_PLAN; start renvoie INCONCLUSIVE/PLAN_NOT_READY. Les versions A/B/C READY utilisent une référence intitulée authority-SIMULATION-ONLY.md dont le texte dit explicitement qu’aucune autorité n’est conférée. Le CLI répète authorizationGranted=false dans toutes les sorties.

## Résultats observés

| Cas | Valeurs de la fixture | Résultat du CLI | Sens limité |
|---|---|---|---|
| A | Gain 7 min; 10 essais; 0 perte; 12 min; 0,80 EUR sourcé fictivement; attention 3 min; 1 itération | GO (code 0) | Contrat de la simulation satisfait; aucune conclusion empirique ni décision de projet |
| B | Gain annoncé 7 min; 3 essais; coût null/UNMEASURED; autres champs identiques | INCONCLUSIVE (code 1) | Les deux critères ont 3/10 échantillons; budget monétaire inconnu |
| C | Comme A, coût fictif sourcé 7 EUR | STOP (code 1) | Le plafond 5 EUR l’emporte sur les PASS techniques |

## Ce que les skills ont concrètement imposé

1. Énoncer l’acteur et le problème sans inventer une demande client réelle.
2. Distinguer le gain relatif du garde-fou absolu; relier les deux exigences SC et annoncer la population.
3. Fournir une baseline comparable et des artefacts lisibles au lieu de répéter le résumé « gain 7 min ».
4. Déclarer toutes les dimensions du budget cumulé; garder null/UNMEASURED pour B.
5. Conserver un dossier unique par alternative, avec hashes et sortie du CLI.
6. Limiter GO au scope experiment; garder les décisions de financement, lancement, acceptation globale et déploiement humaines.

## Difficultés et ambiguïtés rencontrées avant la clarification reçue

**Pas de mode fixture explicite dans le contrat.** Les schémas refusent les propriétés additionnelles; les plans/runs n’offrent pas de champ synthetic/testMode. J’ai donc utilisé des identifiants SYNTHETIC, du texte explicite, un artefact NOTICE et des README voisins. Les valeurs READY, VALID et VERIFIED peuvent rester trompeuses si l’on sort un fragment de son contexte. Le texte d’assurance du CLI réduit ce risque mais ne le supprime pas.

**Un gain résumé ne remplit pas un protocole de comparaison.** Les scénarios fournis ne contenaient pas les durées brutes séparées. Pour exercer decrease, j’ai créé explicitement la décomposition fictive baseline=8 min et candidat=1 min. En situation réelle, il faudrait mesurer ces valeurs; inventer cette décomposition ne serait pas acceptable. La limite est mise en évidence par le skill, ce qui est utile.

**Les modèles ne donnent pas d’exemple d’observation rempli.** Le template run commence avec observations=[] et evidence=[]. Il faut ouvrir le schéma pour découvrir criterionId/value/samples/evidenceIds/baseline et la structure des preuves. Pour decrease, value doit être la mesure candidate, pas le gain déjà calculé. Une courte fixture d’exemple explicitement synthétique améliorerait l’appropriation.

**L’interface d’aide est minimale.** --help produit INVALID_DOCUMENT avec code 2 et un message Usage contenant --root. J’ai obtenu le bon usage ainsi, sans lire le script ni sa suite de tests. La documentation des skills consultée au départ ne distinguait pas encore INVALID_DOCUMENT des résultats d’expérience.

**Budget cumulé et alternatives.** J’ai dû annoncer que A/B/C sont des alternatives contrefactuelles et non trois essais successifs, pour éviter une addition artificielle des consommations. Avec une seule itération par alternative, l’absence initiale de règle explicite concernant startedAt de campagne n’a pas bloqué l’exécution. Je n’ai pas testé une campagne de plusieurs runs et ne tire aucune conclusion sur l’agrégation de l’historique.

**Indépendance.** Le skill demande un verifier distinct. Ce test confié à un agent neuf exerce la facilité d’usage, pas une véritable séparation expérimentateur/mesureur: le même agent a créé et relu les fixtures. Les sorties GO sont donc rapportées mécaniquement, sans auto-certification de la réalité du résultat.

## Clarification reçue après les contrôles

Le parent a indiqué avoir précisé le cumul de campagne, le début à la première tentative, la fin au bilan courant, l’absence d’agrégation automatique de l’historique et INVALID_DOCUMENT/code 2. Ces précisions répondent aux limites documentaires correspondantes. Aucun contrôle concluant n’a été refait et aucun résultat antérieur n’a été modifié pour s’y conformer.

## Séparation des décisions humaines

Elle a pu être gardée nette: le plan opérationnel est DRAFT; start le bloque; les READY sont des fixtures; toutes les sorties refusent explicitement de conférer une autorisation; scope=experiment ne clôture pas la spec; le rapport rappelle que la preuve est fictive et que la validation humaine est distincte. Une référence authorityRef seule reste une déclaration structurelle, pas une preuve d’autorité. Le CLI le dit explicitement.

A justifie seulement qu’un dossier fictif complet franchit les contrôles. B appelle d’abord l’établissement du coût avant de financer des observations supplémentaires. C impose l’arrêt de la branche fictive, même si le gain déclaré est favorable. Aucun cas n’autorise un lancement réel.

## Traces principales

- experiments/EXP-SYNTHETIC-SANDBOX-PREPARATION.json: préparation opérationnelle DRAFT.
- traces/SYNTHETIC-DRAFT-validate.json et SYNTHETIC-DRAFT-start.json: contrôles réels de ce DRAFT.
- experiments/EXP-SYNTHETIC-SANDBOX-A.json, -B.json, -C.json: plans de simulation.
- evidence/experiments/EXP-SYNTHETIC-SANDBOX-A/SYNTHETIC-A-r1/: run, artefacts et rapport A.
- evidence/experiments/EXP-SYNTHETIC-SANDBOX-B/SYNTHETIC-B-r1/: run, artefacts et rapport B.
- evidence/experiments/EXP-SYNTHETIC-SANDBOX-C/SYNTHETIC-C-r1/: run, artefacts et rapport C.
- traces/SYNTHETIC-case-results.json: trois résultats mécaniques regroupés.

Tous les chemins ci-dessus sont relatifs à /workspace/scratch/e8fa4f7effcd/forward-experiment-skill-test.

SHA-256 du CLI réellement invoqué pour les évaluations: 81e5ae3c6ff799a2c9cf3bff4dd4e6573a2f07854271b3e26a4196f677fd0304.
