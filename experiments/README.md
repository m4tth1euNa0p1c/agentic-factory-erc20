# Fiches d'expérience

Une nouvelle expérience utilise le modèle de `design-experiment`. Elle définit une question,
une référence, ses critères et un budget avant mesure. Les résultats sont enregistrés séparément
et reliés aux preuves natives des runners ; les fichiers de campagne existants restent intacts.

## Exemple historique 002

`EXP-002-validation.json` est le brouillon préparé pendant la PR #24, avant les nouvelles
campagnes de la PR #25. L'original exact est conservé dans
`archive/EXP-002-validation.initial-draft.json`. Le fichier actif ajoute un renvoi au nouvel état.

La [matrice 002](../specs/002-tce-transfer-e2e/validation-matrix.md) consigne maintenant les
quatre SC validés sur `7d4a02d`. Cette validation ne dépend pas du passage de cet ancien
brouillon en READY. Ne pas relancer les campagnes ni inventer un budget historique pour
obtenir un GO rétroactif dans le nouveau format. Le minimum de 100 mesures de latence proposé
dans le brouillon n'était pas une exigence de la spec ; la campagne réelle de 60 opérations
est jugée selon la spec et le protocole effectivement appliqués.

Pour une autre charge, une autre configuration de réseau ou une optimisation de débit (#26),
créer un nouveau protocole répondant à cette nouvelle question, avec ses seuils préalables.
