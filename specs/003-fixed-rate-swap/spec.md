# Feature Specification: Échange TCE → TCD à taux fixe (TalanFixedRateSwap)

**Feature Branch**: `003-fixed-rate-swap`
**Created**: 2026-11-08
**Status**: Draft — clarifications requises
**Input**: « Échange TCE/TCD via le contrat TalanFixedRateSwap au taux 1 TCE = 1,15 TCD. » Registre : F-03, F-04, H-02, H-05, H-06. Dépend de : 001, 002.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Échange nominal TCE → TCD (Priority: P1)
Alice échange 100 TCE et reçoit 115 TCD ; le parcours réutilise la chaîne 002 (opération, réservation, Kafka, adaptateur, Ponder).

**Independent Test**: `tests/e2e/run.sh swap-nominal` → Alice −100 TCE, +115 TCD ; pool +100 TCE, −115 TCD ; statut `SETTLED`.

**Acceptance Scenarios**:
1. **Given** pool alimenté de 10 000 TCD, **When** Alice échange 100 TCE (référence `ref`), **Then** Alice reçoit 115 TCD et l'événement `Swapped(ref, alice, 100, 115)` est émis.
2. **Given** `ref` déjà utilisée, **When** on rejoue, **Then** revert `ReferenceAlreadyUsed`, aucun mouvement.
3. **Given** liquidité TCD insuffisante, **When** Alice échange, **Then** revert `InsufficientLiquidity`, réservation TCE libérée (`REJECTED`).
4. **Given** 1 unité minimale de TCE (0,000001), **When** on échange, **Then** sortie = floor(1 × 115 / 100) = 1 unité ; pour 0 en sortie → revert `ZeroOutput` (H-06).

### User Story 2 — Gestion de la liquidité (Priority: P2)
La trésorerie dépose et retire de la liquidité TCD ; seul `LIQUIDITY_ROLE` le peut.

### User Story 3 — Échange inverse TCD → TCE (Priority: P3)
[NEEDS CLARIFICATION: le contrat TELA permet-il l'échange inverse, et à quel taux (1/1,15 arrondi) ?]

### Edge Cases
- Modification du taux pendant qu'une opération est en vol → [NEEDS CLARIFICATION: taux figé à la demande ou à l'exécution ?]
- Approbation : le swap exige un `approve` préalable (2 transactions) ou `permit` (EIP-2612) → décision proposée : `swapWithPermit` pour une seule transaction.

## Requirements *(mandatory)*
- **FR-001**: Taux exprimé en rationnel `rateNumerator/rateDenominator` = 115/100, arrondi à l'inférieur (H-06).
- **FR-002**: `swap(amountIn, reference)` rejette une référence déjà utilisée, une sortie nulle, une liquidité insuffisante ; CEI + `SafeERC20` + `nonReentrant`.
- **FR-003**: La réservation côté Java porte sur TCE sortant ; le TCD entrant n'est disponible qu'après `SETTLED`.
- **FR-004**: Ponder indexe `Swapped` et l'expose dans `tela_read.operation_execution`.

## Success Criteria *(mandatory)*
- **SC-001**: Invariant fuzz : `tceIn × 115 / 100 − tcdOut < 1` unité, et somme des soldes conservée.
- **SC-002**: Scénarios 002 (restart, ponder-lag, unknown) rejouables à l'identique sur le swap.

## Assumptions
- H-05 (liquidité pré-déposée par la trésorerie), H-06 (arrondi inférieur). À confirmer avec le code TELA.
