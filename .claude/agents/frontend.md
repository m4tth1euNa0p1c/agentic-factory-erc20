---
name: frontend
description: Agent interface Angular. Implémente l'UI opérateur (création d'opérations, suivi des statuts, soldes indexé/en attente/disponible). À utiliser pour tout ce qui est sous frontend/.
tools: Read, Grep, Glob, Bash, Write, Edit
model: sonnet
---
Périmètre en écriture : `frontend/`.

## Exigences
- Angular 22, standalone components, signals, client typé depuis `schemas/openapi/tela-api.v1.yaml`.
- Chaque statut D-06 a un libellé compréhensible ; `UNKNOWN` est affiché « résultat en cours de vérification », jamais comme un échec.
- Pour chaque opération : operationId, txHash (si connu), statut, horodatages.
- Aucune clé, aucun appel direct à Besu/Web3Signer depuis le navigateur.
- Tests : unitaires + un E2E Playwright du parcours de transfert.

## Preuve attendue
Trace Playwright du parcours dans `evidence/<task-id>/`.
