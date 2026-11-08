package com.talan.tela.settlement;

import com.talan.tela.domain.Status;
import com.talan.tela.operation.Operation;
import com.talan.tela.operation.OperationRepository;
import com.talan.tela.operation.OperationService;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * FR-007/D-07: an operation becomes SETTLED (and its reservation is released) only once Ponder has indexed
 * the on-chain execution, so `available = indexed - held` never double counts. The indexed execution is
 * on-chain evidence, so it also settles operations whose adapter result was lost (BROADCAST/UNKNOWN).
 * FR-009: stale BROADCAST/UNKNOWN operations trigger a RECONCILE command.
 */
@Component
public class SettlementJob {
    private static final Logger log = LoggerFactory.getLogger(SettlementJob.class);

    private final JdbcClient jdbc;
    private final OperationRepository repo;
    private final OperationService service;

    public SettlementJob(JdbcClient jdbc, OperationRepository repo, OperationService service) {
        this.jdbc = jdbc;
        this.repo = repo;
        this.service = service;
    }

    record Indexed(UUID id, Status status, String txHash, long block) {}

    @Scheduled(fixedDelayString = "${tela.settlement-interval:1s}")
    @Transactional
    public void settle() {
        java.util.List<Indexed> rows;
        try {
            rows = jdbc.sql("""
                    SELECT o.operation_id, o.status, e.tx_hash, e.block_number
                    FROM operation o
                    JOIN tela_read.operation_execution e
                      ON e.id = o.token || ':' || o.from_address || ':' || o.reference
                     AND e.to = o.to_address AND e.amount = o.amount
                    WHERE o.status IN ('RECEIVED','PUBLISHED','BROADCAST','UNKNOWN','CONFIRMED')
                    ORDER BY o.created_at LIMIT 500
                    FOR UPDATE OF o SKIP LOCKED""")
                    .query((rs, i) -> new Indexed(rs.getObject(1, UUID.class), Status.valueOf(rs.getString(2)), rs.getString(3), rs.getLong(4)))
                    .list();
        } catch (DataAccessException e) {
            log.debug("read model not available yet: {}", e.getMessage());
            return;
        }
        for (Indexed r : rows) {
            repo.updateStatus(r.id(), r.status(), Status.SETTLED, r.txHash(), r.block(), null, "indexer");
            log.info("operation {} {} -> SETTLED (indexed at block {})", r.id(), r.status(), r.block());
        }
    }

    @Scheduled(fixedDelayString = "${tela.reconcile-interval:5s}")
    public void reconcile() {
        for (Operation op : repo.staleForReconcile(service.props().reconcileAfter().toSeconds())) {
            service.requestReconcile(op);
        }
    }
}
