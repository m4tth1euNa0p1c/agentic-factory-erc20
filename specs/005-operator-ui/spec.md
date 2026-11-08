# Feature Specification: Interface opérateur Angular

**Feature Branch**: `005-operator-ui`
**Created**: 2026-11-08
**Status**: Draft
**Input**: « Rendre les opérations et leurs états compréhensibles. » Registre : F-01, F-02, F-06, D-06. Dépend de : 002 (API v1).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Consulter les soldes (Priority: P1)
L'opérateur voit pour chaque compte et jeton : solde indexé, en attente, disponible, et la fraîcheur de l'indexation (dernier bloc indexé vs bloc courant).

**Acceptance Scenarios**:
1. **Given** Ponder en retard de > 5 blocs, **When** l'opérateur ouvre le compte, **Then** un bandeau « indexation en retard » est affiché.

### User Story 2 — Créer un transfert et suivre son statut (Priority: P1)
**Acceptance Scenarios**:
1. **Given** un formulaire valide, **When** l'opérateur soumet, **Then** l'opération apparaît avec `operationId` et son statut se met à jour (polling 1 s ou SSE) jusqu'à `SETTLED`.
2. **Given** une opération `UNKNOWN`, **Then** le libellé est « Résultat en cours de vérification » (pas « Échec »).
3. **Given** `409 INSUFFICIENT_AVAILABLE`, **Then** le message affiche le disponible actuel.

### User Story 3 — Historique et traçabilité (Priority: P2)
Liste des opérations avec filtre par statut ; détail avec txHash, bloc, horodatages de chaque transition.

### Edge Cases
- API indisponible → état dégradé explicite, pas de données périmées présentées comme actuelles.
- [NEEDS CLARIFICATION: authentification opérateur (SSO/OIDC ?) — hors périmètre v0.]

## Requirements *(mandatory)*
- **FR-001**: Client typé généré depuis `schemas/openapi/tela-api.v1.yaml`.
- **FR-002**: Aucun accès direct navigateur → Besu/Web3Signer/Kafka.
- **FR-003**: Montants saisis en décimal (6 décimales), transmis en unités minimales entières (chaîne).
- **FR-004**: La chronologie affiche les transitions **réellement observées** (`operation_transition`), sans supposer que tous les états intermédiaires ont lieu (D-14 : `PUBLISHED → SETTLED` est légitime).
- **FR-005**: Afficher `available` (réservable) ; `availableRaw`/`heldTotal` uniquement en vue diagnostic.

## Success Criteria *(mandatory)*
- **SC-001**: Test Playwright du parcours transfert nominal vert en CI.
- **SC-002**: Audit accessibilité sans violation critique (axe).
