# Plan — gouvernance des expériences

## Architecture

- Conserver les neuf agents existants; ajouter `experiment-designer`.
- Le designer cadre; les spécialistes réalisent; le verifier mesure; l'orchestrateur arbitre.
- Contrats partagés : `schemas/factory/experiment.v1.json` et `experiment-run.v1.json`.
- Commande locale : `scripts/experiment-gate.mjs` (Node 24, bibliothèques standard uniquement).
- Les chemins de preuve sont relatifs au dépôt, contrôlés avant toute lecture.
- La CI exécute les tests de décision dans le job déjà requis `factory hooks tests`.

## Constitution Check

- Preuves : sorties de tests et essai indépendant, sans prétendre à une campagne TELA réelle.
- Hypothèses : pilote 002 DRAFT historique, budgets proposés non assimilés à une autorisation de dépense ; validation 002 acquise séparément dans la PR #25.
- Contrats : schémas fixés avant intégration des skills.
- Sécurité : aucune lecture des secrets, aucun code produit lancé; revue des nouveaux lecteurs de fichiers et du changement CI.
- Simplicité : un rôle ajouté et deux skills; pas de nouveau framework d'orchestration, dépendance, service ni MCP.
- Amendement : principe VIII ajouté, version de constitution 1.2.0 et décision D-25. Le principe I renforcé par main 1.1.0 (matrice FR/SC et preuves par run) est conservé.

## Intégration de main

Référence : `98ef63b9fdc72b608d3f9f764bb01c32ae4d5f45` (PR #25 et #28 fusionnées).
La mise à jour de #24 est une fusion sur la branche de spec, sans réécriture d'historique.
Conserver les campagnes 002, l'interface 005, le hook à 25 cas, le workflow factory et le job
frontend. Les anciennes preuves 007 restent historiques ; les vérifications de cette
intégration ont leur propre dossier de run. Les métadonnées des campagnes et le rapport
`experiment-run.v1.json` restent deux documents distincts reliés par leurs preuves.

## Écart de suivi

La livraison conserve une spec et une branche distinctes (`007-experiment-governance`), avec
une issue par user story (#21, #22, #23). Cette extension de la factory est rattachée au
milestone `000-agentic-factory` existant plutôt qu'à un milestone supplémentaire. La spec 006
reste réservée à l'authentification suivie par #12. Aucun écart aux contrôles de fusion.

## Budget de cette évolution

Portée : construction et vérification des instructions et du contrôle local, puis PR.
Aucun nouveau service payant ni activation du workflow Anthropic. Les coûts de l'environnement
et des modèles déjà utilisés ne sont pas mesurés ici et ne sont pas présentés comme nuls.
La fiche pilote conserve une autorité de lancement non renseignée tant que l'essai n'est pas cadré.
