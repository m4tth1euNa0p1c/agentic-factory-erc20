# Registre des faits, hypothèses, décisions et preuves

> Règle (Constitution §II) : toute affirmation sur TELA est classée ici. Les specs citent les IDs.
> Une HYPOTHÈSE est levée (→ FAIT ou remplacée) dès que les sources TELA réelles sont disponibles.

## FAITS documentés (source : diapositives 3 à 8 de la présentation TELA)

| ID | Fait | Source |
|---|---|---|
| F-01 | Chaîne d'écriture : Angular → Java → Kafka → adaptateur TypeScript/Viem → Web3Signer → Besu | Diapo chaîne applicative |
| F-02 | Chaîne de lecture : Besu → Ponder → PostgreSQL Ponder → Java → Angular | Diapo chaîne de lecture |
| F-03 | Actifs : TCE, TCD, TIF et un contrat d'échange à taux fixe `TalanFixedRateSwap` | Diapo actifs |
| F-04 | Taux d'échange annoncé : 1 TCE = 1,15 TCD | Diapo actifs |
| F-05 | Modèle d'exécution : demande enregistrée → transmise → exécutée → résultat restitué | Diapo exécution |
| F-06 | Le disponible tient compte du solde indexé et des montants en attente | Diapo règle métier |
| F-07 | Livraison : versions identifiables, déploiements scriptés, scénarios rejouables | Diapo livraison |

## HYPOTHÈSES (à confirmer avec le code TELA réel)

