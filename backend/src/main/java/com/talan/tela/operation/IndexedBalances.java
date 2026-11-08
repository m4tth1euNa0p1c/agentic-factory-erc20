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
