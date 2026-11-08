# Les quatre tests exigés

| # | Test | Scénario | Résultat observé | Preuve |
|---|---|---|---|---|
| 1 | Transfert nominal | `nominal` | `RECEIVED>PUBLISHED>BROADCAST>CONFIRMED>SETTLED`, 1 débit, indexé = balanceOf, pending → 0 au règlement | `evidence/002/nominal/` |
| 2 | Redémarrage après émission | `restart-after-broadcast` | crash réel de l'adaptateur après diffusion, redémarrage : 1 signature, 1 débit, 1 événement | `evidence/002/restart-after-broadcast/`, `evidence/002/adapter/` |
| 3 | Retard de Ponder + concurrence | `ponder-lag` | 20 demandes / 10 possibles → 10 acceptées, disponible jamais négatif, `CONFIRMED` tant que l'index est périmé, convergence `SETTLED` | `evidence/002/ponder-lag/` |
| 4 | Échec certain vs résultat inconnu | `failure-vs-unknown` | revert miné → `FAILED` (libère) ; revert simulé → `REJECTED` (libère, rien diffusé) ; Besu coupé → `UNKNOWN` (conserve) → RECONCILE → `SETTLED` | `evidence/002/failure-vs-unknown/` |

Complément sur chaîne (spec 001) : `transferWithReference` rejoué → `ReferenceAlreadyUsed`, aucun second débit (`evidence/001/contracts/`).

Registre : P-01 … P-12 dans `docs/registry/REGISTRE.md`.
