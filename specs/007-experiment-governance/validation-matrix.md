# Matrice de validation — spec 007

Cette matrice relie chaque FR et chaque SC à une tâche, à son contrôle et à une preuve.
Le dossier initial `evidence/007/` reste historique (code publié dans `9753f2b`, PR #24).
La réconciliation avec main `98ef63b` a son propre run :
`evidence/007/integration/runs/20261108-main-98ef63b/` (noté **INT** ci-dessous).
Les fixtures synthétiques ne prouvent aucun gain réel ni aucune consommation fournisseur.
Recontrôle local PASS sur les sources du commit `93a743a31c6ab6b971e5d1e17527ef1132964207` :
21 tests de décision, 25 cas du hook et 33 contrôles de contrats/documentation. Le run précise
la matérialisation partielle et l'identité des blobs ; les logs sont ajoutés après ce commit.

## Exigences fonctionnelles

| ID | Tâche | Contrôle | Preuve |
|---|---|---|---|
| FR-001 | T003 | Revue du rôle experiment-designer, de son périmètre et des dix rôles documentés | INT/review.md ; `.claude/agents/experiment-designer.md` |
| FR-002 | T003/T008 | Revue des deux skills et de leur intégration au cycle ; essai en contexte neuf | `evidence/007/forward-test/SYNTHETIC-FORWARD-TEST-REPORT.md` ; INT/review.md |
| FR-003 | T002 | `node --test scripts/experiment-gate.test.mjs` ; validation des deux schémas et templates | INT/decision-tests.log ; INT/contracts.json |
| FR-004 | T002 | Tests DRAFT/READY, données manquantes et run invalide ; validate/start du pilote historique | INT/decision-tests.log ; INT/pilot-validate.json ; INT/pilot-start.json |
| FR-005 | T002 | Tests d'intégrité, chemins sensibles/sortants et commande inerte | INT/decision-tests.log |
| FR-006 | T002 | Tests de coûts/attention inconnus, borne sourcée, dépassement et garde-fou | INT/decision-tests.log |
| FR-007 | T002 | Test d'amélioration sans baseline puis avec preuve liée | INT/decision-tests.log |
| FR-008 | T002 | Tests de couverture SC, dont neuf formes de titres Markdown | INT/decision-tests.log ; `evidence/007/review-red.log` |
| FR-009 | T005/T008 | Diff CI limité au job existant ; frontend et autres jobs de main conservés ; aucun workflow payant lancé | INT/review.md ; INT/contracts.json ; CI de la PR |
| FR-010 | T004/T008 | Pilote annoté historique, original exact archivé, validation 002 reconnue dans sa matrice | INT/contracts.json ; `experiments/README.md` |

## Critères de succès

| ID | Tâche | Test et résultat attendu | Preuve / état |
|---|---|---|---|
| SC-001 | T002/T006 | Le gate refuse les dossiers incomplets/altérés et les SC oubliés | PASS ; INT/decision-tests.log, 21/21 |
| SC-002 | T002/T006 | GO, MODIFY, STOP et INCONCLUSIVE sont discriminés | PASS ; INT/decision-tests.log, 21/21 |
| SC-003 | T006 | Essai des skills en contexte neuf, avec preuves synthétiques et coûts inconnus explicites | PASS initial ; `evidence/007/forward-test/SYNTHETIC-FORWARD-TEST-REPORT.md` |
| SC-004 | T005/T006/T008 | Schémas/docs/pilote/CI cohérents ; les 25 cas du hook de main passent | PASS ; INT/contracts.json ; INT/hook-tests.log ; INT/review.md |

Le `run.json` d'INT décrit l'exécution native des contrôles locaux, avec SHA complet et
empreintes des fichiers. Il n'est pas un rapport de coût `experiment-run.v1.json`. La CI
de livraison est référencée dans la PR ; le run local ne se présente pas comme une campagne CI.