| ID | Hypothèse | Impact si fausse | Spec |
|---|---|---|---|
| H-01 | Une demande = un seul transfert (pas de lot) | Modèle d'opération, contrat | 002 |
| H-02 | TCE/TCD/TIF sont des ERC-20 à **6 décimales** | Arrondis du swap, affichage | 001, 003 |
| H-03 | Modèle custodial : chaque utilisateur a un compte blockchain dont la clé est détenue par Web3Signer ; l'adaptateur signe `from = compte utilisateur` | Droits de signature, nonce | 002 |
| H-04 | Réseau privé à coût de gas nul (`zeroBaseFee`, `min-gas-price=0`) | Financement en ETH des comptes | 001 |
| H-05 | Le swap est alimenté en TCD par un compte trésorerie (liquidité pré-déposée) | Contrat swap | 003 |
| H-06 | Arrondi du swap à l'inférieur, en faveur du pool | Contrat swap | 003 |
| H-07 | TIF = jeton de part de fonds avec émission/rachat par un rôle opérateur | Spec TIF | 004 |
| H-08 | Java lit les soldes dans les tables Ponder (lecture seule, schéma dédié) | Couplage Java/Ponder | 002 |
| H-10 | Deux propriétés distinctes du modèle de lecture Ponder : (a) **atomicité SQL** — solde et exécution d'un même lot publiés dans la même transaction : observée vraie (sonde 10 ops, P-16) ; (b) **monotonie temporelle** — pas de retour à un ancien checkpoint : **fausse** avec la fenêtre de réorg par défaut (la reprise après crash ré-expose l'état d'un checkpoint antérieur, P-15), assurée par `reorgWindow: 0` + garde de watermark évaluée dans le même snapshot que les montants (D-23) | Disponible transitoirement faux | 002 |
| H-11 | Écarts assumés vs présentation TELA : 1 validateur (TELA : 6) et blocs de 2 s (TELA : 15 s) ; signature séparée + persistance au lieu de `eth_sendTransaction` ; `transferWithReference` ajouté aux ERC-20 | La compatibilité avec les contrats TELA réels reste à établir (#13) | 001, 002 |
| H-09 | L'émission (mint) est réservée à un rôle `MINTER` (trésorerie) | Contrats | 001 |
| H-12 | GitLab Talan : hébergement, version, runners (Docker/K8s), registry — inconnus | Portage forge et CI | 008 |
| H-13 | Réseau Besu Talan : finalité instantanée (QBFT) **à confirmer** ; base fee / min gas, permissioning, TLS/JWT RPC inconnus | Gas (H-04), `reorgWindow: 0` (D-23), client RPC | 008 |
| H-14 | Contrats TELA réels : adresses, bloc de déploiement, présence d'une référence d'opération inconnus | Idempotence on-chain (H-11), indexation | 008 |
| H-15 | Key store Web3Signer Talan (Vault / HSM / KMS) et mTLS client inconnus | Signature | 008 |
| H-16 | Cible de déploiement (Kubernetes+Helm ou VM+Compose) et gestion des secrets (Vault, External Secrets) inconnues | Artefacts de déploiement | 008 |
| H-17 | Kafka et PostgreSQL managés : SASL, TLS, droits DDL inconnus | Config, migrations | 008 |

## DÉCISIONS proposées

| ID | Décision | Justification | Date |
|---|---|---|---|
| D-01 | QBFT mono-validateur en dev, 4 validateurs en option | Clique supprimé dans Besu 26.4 ; QBFT recommandé | 2026-11-08 |
| D-02 | Chaque opération porte un `operationId` UUIDv7 généré par Java ; `bytes32` on-chain = keccak256(operationId) | Idempotence de bout en bout | 2026-11-08 |
| D-03 | Fonction `transferWithReference(to, amount, ref)` qui rejette une référence déjà utilisée | Garde sur chaîne contre le double débit | 2026-11-08 |
| D-04 | L'adaptateur utilise `eth_signTransaction` (Web3Signer) puis `eth_sendRawTransaction` (Besu), et persiste la tx signée avant diffusion | Rediffusion identique après crash | 2026-11-08 |
| D-05 | Clé de partition Kafka = adresse du compte émetteur | Ordonnancement des nonces par compte | 2026-11-08 |
| D-06 | Statuts : `RECEIVED → PUBLISHED → BROADCAST → CONFIRMED → SETTLED`, terminaux `FAILED`, `REJECTED` ; état d'attente `UNKNOWN` | Distinction échec certain / résultat inconnu | 2026-11-08 |
| D-07 | Réservation libérée à `SETTLED` (Ponder a indexé le bloc) ou à `FAILED`/`REJECTED` ; jamais à `UNKNOWN` | Disponible cohérent (F-06) | 2026-11-08 |
| D-08 | Outbox transactionnelle côté Java pour publier vers Kafka | Pas de perte entre DB et Kafka | 2026-11-08 |
| D-09 | Monorepo, un dossier par composant, sandbox Docker Compose | Reproductibilité (F-07) | 2026-11-08 |
| D-11 | EVM `cancun` (genèse `cancunTime: 0`) : OZ 5.6 utilise `mcopy` | Constat de compilation | 2026-11-08 |
| D-12 | Références d'opération **scopées par émetteur** (`mapping(sender => ref => used)`) | Revue sécurité M-4 : empêche le squatting d'une référence par un tiers | 2026-11-08 |
| D-13 | Kafka non publié sur l'hôte ; Web3Signer uniquement sur `signing` ; Besu sans QBFT/TXPOOL | Revue sécurité M-3, F-1 | 2026-11-08 |
| D-14 | Règlement `SETTLED` sur preuve indexée (event + to/amount identiques), quel que soit le statut non terminal | Robustesse si le résultat de l'adaptateur est perdu ou retardé | 2026-11-08 |
| D-15 | Injection de panne `pause-before-broadcast` (fenêtre signature→diffusion) pour tests FAILED/UNKNOWN déterministes | Reproductibilité US4 | 2026-11-08 |
| D-16 | L'adaptateur ne signe que pour une liste blanche de comptes clients (`ADAPTER_SIGNABLE_ACCOUNTS`) ; jamais deployer/treasury/operator | Revue #18 : un producteur Kafka ne doit pas obtenir de signatures admin | 2026-11-08 |
| D-17 | `FAILED` n'est publié que si la référence est prouvée non exécutée ; `nonce too low` sans reçu ni événement + nonce consommé ⇒ `FAILED NONCE_CONSUMED` | Revue #18 F1/F4 | 2026-11-08 |
| D-18 | Swap v1 : taux **immuable** 115/100 (demande et exécution au même taux) | Revue 2026-11-08 ; à confronter aux sources TELA | 2026-11-08 |
| D-19 | Swap v1 : sens **TCE → TCD** uniquement ; TCD → TCE ensuite | Livraison bornée | 2026-11-08 |
| D-20 | Swap v1 : parcours `approve + swap` ; `permit` seulement si confirmé côté TELA | Compatibilité avec le jeton réel | 2026-11-08 |
| D-21 | Disponible = indexé − réservations **non encore indexées**, calculé en un seul snapshot SQL ; `availableRaw` exposé | Revue 2026-11-08 : supprime le double comptage transitoire et rend l'invariant vérifiable | 2026-11-08 |
| D-22 | `main` protégée (PR + 9 checks) ; clé API factory = secret de l'environnement `factory` limité à `main` | Revue 2026-11-08 | 2026-11-08 |
| D-23 | Ponder `reorgWindow: 0` (QBFT = finalité immédiate) + garde Java : un head indexé sous le plus haut jamais vu ⇒ réservations refusées (503 `INDEXER_UNAVAILABLE`) et règlement suspendu | Revue 2026-11-08 / P-15 | 2026-11-08 |
| D-24 | UI : nginx n'accepte que les `Host` connus (sinon 421, anti DNS rebinding) ; réseau `ui` dédié frontend↔backend | Revue PR #28 | 2026-11-08 |
| D-25 | Base de connaissances de la factory **compilée depuis les sources** (agent `knowledge-curator`, skill `knowledge-maintenance`, contrôle `knowledge-lint`) en natif Claude Code sur le markdown du dépôt ; WeKnora non déployé | Audit WeKnora 2026-11-10 (hors dépôt) : patterns repris en idées réécrites, aucune copie de code ; déploiement écarté (surface par défaut, clés LLM externes) | 2026-11-10 |
| D-26 | Garde-fous v2 : profil de cible `FACTORY_TARGET` (`factory/targets/*.json`, défaut sandbox, inconnu = tout refusé) ; risque lecture / écriture / destructif → allow / ask / deny ; périmètres d'écriture par agent imposés par hook (`factory/perimeters.json`) | Audit 008 §A1 (22 contournements) + modèle de risque de l'audit WeKnora (idée réécrite) | 2026-11-10 |
| D-10 | Client Kafka JS : `@confluentinc/kafka-javascript` | `kafkajs` non maintenu | 2026-11-08 |

## PREUVES d'exécution

| ID | Preuve | Fichier | Commit |
|---|---|---|---|
| P-01 | Sandbox vierge : QBFT produit des blocs, 5 clés Web3Signer, rôles PG, 3 topics, admin API refusée, Web3Signer non publié (16/16 OK, incl. QBFT/TXPOOL désactivés, Web3Signer injoignable depuis `chain`, Kafka non publié) | `evidence/001/sandbox-check.txt` | 001 |
| P-02 | Contrats : 16 tests (unit, fuzz 512, invariants 64×32, anti-squatting M-4) verts ; couverture lignes 100 % | `evidence/001/forge-test.txt`, `evidence/001/coverage.txt` | 001 |
| P-03 | Slither 0.11.6 : 0 finding (Low→High) sur TelaToken et TalanFixedRateSwap | `evidence/001/slither/` | 001 |
| P-04 | On-chain : `transferWithReference` débite une fois, rejeu refusé (`ReferenceAlreadyUsed`) avant diffusion, 1 seul événement | `evidence/001/contracts/evidence.json` | 001 |
| P-05 | Déploiement signé exclusivement par Web3Signer (`forge script --unlocked`, aucune clé exportée) | `scripts/deploy-contracts.sh` | 001 |
| P-06 | Adaptateur (29 tests unitaires) : nominal, crash avant/après diffusion, journal perdu, conflit de référence, FAILED/REJECTED/UNKNOWN, RECONCILE | `adapter/test/` | 002 |
| P-07 | Adaptateur live : crash réel après diffusion (`ADAPTER_FAULT`) → redémarrage → 1 signature, 1 débit, 1 txHash ; rejeu d'une commande exécutée sans effet | `evidence/002/adapter/evidence.json` | 002 |
| P-08 | Backend (13 tests, Testcontainers PG 18.4 + Kafka 4.4) : 20 requêtes concurrentes → exactement 10 réservées ; résultats idempotents et hors ordre ; UNKNOWN conserve la réservation | `backend/src/test/` | 002 |
| P-09 | E2E nominal : RECEIVED>PUBLISHED>BROADCAST>CONFIRMED>SETTLED, 1 débit, indexé = balanceOf, pending 0, Idempotency-Key, 409, 400 | `evidence/002/nominal/evidence.json` | 002 |
| P-10 | E2E crash après diffusion (stack complète) : 1 signature, 1 débit, 1 événement, reprise du journal | `evidence/002/restart-after-broadcast/evidence.json` | 002 |
| P-11 | E2E Ponder arrêté + 20 demandes concurrentes : 10 acceptées, disponible jamais négatif, CONFIRMED tant que l'index est périmé, convergence SETTLED | `evidence/002/ponder-lag/evidence.json` | 002 |
| P-12 | E2E échec vs inconnu : revert miné → FAILED (receipt 0) ; pause → REJECTED sans diffusion ; Besu coupé → UNKNOWN (réservation conservée) → RECONCILE → SETTLED | `evidence/002/failure-vs-unknown/evidence.json` | 002 |
| P-13 | Après correctifs revue #18 : adapter 42 tests, backend 13 tests, 5 scénarios e2e PASS ; déterminisme nominal 10/10 | `evidence/002/determinism/` | 002 |
| P-14 | Trivy : 7 HIGH transitifs Ponder → 2 corrigés par overrides, 3 acceptés avec justification/expiration (`.trivyignore`), endpoint GraphQL supprimé | `.trivyignore`, `indexer/package.json` | 002 |
| P-15 | **Défaut trouvé par l'échantillonneur d'invariant** : après redémarrage de Ponder (reorgWindow 180 s par défaut ≈ 90 blocs), le modèle de lecture régresse (head 4038 → 3305, solde antérieur ré-exposé) puis se reconstruit ; disponible brut observé à −100 TCE pendant ~14 s | `evidence/002/ponder-lag/runs/`, `evidence/002/probe-readmodel/runs/` | 002-validation |
| P-16 | Après `reorgWindow: 0` + garde de régression : bloc finalisé = bloc indexé ; 10 exécutions et solde publiés ensemble ; ponder-lag : disponible brut min = 0 (28 snapshots) alors que la formule naïve aurait donné −127 TCE | `evidence/002/ponder-lag/runs/`, `evidence/002/probe-readmodel/runs/` | 002-validation |
| P-17 | Scénario D (UNKNOWN après acceptation par Besu) : tx exécutée on-chain à l'insu de l'app, réservation conservée, 1 signature, 1 effet, SETTLED après rétablissement | `evidence/002/failure-vs-unknown/runs/` | 002-validation |
| P-18 | Campagnes sur 9abd8f4 : **SC-004 PASS** (1000 req., 100/900, min brut 0 sur 97 snapshots), **SC-003 PASS** (p95 2,23 s, 60 ops à 1 req/3 s), **SC-002 PASS** (103 crashs réels sur 5 points, 100 ops, 0 double débit) | `evidence/002/campaign-sc00{2,3,4}/runs/` | 002-validation |
| P-19 | SC-001 1re tentative **interrompue** : FAIL sur `failure-vs-unknown` itération 1 dû au **harnais** (hauteur 5282 > limite eth_getLogs 5000 de Besu → comptage d'événements à 0) ; assertions de solde on-chain PASS ; bug `set -e` de la campagne qui l'a arrêtée. Corrigé (requêtes paginées depuis le bloc de déploiement) | `evidence/002/failure-vs-unknown/runs/sc001-1-*`, `evidence/002/campaign-sc001/runs/` | 002-validation |
| P-20 | 2e tentative SC-001 interrompue par une **régression du harnais** (`logs_count` traitait « 0 événement » comme une erreur) → arrêtée, corrigée (`7d4a02d`) ; ses runs FAIL sont conservés | `evidence/002/*/runs/sc001-*` (16:45–16:55) | 002-validation |
| P-21 | **Validation complète sur `7d4a02d`** (images reconstruites depuis ce SHA) : SC-004 PASS, SC-003 PASS, SC-002 PASS (119 crashs réels, 120 ops, 0 double débit), **SC-001 PASS 40/40** | `evidence/002/campaign-sc00{1,2,3,4}/runs/` (20261108T172015Z-24324, 20261108T170453Z-20051, 20261108T170050Z-18974, 20261108T165652Z-17196) | 002-validation |
| P-22 | UI 005 : 31 tests unitaires (vérifiés en conteneur propre), Playwright 2/2 sur la stack réelle, avant et après les correctifs de revue ; Host étranger → 421, Postgres injoignable depuis `ui` | `evidence/005-operator-ui/playwright/` | 005-operator-ui-v1 |
