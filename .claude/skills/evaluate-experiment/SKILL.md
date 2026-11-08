---
name: evaluate-experiment
description: Comparer les résultats d'un essai TELA ou de la factory à son protocole, sa référence et son budget. Utiliser après une exécution, avant une clôture ou une relance, et lorsqu'un rapport annonce PASS ou GO sans preuve suffisante. Produit une décision GO, MODIFY, STOP ou INCONCLUSIVE et ses limites.
---

# Évaluer une expérience

1. Lire la fiche figée et ses six rubriques, la spec source et les artefacts bruts. Ne pas
   prendre le résumé de l'implémenteur comme preuve. Conserver les tentatives invalides.
2. Copier `assets/run.template.json` dans un dossier unique
   `evidence/experiments/<experiment-id>/<run-id>/run.json`. Utiliser le contrat
   `schemas/factory/experiment-run.v1.json`. Ne jamais écraser un run précédent.
3. Renseigner SHA complet du code testé, SHA-256 de la fiche et de la configuration,
   début/fin, identifiant de run et, dans les artefacts, seed et identifiant CI si disponibles.
   Le rapport est un bilan de campagne : `startedAt` reste le début de la première tentative,
   `endedAt` est la fin du bilan courant. Conserver séparément les traces de chaque tentative.
4. Pour chaque critère requis, collecter valeur, taille d'échantillon et références de preuve.
   Pour `decrease` ou `increase`, collecter aussi la baseline et ses preuves comparables.
   `value` est la mesure candidate, pas le gain déjà calculé : exemple purement illustratif,
   baseline 40 min et candidat 32 min donnent `value: 32`, `baseline.value: 40`, gain 8 min.
   Ne jamais inventer ces deux mesures à partir d'un gain annoncé.
5. Renseigner les consommations cumulées de toutes les tentatives de cette campagne, y compris
   les tentatives invalides. Reprendre le bilan antérieur sans remettre les compteurs à zéro.
   Utiliser `null` et `UNMEASURED` si le coût n'est pas connu; une borne supérieure doit avoir
   une source et rester identifiée comme telle. Le CLI n'agrège pas les rapports précédents :
   le verifier contrôle ce cumul contre leurs traces. `wallMinutes` est le temps écoulé depuis
   le début de campagne, pas seulement le temps CPU ni la durée du dernier run.
6. Exécuter le contrôle et conserver sa sortie à côté du rapport :

```bash
node scripts/experiment-gate.mjs evaluate experiments/EXP-<spec>-<sujet>.json evidence/experiments/<experiment-id>/<run-id>/run.json
```

## Interpréter sans surpromettre

| Sortie | Sens | Suite |
|---|---|---|
| GO | Critères requis étayés et budgets connus respectés dans le périmètre déclaré. | Proposer la prochaine étape bornée; aucune fusion ou mise en production implicite. |
| MODIFY | Objectif non atteint, garde-fous respectés et budget disponible. | Une modification causale ciblée; conserver les seuils et décompter l'itération. |
| STOP | Budget dépassé/épuisé selon les résultats, ou garde-fou violé. | Arrêter cette tentative, conserver les preuves et expliquer ce qui serait nécessaire pour une nouvelle piste. |
| INCONCLUSIVE | Mesure, baseline, provenance ou coût insuffisants; run invalide. | Collecter uniquement l'élément discriminant manquant dans le budget restant. |

Le script vérifie structure, seuils, échantillons déclarés, correspondance des empreintes et
budgets déclarés. Il ne certifie pas la véracité d'une observation ni l'indépendance d'un agent.
Ne pas transformer une sortie valide en certification de la plateforme.

`INVALID_DOCUMENT` (sortie 2) signale un contrat mal formé : corriger le dossier, sans le
compter comme une mesure valide. Sortie 0 : GO; sortie 1 : MODIFY, STOP ou INCONCLUSIVE.

## Vérifications indépendantes

- Lire les définitions des SC et les associer aux assertions réellement exécutées.
- Vérifier le moment de l'injection de panne et l'effet économique, pas seulement le nom du test.
- Vérifier des valeurs brutes cohérentes, pas un affichage qui neutralise le défaut recherché.
- Distinguer un test sur la vraie stack, un test avec doublures et un examen statique.
- Pour un essai du skill sur des fixtures, marquer les IDs, artefacts et bilan `SYNTHETIC`;
  une sortie GO sur ces données ne constitue aucune preuve de gain réel ni d'autorisation.
- Pour des répétitions, contrôler même version, configuration, population et conservation des runs;
  une série avec un run invalide n'est pas une série de succès consécutifs.
- Comparer l'effet à la baseline lorsque l'on revendique une amélioration. Un PASS technique ne
  démontre ni utilité client ni avantage économique.
- Si la preuve réfute l'hypothèse, recommander STOP même si le contrôle de structure est valide.
  Ne jamais faire évoluer INCONCLUSIVE en GO par simple vote d'agents.

Retourner à l'orchestrateur une décision, sa preuve principale, sa limite et une seule prochaine
action utile. Ne pas corriger le code produit ni réduire un critère pour obtenir GO.
