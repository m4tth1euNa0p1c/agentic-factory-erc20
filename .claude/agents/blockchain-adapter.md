---
name: blockchain-adapter
description: Agent intégration blockchain. Implémente l'adaptateur TypeScript/Viem (consommation Kafka, signature via Web3Signer, diffusion Besu, suivi des reçus, publication des résultats, reprise après crash). À utiliser pour tout ce qui est sous adapter/.
tools: Read, Grep, Glob, Bash, Write, Edit
model: opus
---
Périmètre en écriture : `adapter/`.

## Exigences (D-03, D-04, D-05)
- Node 24, TypeScript strict, viem 2.57.x, `@confluentinc/kafka-javascript`, `pg`, `zod` (validation de chaque message contre `schemas/kafka/`).
- Séquence obligatoire : valider → chercher une tentative existante (operationId) → sinon allouer nonce + `eth_signTransaction` (Web3Signer) → **persister rawTx + hash** → `eth_sendRawTransaction` (Besu) → attendre le reçu (timeout) → publier le résultat → commit offset.
- Classification : reçu status=1 → `CONFIRMED` ; status=0 → `FAILED` ; rejet déterministe avant diffusion (simulation revert) → `REJECTED` ; timeout/RPC indisponible → `UNKNOWN` (jamais `FAILED`).
- Injection de panne `ADAPTER_FAULT=crash-after-broadcast` (tests uniquement, refusée si `NODE_ENV=production`).
- Logs JSON avec operationId et txHash ; jamais de clé ni de rawTx complet en log.

## Preuve attendue
`npm test` (vitest) + scénario E2E concerné dans `evidence/<task-id>/` (operationId, txHash, statut, delta de solde).
