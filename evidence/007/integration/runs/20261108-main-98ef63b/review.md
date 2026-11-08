# Revue de réconciliation de PR #24 avec main

Base main : `98ef63b9fdc72b608d3f9f764bb01c32ae4d5f45`.
Ancien head #24 : `e546e4e8bfbfde7875cfce82b532fcdbe5b3feb0`.

## Objectif

Réunir la gouvernance des expériences de #24 avec les changements fusionnés dans #25 et #28.
Le produit, les campagnes existantes, le hook et le workflow factory de main sont conservés.
Les nouvelles instructions reconnaissent la validation 002 acquise ; elles ne lancent aucune
campagne et ne transforment pas des résultats existants en expérience budgétaire rétroactive.

## Décisions d'intégration

- Constitution 1.2.0 : conserver le principe I de main et ajouter VIII.
- Registre : conserver D-18 à D-24 et P-15 à P-22 ; gouvernance sous D-25, preuve initiale sous P-23.
- Conserver le job frontend et les dix jobs CI ; ajouter seulement les contrôles expérimentaux
  au job factory existant. Les neuf checks actuellement obligatoires restent une configuration GitHub.
- Conserver les métadonnées natives des runners ; un rapport d'expérience les référence sans
  inventer coût, autorité ou préenregistrement.
- Conserver le brouillon initial exact de 002 en archive ; son contexte actuel renvoie à la matrice.

## Revue des campagnes existantes

Une revue en lecture seule, par un agent distinct, a contrôlé les quatre campagnes, les quarante
preuves et métadonnées individuelles de SC-001, les scripts et les snapshots de SC-004.
Verdict : SC-001 à SC-004 démontrés dans les conditions de sandbox documentées, code
`7d4a02d860a4ed99afff311a9463965a7438b1aa`. Aucune stack n'a été rejouée par cette revue.

- SC-001 : 40/40 PASS, dix occurrences de chaque scénario, même version et mêmes images.
- SC-002 : 119 crashs réels répartis 30/20/20/22/27 sur cinq points, 120 opérations réglées,
  120 événements et débit de 120000000 unités, égal au débit attendu.
- SC-003 : p50 1,23 s et p95 2,22 s consignés pour 60 opérations à une demande toutes les trois
  secondes, blocs de deux secondes. Le SQL de calcul a été lu ; les soixante latences individuelles
  ne sont pas archivées dans ce dossier, donc le percentile n'a pas été recalculé hors de la base.
- SC-004 : 1000 requêtes, 100 acceptées et 900 refusées ; **103** snapshots, minimum brut recalculé
  à zéro. Les 97 snapshots appartiennent à la campagne précédente. Les intervalles effectivement
  observés sont de 1,115 à 3,817 secondes : il s'agit d'un échantillonnage, pas d'une preuve continue.

Les quatre campagnes indiquent le même SHA, les mêmes empreintes Compose/genesis et les mêmes
sept images. `ci` est nul : ces campagnes sont locales. Le `dirty: true` de trois campagnes est
expliqué dans la matrice par les pointeurs LATEST ; le git status historique n'est pas archivé
pour le réattester indépendamment. Ces limites ne sont pas converties en nouvel échec fonctionnel.

Sources immuables :

- [Matrice 002](https://github.com/m4tth1euNa0p1c/agentic-factory-erc20/blob/98ef63b9fdc72b608d3f9f764bb01c32ae4d5f45/specs/002-tce-transfer-e2e/validation-matrix.md).
- [Manifeste des 40 exécutions](https://github.com/m4tth1euNa0p1c/agentic-factory-erc20/blob/98ef63b9fdc72b608d3f9f764bb01c32ae4d5f45/evidence/002/campaign-sc001/runs/20261108T172015Z-24324/runs.jsonl).
- [SC-004 et ses 103 snapshots](https://github.com/m4tth1euNa0p1c/agentic-factory-erc20/tree/98ef63b9fdc72b608d3f9f764bb01c32ae4d5f45/evidence/002/campaign-sc004/runs/20261108T165652Z-17196).

## Suivis de lecture du code

La revue de cohérence ne relève pas de nouvelle surréservation démontrée. Elle distingue les
défauts de présentation de données suivants, à suivre dans #27 :

- `OperationRepository.map` consulte `wasNull()` après `tx_hash`, et peut présenter un
  `block_number` SQL nul comme zéro. Le même motif dans `IndexedBalances` était déjà signalé.
- `TransferController.getBalances` lit le head après les montants ; la fraîcheur annoncée peut
  correspondre à une lecture plus récente. Inclure head et montants dans le même SELECT est la
  correction proposée ; le dernier bloc de modification d'un compte n'est pas le head de chaîne.
- Le test de régression de l'indexeur vérifie les réservations, mais son nom couvre également
  le règlement : ajouter une assertion directe sur `settle()` pendant la régression serait utile.

Précision H-10 : la restauration à un checkpoint antérieur ne réfute pas l'atomicité d'une
transaction. Le [runtime Ponder 0.18.6](https://github.com/ponder-sh/ponder/blob/c6e1375cf1529348efaec07b6399dbaa456d9bb6/packages/core/src/runtime/multichain.ts)
traite événements, flush et checkpoint dans une transaction. Monotonicité dans le temps et
atomicité doivent être distinguées. Le réglage de reprise pour cette sandbox QBFT n'est pas
une garantie universelle pour toute interruption ou reconfiguration de chaîne.

## Revue de l'intégration

Les quatre résolutions de conflit ont été vérifiées par l'agent qui les a effectuées : principe I
et lignes historiques du registre conservés, IDs uniques, dix rôles documentés et diff sans
erreur de whitespace. Une seconde revue ciblée du diff d'intégration est consignée dans
`integration-review.md` ; les commandes et résultats locaux sont consignés dans le run natif.
