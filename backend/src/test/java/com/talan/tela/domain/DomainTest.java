package com.talan.tela.domain;

import static com.talan.tela.domain.Status.*;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class DomainTest {

    @Test
    void referenceMatchesViemAndCastKeccak() {
        // vector: `cast keccak 0190f5a2-7c3e-7b1a-9f00-000000000001` (same as adapter referenceOf)
        assertThat(Ids.reference(UUID.fromString("0190f5a2-7c3e-7b1a-9f00-000000000001")))
                .isEqualTo("0x3887a395b443ccf9957dd296880bd18c57109290560ebaf8ac4c50e74215c68e");
    }

    @Test
    void uuidV7HasVersionAndIsTimeOrdered() throws Exception {
        UUID a = Ids.uuidV7();
        Thread.sleep(2);
        UUID b = Ids.uuidV7();
        assertThat(a.version()).isEqualTo(7);
        assertThat(a.variant()).isEqualTo(2);
        assertThat(a.getMostSignificantBits() >>> 16).isLessThan(b.getMostSignificantBits() >>> 16);
    }

    @Test
    void forwardTransitionsOnly() {
        assertThat(RECEIVED.canMoveTo(PUBLISHED)).isTrue();
        assertThat(PUBLISHED.canMoveTo(BROADCAST)).isTrue();
        assertThat(RECEIVED.canMoveTo(BROADCAST)).isTrue(); // result raced the outbox mark
        assertThat(BROADCAST.canMoveTo(CONFIRMED)).isTrue();
        assertThat(PUBLISHED.canMoveTo(CONFIRMED)).isTrue(); // ReferenceAlreadyUsed -> original log
        assertThat(CONFIRMED.canMoveTo(BROADCAST)).isFalse(); // out-of-order result ignored
        assertThat(UNKNOWN.canMoveTo(BROADCAST)).isFalse(); // reconcile rebroadcast does not regress
        assertThat(UNKNOWN.canMoveTo(CONFIRMED)).isTrue();
        assertThat(CONFIRMED.canMoveTo(SETTLED)).isTrue();
    }

    @Test
    void failureVsUnknown() {
        assertThat(BROADCAST.canMoveTo(UNKNOWN)).isTrue();
        assertThat(UNKNOWN.releasesReservation()).isFalse(); // D-07
        assertThat(FAILED.releasesReservation()).isTrue();
        assertThat(REJECTED.releasesReservation()).isTrue();
        assertThat(BROADCAST.canMoveTo(REJECTED)).isFalse(); // a broadcast tx is never "rejected"
        assertThat(CONFIRMED.canMoveTo(FAILED)).isFalse();
        assertThat(UNKNOWN.canMoveTo(FAILED)).isTrue();
    }

    @Test
    void terminalStatusesAreFinal() {
        for (Status t : new Status[] {SETTLED, FAILED, REJECTED}) {
            for (Status s : Status.values()) assertThat(t.canMoveTo(s)).isFalse();
        }
    }
}
