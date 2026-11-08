---
name: design-experiment
description: Transformer une demande d'amélioration de la factory ou de TELA en essai borné et réfutable. Utiliser avant une nouvelle piste, un ajout d'agent, une optimisation, une extension de spec ou une campagne de validation, pour préciser Problème, Hypothèse, Référence, Critère, Budget et Décision.
---

# Concevoir une expérience

1. Lire la spec, le registre et les preuves disponibles. Réutiliser une fiche existante si elle
   pose la même question; garder une seule expérience active pour le même périmètre.
2. Copier `assets/experiment.template.json` vers `experiments/EXP-<spec>-<sujet>.json`.
   Le contrat de référence est `schemas/factory/experiment.v1.json`.
3. Remplir les six rubriques ci-dessous avant d'implémenter l'essai.

| Rubrique | Question à traiter | Résultat attendu |
|---|---|---|
| Problème | Qui peine à accomplir quelle tâche, dans quelle situation ? | Acteur, difficulté concrète, source; ne pas présumer une demande client. |
| Hypothèse | Quel changement devrait produire quel effet, et qu'est-ce qui le réfuterait ? | Une proposition testable avec mécanisme et condition de réfutation. |
| Référence | Comment fait-on aujourd'hui, avec quels résultats connus ? | Méthode actuelle et sources; mesure absente explicitement signalée. |
| Critère | Quelle mesure justifie de continuer ? | Métrique, unité, seuil, échantillon, oracle et commande de collecte. |
| Budget | Que consomme cet essai ? | Plafonds de temps, argent, attention humaine et itérations; autorité de lancement. |
| Décision | Quand continuer, modifier ou arrêter ? | Règles préalables, avec INCONCLUSIVE si les données ne permettent pas de conclure. |

## Choisir des critères discriminants

- Extraire les critères **SC-xxx** de la spec, et pas seulement les tâches cochées.
- Utiliser `scope: spec_acceptance` uniquement pour accepter la spec entière : couvrir chaque SC
  par au moins un critère requis. Utiliser `scope: experiment` pour une question plus étroite;
  un GO sur cette question ne clôture pas la spec.
- Choisir `absolute` pour un invariant ou un seuil absolu; `decrease`/`increase` pour un gain
  mesuré par rapport à une baseline dans la même unité et des conditions comparables.
- Documenter la population, les conditions et le nombre d'observations dans `measurement`.
  Répéter des cas différents ne prouve pas une série de succès consécutifs du même scénario.
- Choisir un oracle qui peut détecter le défaut : une valeur déjà bornée à zéro ne prouve pas
  qu'un solde brut ne devient jamais négatif. Un arrêt avant diffusion ne prouve pas la reprise
  après acceptation de la transaction et perte de sa réponse.
- Employer `kind: guardrail` pour un invariant dont une violation impose l'arrêt de la piste.
- Séparer gain technique, utilité métier, fidélité à TELA et autorisation de déploiement.

## Fixer un budget proportionné

Compter depuis le début de la campagne le temps écoulé, le coût connu ou sa borne conservatrice
sourcée, les minutes d'attention humaine et les itérations, y compris les tentatives invalides.
Le rapport suivant reprend le cumul ; le CLI ne le reconstruit pas automatiquement.
Ne jamais convertir une donnée absente en zéro.
Le coût des modèles déjà utilisés peut être inconnu; ne pas appeler l'essai gratuit pour autant.
Un budget proposé ne crée aucune autorisation de dépense. Réutiliser celle du contexte si elle
couvre l'action; conserver une fiche DRAFT et avancer sur la préparation si elle ne la couvre pas.
Éviter les interruptions répétées : regrouper les seules questions qui changent le choix.

## Valider le protocole

```bash
node scripts/experiment-gate.mjs validate experiments/EXP-<spec>-<sujet>.json
node scripts/experiment-gate.mjs start experiments/EXP-<spec>-<sujet>.json
```

`validate` vérifie le dossier, y compris un DRAFT honnête. `start` exige READY et un budget
renseigné; il ne lance aucun outil, ne dépense rien et ne vaut pas permission externe.
Avant la mesure, figer l'empreinte de la fiche. Toute modification de seuil ou d'échantillon
après observation exige une nouvelle révision et une justification conservée.

Transmettre fiche, tâche, fichiers autorisés, plafond restant et preuve attendue au spécialiste.
Confier ensuite la mesure au verifier via `evaluate-experiment`; ne pas s'auto-attribuer GO.
