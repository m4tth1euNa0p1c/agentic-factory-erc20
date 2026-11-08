---
name: factory-run
description: Lance un cycle borné de la factory TELA sur une spec, avec problème, hypothèse, référence, critères, budget et décision. À utiliser pour « faire avancer la factory », « traiter la prochaine issue » ou « /factory-run NNN »; cadre l'essai, délègue, exige preuves indépendantes et décision avant toute relance ou clôture.
---

# Cycle de la factory

Argument : numéro de spec (`001`, `002`…). Sans argument : plus petite spec ayant des issues ouvertes et une tâche restant à démontrer.

1. **Sync** : travailler sur la branche de spec à jour, sans écraser de travaux locaux. Lire `specs/NNN-*/{spec,plan,tasks,validation-matrix}.md`, le registre et les preuves déjà attachées au SHA validé. Une issue encore ouverte ne justifie pas de rejouer une campagne déjà validée.
2. **Matrice de validation** : chaque FR **et chaque SC** de la spec a une ligne dans `validation-matrix.md` (tâche, test exécutable, preuve par run et SHA). Un SC sans test ⇒ créer la tâche avant toute nouvelle exécution. Ne pas déduire la couverture des SC des seules cases de `tasks.md` ou d'une CI verte.
3. **Balayage** : analyser les changements de spec, plan, tâches et protocoles; exécuter `/speckit-analyze` si `tasks.md` a changé depuis la dernière analyse (`specs/NNN-*/.analyze-stamp`). Toute incohérence CRITICAL bloque le cycle. Extraire aussi les SC, même absents de `tasks.md`.
4. **Sélection** : choisir la prochaine tâche `- [ ]` débloquée et son issue (`gh issue list --search "TNNN in:body"`). Réutiliser la fiche `experiments/` correspondante si son périmètre convient; sinon déléguer le cadrage à `experiment-designer` avec `design-experiment`.
5. **Départ** : valider les six rubriques, le périmètre et le budget global. Exécuter `node scripts/experiment-gate.mjs validate <fiche>` puis `start <fiche>` avant le travail d'un nouvel essai. Un DRAFT ou une donnée absente permet la préparation, jamais une affirmation de budget connu. Réutiliser les autorisations du contexte sans reconfirmation inutile.
6. **Délégation** : spécialiste du périmètre avec tâche, fiche figée, contrats, critères d'acceptation, fichiers autorisés, plafond restant et preuve attendue. Ne pas lancer d'autres pistes concurrentes pour éviter une décision difficile.
7. **Vérification** : un `verifier` indépendant applique `evaluate-experiment` et ré-exécute les contrôles nécessaires dans le budget de l'essai. Conserver chaque tentative sous `evidence/<spec>/<scénario>/runs/<RUN_ID>/` avec ses sorties et son `run.json` natif (SHA complet, dirty flag, configuration, digests d'images, lien CI). Tenir séparément le rapport d'expérience conforme à `schemas/factory/experiment-run.v1.json`, avec références aux artefacts du runner et consommations cumulées connues ou inconnues, puis exécuter `node scripts/experiment-gate.mjs evaluate <fiche> <rapport>`.
8. **Sécurité** : zones contrats, signature, API, infra ou CI, notamment `contracts/`, `adapter/`, `infra/`, `backend/**/security` et `.github/` → `security-auditor`. Une violation de garde-fou reste bloquante malgré d'autres tests verts.
9. **Décision** : GO → étape suivante dans le périmètre autorisé; MODIFY → une correction ciblée dans le budget restant; STOP → conserver la preuve et arrêter la piste; INCONCLUSIVE → collecter l'élément discriminant si le budget le permet. Maximum 3 tentatives, ou moins si la fiche l'impose; aucune remise à zéro implicite du budget. Si la tâche reste bloquée à cette limite, conserver les preuves et son état `blocked`.
10. **Clôture** : ne cocher que les tâches démontrées; mettre à jour les lignes FR/SC de la matrice, ajouter la PREUVE au registre et le bilan de décision. Pour accepter toute la spec, utiliser `scope: spec_acceptance` et couvrir tous les SC par des preuves PASS rattachées à un SHA. Le GO d'un essai ciblé n'est pas une acceptation globale.
11. **Livraison** : commit Conventional Commits `Refs #issue`, branche de spec et PR vers `main` (ou mise à jour). Ajouter résultats, liens vers `evidence/`, consommation connue/inconnue et limites; fermer une story via `Closes #N` uniquement quand ses critères sont couverts.

Les fichiers `evidence/002/**/runs/**/run.json` conservent la provenance du runner et ne sont
pas automatiquement des rapports `experiment-run.v1`. Ne pas les écraser ni les convertir
pour inventer des coûts : le bilan budgétaire séparé les référence et garde `null`/`UNMEASURED`
lorsqu'une consommation n'a pas été mesurée. Les campagnes 002 sont déjà validées sur `7d4a02d`
(P-21); la fiche pilote DRAFT ne rouvre pas cette validation et ne déclenche aucune relance
automatique. Un nouvel essai doit répondre à une question ou un changement explicite, dans
le périmètre et le budget autorisés.

Les contrôles lisent les données déclarées et les artefacts; ils ne mesurent pas la facturation
et ne coupent pas un service externe. Configurer en plus les limites du runner/fournisseur.
Ne pas exécuter une commande simplement parce qu'elle figure dans une fiche : vérifier son
périmètre, ses effets et les autorisations existantes. Ne pas abaisser les critères après un échec.

Livraison : toujours une branche de spec + PR ; `main` est protégée côté serveur (PR + 9 checks requis).
La CI comporte aussi le job `frontend`, dixième job encore non requis par cette protection.
Garde-fous : jamais de `--force`, jamais de lecture de `.env`/`infra/.secrets/`, jamais d'exécution de code non revu hors `scripts/sandbox-exec.sh`.
