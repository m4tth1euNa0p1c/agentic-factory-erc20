package com.talan.tela.domain;

/**
 * Operation lifecycle (D-06, data-model.md). Results may arrive out of order or duplicated:
 * a transition is applied only if it moves forward and the pair is allowed.
 */
public enum Status {
    RECEIVED(0), PUBLISHED(1), BROADCAST(2), UNKNOWN(3), CONFIRMED(4), SETTLED(5), FAILED(9), REJECTED(9);

    private final int rank;

    Status(int rank) {
        this.rank = rank;
    }

    public boolean isTerminal() {
        return this == SETTLED || this == FAILED || this == REJECTED;
    }

    /** Reservation is released only on these statuses (D-07); never on UNKNOWN. */
    public boolean releasesReservation() {
        return isTerminal();
    }

    public boolean canMoveTo(Status target) {
        if (isTerminal() || target == this) return false;
        return switch (target) {
            // deterministic pre-broadcast rejection only
            case REJECTED -> this == RECEIVED || this == PUBLISHED;
            // confirmed on-chain failure (receipt status 0); BROADCAST may have been lost
            case FAILED -> this == PUBLISHED || this == BROADCAST || this == UNKNOWN || this == RECEIVED;
            default -> target.rank > this.rank;
        };
    }
}
