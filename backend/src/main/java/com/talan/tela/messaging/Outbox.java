package com.talan.tela.messaging;

import com.talan.tela.TelaProperties;
import com.talan.tela.operation.Operation;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Transactional outbox (D-08): commands are written with the business change, published by {@link OutboxRelay}. */
@Component
public class Outbox {
    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final TelaProperties props;

    public Outbox(JdbcClient jdbc, JsonMapper json, TelaProperties props) {
        this.jdbc = jdbc;
        this.json = json;
        this.props = props;
    }

    /** Payload follows schemas/kafka/operation-command.v1.json; key = from address (D-05). */
    public void enqueueCommand(String type, Operation op) {
        Map<String, Object> cmd = new LinkedHashMap<>();
        cmd.put("schemaVersion", 1);
        cmd.put("type", type);
        cmd.put("operationId", op.operationId().toString());
        cmd.put("reference", op.reference());
        cmd.put("token", op.token());
        cmd.put("from", op.from());
        cmd.put("to", op.to());
        cmd.put("amount", op.amount().toString());
        cmd.put("issuedAt", OffsetDateTime.now(ZoneOffset.UTC).toString());
        jdbc.sql("INSERT INTO outbox(topic, msg_key, payload) VALUES (?, ?, ?)")
                .param(props.commandsTopic()).param(op.from()).param(json.writeValueAsString(cmd)).update();
    }
}
