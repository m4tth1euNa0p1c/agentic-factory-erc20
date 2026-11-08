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
| H-09 | L'émission (mint) est réservée à un rôle `MINTER` (trésorerie) | Contrats | 001 |

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
| D-10 | Client Kafka JS : `@confluentinc/kafka-javascript` | `kafkajs` non maintenu | 2026-11-08 |

## PREUVES d'exécution

| ID | Preuve | Fichier | Commit |
|---|---|---|---|
| _vide_ | Les preuves sont ajoutées par l'agent vérificateur | `evidence/` | |
