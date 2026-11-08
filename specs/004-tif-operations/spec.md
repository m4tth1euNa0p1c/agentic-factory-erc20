# Feature Specification: Opérations sur TIF

**Feature Branch**: `004-tif-operations`
**Created**: 2026-11-08
**Status**: Draft — bloquée par clarifications (sources TELA requises)
**Input**: « Opérations sur TIF. » Registre : F-03, H-07. Dépend de : 001, 002.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Souscription de parts TIF (Priority: P1)
[NEEDS CLARIFICATION: nature de TIF — part de fonds, titre de créance, jeton d'intérêt ? La diapositive ne cite que le nom.]
Hypothèse H-07 : un investisseur paie en TCE et reçoit des parts TIF émises par un rôle opérateur à une valeur liquidative publiée.

**Acceptance Scenarios** (provisoires, sous H-07):
1. **Given** VL = 1,00 TCE/part, **When** Alice souscrit 100 TCE, **Then** 100 TCE vont à la trésorerie et 100 TIF sont émis à Alice, atomiquement, avec une référence unique.

### User Story 2 — Rachat de parts TIF (Priority: P2)
[NEEDS CLARIFICATION: rachat à la demande ou par fenêtres ? délai de règlement ?]

### Edge Cases
- [NEEDS CLARIFICATION: restrictions de transfert (liste blanche KYC) sur TIF ?]

## Requirements *(mandatory)*
- **FR-001**: Toute opération TIF réutilise le cycle d'opération 002 (operationId, réservation, statuts).
- **FR-002**: [NEEDS CLARIFICATION: règles d'émission/rachat et rôles.]

## Success Criteria *(mandatory)*
- **SC-001**: Mêmes garanties d'unicité et de cohérence que 002.

## Assumptions
- H-07. Cette spec ne passe à `Ready` qu'après réception des sources TELA (cf. `docs/HUMAN-ACTIONS.md`).
