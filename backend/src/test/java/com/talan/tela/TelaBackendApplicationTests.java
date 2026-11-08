package com.talan.tela;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.talan.tela.domain.Status;
import com.talan.tela.messaging.OutboxRelay;
import com.talan.tela.operation.OperationRepository;
import com.talan.tela.operation.OperationService;
import com.talan.tela.operation.OperationService.Result;
import com.talan.tela.operation.OperationService.TransferRequest;
import com.talan.tela.settlement.SettlementJob;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/** Spec 002 acceptance at the Java boundary (US1, US3, US4) against real PostgreSQL 18 + Kafka 4.4. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles("test")
class TelaBackendApplicationTests {
    static final String ALICE = "0x00000000000000000000000000000000000a11ce";
    static final String BOB = "0x0000000000000000000000000000000000000b0b";
    static final BigInteger TEN = BigInteger.valueOf(10_000_000);

    @Autowired OperationService service;
    @Autowired OperationRepository repo;
    @Autowired OutboxRelay relay;
    @Autowired SettlementJob settlement;
    @Autowired JdbcClient jdbc;
    @Autowired com.talan.tela.operation.IndexedBalances indexed;

    @BeforeEach
    void reset() {
        jdbc.sql("TRUNCATE backend.processed_result, backend.outbox, backend.operation_transition, backend.reservation, backend.operation, backend.account_lock").update();
        jdbc.sql("TRUNCATE tela_read.account_balance, tela_read.operation_execution").update();
        indexBalance(ALICE, BigInteger.valueOf(100_000_000)); // 100 TCE indexed
        jdbc.sql("TRUNCATE tela_read.chain_head, backend.indexer_watermark").update();
        jdbc.sql("INSERT INTO tela_read.chain_head VALUES ('head', 100, 0)").update();
    }

    /** D-23: a regressed read model (indexer rolled back) must not be used to grant new reservations. */
    @Test
    void readModelRegressionBlocksNewReservationsAndSettlement() {
        settlement.settle(); // watermark := 100
        jdbc.sql("UPDATE tela_read.chain_head SET block_number = 40").update(); // rollback / crash recovery
        assertThatThrownBy(() -> service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-regress-01"))
                .isInstanceOf(com.talan.tela.operation.IndexedBalances.IndexerUnavailableException.class);
        jdbc.sql("UPDATE tela_read.chain_head SET block_number = 101").update(); // caught up again
        assertThat(service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-regress-02").operation().status())
                .isEqualTo(Status.RECEIVED);
    }

    void indexBalance(String account, BigInteger v) {
        jdbc.sql("INSERT INTO tela_read.account_balance VALUES (?, 'TCE', ?, ?, 1) ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance")
                .param("TCE:" + account).param(account).param(new BigDecimal(v)).update();
    }

    BigInteger held() {
        return repo.heldAmount(ALICE, "TCE");
    }

    @Test
    void us1_receivedThenPublishedWithOutboxKeyedByFrom() throws Exception {
        var c = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-us1-0001");
        assertThat(c.operation().status()).isEqualTo(Status.RECEIVED);
        assertThat(held()).isEqualTo(TEN); // available = 90 immediately
        assertThat(jdbc.sql("SELECT msg_key FROM backend.outbox").query(String.class).single()).isEqualTo(ALICE);

        relay.relay();
        assertThat(repo.find(c.operation().operationId()).orElseThrow().status()).isEqualTo(Status.PUBLISHED);
        assertThat(jdbc.sql("SELECT count(*) FROM backend.outbox WHERE published_at IS NULL").query(Integer.class).single()).isZero();
    }

    @Test
    void us1_idempotencyKeyReplayAndConflict() {
        var a = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-idem-0001");
        var b = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-idem-0001");
        assertThat(b.replay()).isTrue();
        assertThat(b.operation().operationId()).isEqualTo(a.operation().operationId());
        assertThat(held()).isEqualTo(TEN);
        assertThatThrownBy(() -> service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN.add(BigInteger.ONE)), "key-idem-0001"))
                .isInstanceOf(OperationService.IdempotencyConflictException.class);
    }

    @Test
    void us1_insufficientAvailableIsRejectedAndNothingPublished() {
        indexBalance(ALICE, BigInteger.valueOf(5_000_000));
        assertThatThrownBy(() -> service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-insuf-001"))
                .isInstanceOf(OperationService.InsufficientAvailableException.class)
                .extracting("available").isEqualTo(BigInteger.valueOf(5_000_000));
        assertThat(jdbc.sql("SELECT count(*) FROM backend.outbox").query(Integer.class).single()).isZero();
    }

    @Test
    void us3_concurrentRequestsNeverOverReserve() throws Exception {
        int n = 20;
        var ok = new AtomicInteger();
        var refused = new AtomicInteger();
        List<Callable<Void>> tasks = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            String key = "key-conc-" + i + "-" + UUID.randomUUID();
            tasks.add(() -> {
                try {
                    service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), key);
                    ok.incrementAndGet();
                } catch (OperationService.InsufficientAvailableException e) {
                    refused.incrementAndGet();
                }
                return null;
            });
        }
        try (var pool = Executors.newFixedThreadPool(n)) {
            for (var f : pool.invokeAll(tasks)) f.get();
        }
        assertThat(ok.get()).isEqualTo(10);
        assertThat(refused.get()).isEqualTo(10);
        assertThat(held()).isEqualTo(BigInteger.valueOf(100_000_000)); // available = 0, never negative
    }

    @Test
    void results_areIdempotentAndOrderTolerant() {
        var id = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-order-001").operation().operationId();
        String tx = "0x" + "ab".repeat(32);
        service.applyResult(new Result(id, Status.CONFIRMED, tx, 42L, null));
        service.applyResult(new Result(id, Status.BROADCAST, tx, null, null)); // late, ignored
        service.applyResult(new Result(id, Status.CONFIRMED, tx, 42L, null)); // duplicate, ignored
        var op = repo.find(id).orElseThrow();
        assertThat(op.status()).isEqualTo(Status.CONFIRMED);
        assertThat(op.blockNumber()).isEqualTo(42L);
        assertThat(held()).isEqualTo(TEN); // CONFIRMED does not release: wait for the indexer (D-07)
    }

    @Test
    void us1_settlementOnlyWhenIndexed_thenReservationReleased() {
        var op = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-settle-01").operation();
        service.applyResult(new Result(op.operationId(), Status.CONFIRMED, "0x" + "cd".repeat(32), 7L, null));
        settlement.settle();
        assertThat(repo.find(op.operationId()).orElseThrow().status()).isEqualTo(Status.CONFIRMED);

        // Ponder indexes the event and the new balance in the same block batch
        jdbc.sql("INSERT INTO tela_read.operation_execution VALUES (?, ?, 'TCE', ?, ?, ?, ?, 7, 0)")
                .param("TCE:" + ALICE + ":" + op.reference()).param(op.reference()).param(ALICE).param(BOB)
                .param(new BigDecimal(TEN)).param("0x" + "cd".repeat(32)).update();
        indexBalance(ALICE, BigInteger.valueOf(90_000_000));
        settlement.settle();
        assertThat(repo.find(op.operationId()).orElseThrow().status()).isEqualTo(Status.SETTLED);
        assertThat(held()).isZero(); // available = 90 = indexed, no double counting
    }

    @Test
    void us4_unknownKeepsReservation_failedAndRejectedRelease() {
        var a = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-unk-0001").operation().operationId();
        var b = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-fail-0001").operation().operationId();
        var c = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-rej-0001").operation().operationId();
        service.applyResult(new Result(a, Status.UNKNOWN, "0x" + "01".repeat(32), null, "RPC_UNAVAILABLE"));
        service.applyResult(new Result(b, Status.FAILED, "0x" + "02".repeat(32), 9L, "REVERTED"));
        service.applyResult(new Result(c, Status.REJECTED, null, null, "SIMULATION_REVERT:EnforcedPause"));
        assertThat(held()).isEqualTo(TEN); // only the UNKNOWN one is still held

        settlement.reconcile(); // reconcile-after=0s in tests
        assertThat(jdbc.sql("SELECT count(*) FROM backend.outbox WHERE payload LIKE '%\"RECONCILE\"%'").query(Integer.class).single()).isEqualTo(1);
        service.applyResult(new Result(a, Status.CONFIRMED, "0x" + "01".repeat(32), 11L, null));
        assertThat(repo.find(a).orElseThrow().status()).isEqualTo(Status.CONFIRMED);
    }

    @Test
    void noTransientDoubleCountBetweenIndexingAndSettlement() {
        var op = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-transient1").operation();
        // Ponder indexed the execution and the new balance, the settlement job has NOT run yet
        jdbc.sql("INSERT INTO tela_read.operation_execution VALUES (?, ?, 'TCE', ?, ?, ?, ?, 7, 0)")
                .param("TCE:" + ALICE + ":" + op.reference()).param(op.reference()).param(ALICE).param(BOB)
                .param(new BigDecimal(TEN)).param("0x" + "cd".repeat(32)).update();
        indexBalance(ALICE, BigInteger.valueOf(90_000_000));
        var a = indexed.availability(ALICE, "TCE");
        assertThat(a.heldTotal()).isEqualTo(TEN);          // reservation still HELD
        assertThat(a.pending()).isZero();                   // ...but already reflected in the indexed balance
        assertThat(a.raw()).isEqualTo(BigInteger.valueOf(90_000_000)); // naive indexed - held would say 80
    }

    /** SC-004: 1000 concurrent requests, never over-reserved, raw availability never negative. */
    @Test
    void sc004_thousandConcurrentRequests() throws Exception {
        BigInteger one = BigInteger.valueOf(1_000_000); // 100 TCE indexed -> exactly 100 slots of 1 TCE
        var ok = new AtomicInteger();
        var refused = new AtomicInteger();
        var minRaw = new java.util.concurrent.atomic.AtomicReference<>(BigInteger.valueOf(Long.MAX_VALUE));
        List<Callable<Void>> tasks = new ArrayList<>();
        for (int i = 0; i < 1000; i++) {
            String key = "key-sc004-" + i + "-" + UUID.randomUUID();
            tasks.add(() -> {
                try {
                    service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", one), key);
                    ok.incrementAndGet();
                } catch (OperationService.InsufficientAvailableException e) {
                    refused.incrementAndGet();
                }
                BigInteger raw = indexed.availability(ALICE, "TCE").raw();
                minRaw.accumulateAndGet(raw, BigInteger::min);
                return null;
            });
        }
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (var f : pool.invokeAll(tasks)) f.get();
        }
        assertThat(ok.get()).isEqualTo(100);
        assertThat(refused.get()).isEqualTo(900);
        assertThat(minRaw.get().signum()).isGreaterThanOrEqualTo(0);
        assertThat(held()).isEqualTo(BigInteger.valueOf(100_000_000));
    }

    @Test
    void settlementRequiresMatchingParameters() {
        var op = service.createTransfer(new TransferRequest(ALICE, BOB, "TCE", TEN), "key-mismatch1").operation();
        jdbc.sql("INSERT INTO tela_read.operation_execution VALUES (?, ?, 'TCE', ?, ?, ?, ?, 7, 0)")
                .param("TCE:" + ALICE + ":" + op.reference()).param(op.reference()).param(ALICE).param(BOB)
                .param(new BigDecimal(TEN.subtract(BigInteger.ONE))).param("0x" + "ee".repeat(32)).update();
        settlement.settle();
        assertThat(repo.find(op.operationId()).orElseThrow().status()).isEqualTo(Status.RECEIVED);
    }
}
