package com.talan.tela.operation;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.Optional;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Read side published by Ponder through the `tela_read` views (H-08). Read-only for this service.
 */
@Component
public class IndexedBalances {
    private final JdbcClient jdbc;

    public IndexedBalances(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record Indexed(BigInteger balance, Long lastBlock) {}

    /** @throws IndexerUnavailableException when the views are not (yet) published by Ponder. */
    public Indexed balance(String account, String token) {
        try {
            return jdbc.sql("SELECT balance, last_block FROM tela_read.account_balance WHERE id = ?")
                    .param(token + ":" + account)
                    .query((rs, i) -> new Indexed(rs.getBigDecimal("balance").toBigIntegerExact(), rs.getLong("last_block")))
                    .optional()
                    .orElse(new Indexed(BigInteger.ZERO, null));
        } catch (DataAccessException e) {
            throw new IndexerUnavailableException(e);
        }
    }

    /**
     * Availability from ONE SQL statement (one consistent snapshot, review 2026-11-08):
     *   pending  = HELD reservations whose execution is NOT yet indexed (an indexed execution is already in `indexed`)
     *   raw      = indexed - pending   (invariant: never negative)
     * This removes the transient double count between Ponder indexing a debit and the settlement job releasing it.
     * Assumes Ponder writes a block's balance and execution rows in the same transaction (H-10).
     */
    public record Availability(BigInteger indexed, BigInteger pending, BigInteger heldTotal, Long lastBlock) {
        public BigInteger raw() {
            return indexed.subtract(pending);
        }
    }

    public Availability availability(String account, String token) {
        assertNotRegressed();
        try {
            return jdbc.sql("""
                    SELECT coalesce((SELECT balance FROM tela_read.account_balance WHERE id = :id), 0) AS indexed,
                           (SELECT last_block FROM tela_read.account_balance WHERE id = :id) AS last_block,
                           coalesce((SELECT sum(r.amount) FROM backend.reservation r JOIN backend.operation o USING (operation_id)
                                     WHERE r.account = :account AND r.token = :token AND r.state = 'HELD'
                                       AND NOT EXISTS (SELECT 1 FROM tela_read.operation_execution e
                                                       WHERE e.id = o.token || ':' || o.from_address || ':' || o.reference)), 0) AS pending,
                           coalesce((SELECT sum(amount) FROM backend.reservation
                                     WHERE account = :account AND token = :token AND state = 'HELD'), 0) AS held_total
                    """)
                    .param("id", token + ":" + account).param("account", account).param("token", token)
                    .query((rs, i) -> {
                        long lb = rs.getLong("last_block");
                        return new Availability(rs.getBigDecimal("indexed").toBigIntegerExact(), rs.getBigDecimal("pending").toBigIntegerExact(),
                                rs.getBigDecimal("held_total").toBigIntegerExact(), rs.wasNull() ? null : lb);
                    })
                    .single();
        } catch (DataAccessException e) {
            throw new IndexerUnavailableException(e);
        }
    }

    /**
     * Defense in depth (D-23): if the indexed head is BELOW the highest head this service has ever seen, the read
     * model was rolled back (indexer crash recovery, reset...). Availability computed on it could be over-estimated,
     * so new reservations are refused until the indexer catches up.
     */
    public void assertNotRegressed() {
        Long head = head().orElse(null);
        Long mark = jdbc.sql("SELECT block FROM backend.indexer_watermark WHERE id = 'head'").query(Long.class).optional().orElse(null);
        if (head == null || (mark != null && head < mark)) {
            throw new IndexerUnavailableException(new IllegalStateException("indexed head " + head + " below watermark " + mark));
        }
    }

    /** Raise the high-water mark (never lowers it). */
    public void advanceWatermark() {
        head().ifPresent(h -> jdbc.sql("""
                INSERT INTO backend.indexer_watermark(id, block) VALUES ('head', ?)
                ON CONFLICT (id) DO UPDATE SET block = greatest(backend.indexer_watermark.block, EXCLUDED.block)""").param(h).update());
    }

    public record IndexerStatus(Long indexedBlock, Long indexedBlockTimestamp, Long watermark, boolean regressed) {}

    public IndexerStatus status() {
        var row = jdbc.sql("SELECT (SELECT block_number::bigint FROM tela_read.chain_head WHERE id = 'head'), "
                        + "(SELECT timestamp::bigint FROM tela_read.chain_head WHERE id = 'head'), "
                        + "(SELECT block FROM backend.indexer_watermark WHERE id = 'head')")
                .query((rs, i) -> new Long[] {(Long) rs.getObject(1, Long.class), (Long) rs.getObject(2, Long.class), (Long) rs.getObject(3, Long.class)})
                .single();
        boolean regressed = row[0] == null || (row[2] != null && row[0] < row[2]);
        return new IndexerStatus(row[0], row[1], row[2], regressed);
    }

    public Optional<Long> head() {
        try {
            return jdbc.sql("SELECT block_number FROM tela_read.chain_head WHERE id = 'head'").query(Long.class).optional();
        } catch (DataAccessException e) {
            return Optional.empty();
        }
    }

    public static class IndexerUnavailableException extends RuntimeException {
        public IndexerUnavailableException(Throwable cause) {
            super("indexer read model unavailable", cause);
        }
    }

    static BigInteger toBig(BigDecimal d) {
        return d == null ? BigInteger.ZERO : d.toBigIntegerExact();
    }
}
