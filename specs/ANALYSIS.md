# Balayage complet des specs (cross-spec analysis)

> Exécuté le 2026-11-08 sur 000–005 (méthode `/speckit-analyze` appliquée à l'ensemble). Relancé à chaque modification de `tasks.md` (cf. skill `factory-run`, étape 2).

| ID | Sévérité | Specs | Constat | Résolution |
|---|---|---|---|---|
| A-01 | CRITICAL | 002 US2-3 / US4-2 | `ReferenceAlreadyUsed` classé à la fois `CONFIRMED` et `REJECTED` | **Corrigé** : jamais un rejet ; recherche du log d'origine ⇒ `CONFIRMED` |
| A-02 | HIGH | 002, 005 | Aucune authentification de l'API ; `from` choisi par l'appelant | Accepté pour v0 sandbox (API sur 127.0.0.1) ; **spec 006-authn** à créer avant tout environnement partagé |
| A-03 | MEDIUM | 005 US1 / OpenAPI | Fraîcheur de l'indexation : l'API expose `indexedAtBlock` mais pas le bloc courant | Ajouter `GET /api/v1/system/indexer-status` (bloc indexé vs tête) en 005 ; Ponder `chain_head` + lecture RPC Besu read-only |
| A-04 | MEDIUM | 001, 002 | Kafka en PLAINTEXT dans le sandbox | Accepté (réseau `bus` isolé) ; cible SASL_SSL/mTLS consignée en hypothèse de prod |
| A-05 | MEDIUM | 003 | Taux figé à la demande ou à l'exécution non défini | **Résolu** (revue 2026-11-08) : taux immuable D-18, TCE→TCD D-19, approve+swap D-20 ; 003 Ready |
| A-06 | MEDIUM | 004 | Nature de TIF inconnue | 004 bloquée tant que les sources TELA ne sont pas fournies |
| A-07 | LOW | 002 data-model | Transition `PUBLISHED → CONFIRMED` (cas A-01) absente du diagramme initial | **Corrigé** dans data-model.md |
| A-08 | LOW | 001 / 002 | `RECONCILE` utilise le topic de commandes : exige la clé = from pour garder l'ordre | Confirmé par le schéma (clé = from) |
| A-09 | HIGH | 002 | Revue externe 2026-11-08 : SC-002/003/004 sans test ni preuve ; SC-001 partiel ; la couverture ne portait que sur les FR | **Corrigé** : `validation-matrix.md` (FR **et** SC), campagnes `tests/e2e/campaigns/`, Constitution 1.1.0 |
| A-10 | MEDIUM | 002 US4 | Le scénario UNKNOWN coupait le réseau **avant** diffusion ; le cas « accepté par Besu puis résultat perdu » n'était pas testé | **Corrigé** : US4-5 + scénario D (`pause-after-broadcast`) |
| A-11 | MEDIUM | 002 US3/SC-004 | Assertion « disponible jamais négatif » lue sur une valeur bornée à 0 ; double comptage transitoire entre indexation et règlement | **Corrigé** : disponible en un seul snapshot SQL (`pending` = réservations non encore indexées), `availableRaw` exposé, échantillonnage continu |
| A-12 | LOW | 002 / 005 | Cycle de statuts présenté comme obligatoire alors que D-14 autorise `PUBLISHED → SETTLED` | **Corrigé** : US1-2 et 005 FR-004 |
| A-14 | HIGH | 002 | Le modèle de lecture Ponder régresse après redémarrage (fenêtre de réorg par défaut), hypothèse H-10 fausse | **Corrigé** : D-23 (`reorgWindow: 0` + garde de watermark Java), sonde `probe-readmodel-consistency.sh` |
| A-13 | LOW | preuves | Champ `commit` vide (Git for Windows + MSYS_NO_PATHCONV) ; preuves écrasées à chaque exécution | **Corrigé** : `run.json` par exécution ; anciennes preuves dans `evidence/legacy/` |

## Couverture exigences → tâches
- 001 : FR-001..010 couverts par T001–T015 (FR-010 ↔ T013).
- 002 : FR-001..012 couverts (FR-009 ↔ T042/T043, FR-012 ↔ T017/T024/T032/T044).
- 003–005 : pas encore de `tasks.md` (Draft) — générés après clarification.

## Constitution
Aucune violation. Écarts justifiés dans *Complexity Tracking* (001 : Foundry sur réseau `signing` ; 002 : outbox, journal adaptateur).
