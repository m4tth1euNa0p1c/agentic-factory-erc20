package com.talan.tela.operation;

import com.talan.tela.domain.Status;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class OperationRepository {
    private final JdbcClient jdbc;

    public OperationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    static Operation map(ResultSet rs, int i) throws SQLException {
        long block = rs.getLong("block_number");
        return new Operation(
                rs.getObject("operation_id", UUID.class),
                rs.getString("idempotency_key"),
                rs.getString("type"),
                rs.getString("from_address"),
                rs.getString("to_address"),
                rs.getString("token"),
                rs.getBigDecimal("amount").toBigIntegerExact(),
                rs.getString("reference"),
                Status.valueOf(rs.getString("status")),
                rs.getString("tx_hash"),
                rs.wasNull() ? null : block,
                rs.getString("failure_reason"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    public Optional<Operation> find(UUID id) {
        return jdbc.sql("SELECT * FROM operation WHERE operation_id = ?").param(id).query(OperationRepository::map).optional();
    }

    public Optional<Operation> findForUpdate(UUID id) {
        return jdbc.sql("SELECT * FROM operation WHERE operation_id = ? FOR UPDATE").param(id).query(OperationRepository::map).optional();
    }

    public Optional<Operation> findByIdempotencyKey(String key) {
        return jdbc.sql("SELECT * FROM operation WHERE idempotency_key = ?").param(key).query(OperationRepository::map).optional();
    }

    public List<Operation> list(String account, Status status, int limit) {
        return jdbc.sql("""
                SELECT * FROM operation
                WHERE (CAST(? AS text) IS NULL OR from_address = ? OR to_address = ?)
                  AND (CAST(? AS text) IS NULL OR status = ?)
                ORDER BY created_at DESC LIMIT ?""")
                .param(account).param(account).param(account)
                .param(status == null ? null : status.name()).param(status == null ? null : status.name())
                .param(limit)
                .query(OperationRepository::map).list();
    }

    /** Serializes availability checks per (account, token) for the current transaction (FR-002). */
    public void lockAccount(String account, String token) {
        jdbc.sql("INSERT INTO account_lock(account, token) VALUES (?, ?) ON CONFLICT DO NOTHING").param(account).param(token).update();
        jdbc.sql("SELECT 1 FROM account_lock WHERE account = ? AND token = ? FOR UPDATE").param(account).param(token).query(Integer.class).single();
    }

    public BigInteger heldAmount(String account, String token) {
        return jdbc.sql("SELECT coalesce(sum(amount), 0) FROM reservation WHERE account = ? AND token = ? AND state = 'HELD'")
                .param(account).param(token).query(BigDecimal.class).single().toBigIntegerExact();
    }

    public void insert(Operation o) {
        jdbc.sql("""
                INSERT INTO operation(operation_id, idempotency_key, type, from_address, to_address, token, amount, reference, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""")
                .param(o.operationId()).param(o.idempotencyKey()).param(o.type()).param(o.from()).param(o.to())
                .param(o.token()).param(new BigDecimal(o.amount())).param(o.reference()).param(o.status().name())
                .update();
        jdbc.sql("INSERT INTO reservation(operation_id, account, token, amount, state) VALUES (?, ?, ?, ?, 'HELD')")
                .param(o.operationId()).param(o.from()).param(o.token()).param(new BigDecimal(o.amount())).update();
        audit(o.operationId(), null, o.status(), "api");
    }

    public void updateStatus(UUID id, Status from, Status to, String txHash, Long block, String reason, String source) {
        jdbc.sql("""
                UPDATE operation SET status = ?, tx_hash = coalesce(?, tx_hash), block_number = coalesce(?, block_number),
                       failure_reason = coalesce(?, failure_reason), updated_at = now()
                WHERE operation_id = ?""")
                .param(to.name()).param(txHash).param(block).param(reason).param(id).update();
        if (to.releasesReservation()) {
            jdbc.sql("UPDATE reservation SET state = 'RELEASED', released_at = now() WHERE operation_id = ? AND state = 'HELD'").param(id).update();
        }
        audit(id, from, to, source);
    }

    /** RECEIVED -> PUBLISHED only (never regresses a status already advanced by a result). */
    public void markPublished(UUID id) {
        int n = jdbc.sql("UPDATE operation SET status = 'PUBLISHED', updated_at = now() WHERE operation_id = ? AND status = 'RECEIVED'").param(id).update();
        if (n == 1) audit(id, Status.RECEIVED, Status.PUBLISHED, "outbox");
    }

    /** @return true if this (operation, status) result had not been processed yet. */
    public boolean markResultProcessed(UUID id, String status) {
        return jdbc.sql("INSERT INTO processed_result(operation_id, status) VALUES (?, ?) ON CONFLICT DO NOTHING").param(id).param(status).update() == 1;
    }

    public List<Operation> staleForReconcile(long afterSeconds) {
        return jdbc.sql("""
                SELECT * FROM operation
                WHERE status IN ('BROADCAST','UNKNOWN')
                  AND updated_at < now() - make_interval(secs => ?)
                  AND reconcile_attempts < 30
                  AND (last_reconcile_at IS NULL
                       OR last_reconcile_at < now() - make_interval(secs => ? * power(2, least(reconcile_attempts, 6))))
                ORDER BY updated_at LIMIT 20""")
                .param((double) afterSeconds).param((double) afterSeconds)
                .query(OperationRepository::map).list();
    }

    public void touchReconcile(UUID id) {
        // exponential backoff + cap (review #18 F2): no RECONCILE storm on the single adapter consumer
        jdbc.sql("UPDATE operation SET last_reconcile_at = now(), reconcile_attempts = reconcile_attempts + 1 WHERE operation_id = ?").param(id).update();
    }

    private void audit(UUID id, Status from, Status to, String source) {
        jdbc.sql("INSERT INTO operation_transition(operation_id, from_status, to_status, source) VALUES (?, ?, ?, ?)")
                .param(id).param(from == null ? null : from.name()).param(to.name()).param(source).update();
    }
}
