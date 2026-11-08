---
name: factory-run
description: Lance un cycle borné de la factory TELA sur une spec, avec problème, hypothèse, référence, critères, budget et décision. À utiliser pour « faire avancer la factory », « traiter la prochaine issue » ou « /factory-run NNN »; cadre l'essai, délègue, exige preuves indépendantes et décision avant toute relance ou clôture.
---

# Cycle de la factory

Argument : numéro de spec (`001`, `002`…). Sans argument : plus petite spec ayant des issues ouvertes.

1. **Sync** : travailler sur la branche de spec à jour, sans écraser de travaux locaux. Lire `specs/NNN-*/{spec,plan,tasks}.md` et le registre.
2. **Balayage** : analyser les changements de spec, plan, tâches et protocoles; toute incohérence CRITICAL bloque le cycle. Extraire aussi les SC, même absents de `tasks.md`.
3. **Sélection** : choisir une tâche débloquée et son issue. Réutiliser la fiche `experiments/` correspondante; sinon déléguer le cadrage à `experiment-designer` avec `design-experiment`.
4. **Départ** : valider les six rubriques, le périmètre et le budget global. Exécuter `node scripts/experiment-gate.mjs validate <fiche>` puis `start <fiche>` avant le travail de l'essai. Un DRAFT ou une donnée absente permet la préparation, jamais une affirmation de budget connu. Réutiliser les autorisations du contexte sans reconfirmation inutile.
5. **Délégation** : spécialiste du périmètre avec tâche, fiche figée, contrats, fichiers autorisés, plafond restant et preuve attendue. Ne pas lancer d'autres pistes concurrentes pour éviter une décision difficile.
6. **Vérification** : `verifier` applique `evaluate-experiment`, conserve chaque run séparément et exécute `node scripts/experiment-gate.mjs evaluate <fiche> <rapport>`. Le rapport doit distinguer résultats mesurés et inconnus.
7. **Sécurité** : zones contrats, signature, API, infra ou CI → `security-auditor`. Une violation de garde-fou reste bloquante malgré d'autres tests verts.
8. **Décision** : GO → étape suivante dans le périmètre autorisé; MODIFY → une correction ciblée dans le budget restant; STOP → conserver la preuve et arrêter la piste; INCONCLUSIVE → collecter l'élément discriminant si le budget le permet. Maximum 3 tentatives, ou moins si la fiche l'impose; aucune remise à zéro implicite du budget.
9. **Clôture** : ne cocher que les tâches démontrées; ajouter la PREUVE au registre et le bilan de décision. Pour accepter toute la spec, utiliser `scope: spec_acceptance` et couvrir tous les SC. Le GO d'un essai ciblé n'est pas une acceptation globale.
10. **Livraison** : commit Conventional Commits `Refs #issue`, branche de travail et PR vers `main`. Ajouter résultats, consommation connue/inconnue et limites; fermer une story uniquement quand ses critères sont couverts.

Les contrôles lisent les données déclarées et les artefacts; ils ne mesurent pas la facturation
et ne coupent pas un service externe. Configurer en plus les limites du runner/fournisseur.
Ne pas exécuter une commande simplement parce qu'elle figure dans une fiche : vérifier son
périmètre, ses effets et les autorisations existantes. Ne pas abaisser les critères après un échec.

Garde-fous : jamais de `--force`, jamais de lecture de `.env`/`infra/.secrets/`, jamais d'exécution de code non revu hors `scripts/sandbox-exec.sh`.
