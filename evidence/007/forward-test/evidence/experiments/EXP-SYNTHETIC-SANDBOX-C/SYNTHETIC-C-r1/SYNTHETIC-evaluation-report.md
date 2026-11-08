# Rapport de FIXTURE SYNTHÉTIQUE — cas C

## Décision mécanique observée: STOP

Les deux critères techniques fictifs passent, mais le coût fictif sourcé est 7 EUR pour un plafond de 5 EUR. Le CLI produit BUDGET_EXCEEDED: moneyAmount.

La seule observation réelle est le résultat du CLI sur des fichiers fictifs. Ni le gain, ni les dix essais, ni les inventaires, ni le coût ne sont des preuves de performance réelle. Le commit produit et les timestamps sont explicitement fictifs. Les empreintes de fichiers sont réelles mais attestent seulement l’identité de ces fixtures.

## Application des skills

Le skill design-experiment a conduit à remplir les six rubriques, relier SC-001 et SC-002, choisir decrease pour la durée et absolute/guardrail pour les pertes, décrire population et oracle, fixer le budget cumulé et conserver les règles de décision. Le skill evaluate-experiment a conduit à construire un run unique à partir du modèle, référencer et hacher les artefacts, garder la taille réelle de la fixture, déclarer les coûts manquants explicitement, puis conserver le résultat du CLI.

Les commandes produit du protocole ont été remplacées par une commande de lecture de fixtures. Ce test ne prépare ni n’exécute une sandbox. Les trois variantes sont des alternatives contrefactuelles d’un seul scénario, pas trois essais successifs à sommer.

## Limites et décision humaine

La référence d’autorité est une fixture sans autorité effective. La fiche opérationnelle demeure DRAFT avec authorityRef=null. La sortie porte authorizationGranted=false, specAccepted=false et specAcceptanceGatePassed=false. Le responsable conserve le choix de financer, lancer, adopter ou déployer. Aucun de ces choix n’est réalisé.

Le concepteur de fixtures et leur lecteur sont le même agent; aucune indépendance de mesure n’est revendiquée. Le résultat STOP est cité comme sortie mécanique et n’est pas un GO attribué à un projet réel par son implémenteur.

## Une prochaine action utile

Arrêter cette branche et documenter la cause du dépassement; une éventuelle nouvelle piste nécessiterait un protocole et une autorité effectifs distincts.

## Traces

- Plan: experiments/EXP-SYNTHETIC-SANDBOX-C.json
- Rapport machine d’entrée: evidence/experiments/EXP-SYNTHETIC-SANDBOX-C/SYNTHETIC-C-r1/run.json
- Entrées brutes fictives: synthetic-raw-pairs.json
- Collecte locale réelle de ces fixtures: SYNTHETIC-collection-trace.json
- Contrôles réels de ces fixtures: SYNTHETIC-validate-trace.json, SYNTHETIC-start-trace.json, SYNTHETIC-evaluate-trace.json

Code de sortie de evaluate: 1. SHA-256 du CLI observé: 81e5ae3c6ff799a2c9cf3bff4dd4e6573a2f07854271b3e26a4196f677fd0304.
