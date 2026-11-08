package com.talan.tela.messaging;

import com.talan.tela.TelaProperties;
import com.talan.tela.operation.OperationRepository;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Publishes outbox rows to Kafka (at-least-once). A crash between send and commit re-sends the row:
 * harmless, since the adapter is idempotent per operationId.
 */
@Component
public class OutboxRelay {
    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final JdbcClient jdbc;
    private final KafkaTemplate<String, String> kafka;
    private final OperationRepository repo;
    private final JsonMapper json;
    private final TelaProperties props;

    public OutboxRelay(JdbcClient jdbc, KafkaTemplate<String, String> kafka, OperationRepository repo, JsonMapper json, TelaProperties props) {
        this.jdbc = jdbc;
        this.kafka = kafka;
        this.repo = repo;
        this.json = json;
        this.props = props;
    }

    record Row(long id, String topic, String key, String payload) {}

    @Scheduled(fixedDelayString = "${tela.relay-interval:200ms}")
    @Transactional
    public void relay() throws Exception {
        var rows = jdbc.sql("SELECT id, topic, msg_key, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED")
                .param(props.relayBatchSize())
                .query((rs, i) -> new Row(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4)))
                .list();
        for (Row r : rows) {
            kafka.send(r.topic(), r.key(), r.payload()).get(10, TimeUnit.SECONDS);
            jdbc.sql("UPDATE outbox SET published_at = now() WHERE id = ?").param(r.id()).update();
            var node = json.readTree(r.payload());
            if ("TRANSFER".equals(node.get("type").asString())) {
                repo.markPublished(UUID.fromString(node.get("operationId").asString()));
            }
            log.debug("outbox {} published to {}", r.id(), r.topic());
        }
    }
}
