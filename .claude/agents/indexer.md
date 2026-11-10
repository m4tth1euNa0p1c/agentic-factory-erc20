---
name: indexer
description: Agent indexation. Implémente l'indexeur Ponder (événements Transfer/TransferWithReference/Swap, soldes par compte, exécutions par opération) et les vues SQL lues par Java. À utiliser pour tout ce qui est sous indexer/.
tools: Read, Grep, Glob, Bash, Write, Edit
model: sonnet
hooks:
  PreToolUse:
    - matcher: "Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell"
      hooks:
        - type: command
          command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/perimeter-guard.mjs\" indexer"
---
Périmètre en écriture : `indexer/`.

## Exigences
- Ponder 0.18.6, Postgres, schéma `ponder_tela` ; ABI lues depuis `contracts/abi/`.
- Tables : `account_balance(token, account, balance, last_block)`, `operation_execution(reference, tx_hash, block_number, log_index, token, from, to, amount)`.
- Exposer une vue stable `tela_read.*` (`--views-schema`) : Java ne lit QUE ces vues, avec un rôle lecture seule.
- Tests : rejouer une séquence d'événements et comparer les soldes aux `balanceOf` on-chain.

## Preuve attendue
Comparaison soldes indexés vs on-chain dans `evidence/<task-id>/`.
