package com.talan.tela.messaging;

import com.talan.tela.domain.Status;
import com.talan.tela.operation.OperationService;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Consumes schemas/kafka/operation-result.v1.json. Invalid messages are logged and skipped (never applied). */
@Component
public class ResultListener {
    private static final Logger log = LoggerFactory.getLogger(ResultListener.class);
    private static final Set<String> ALLOWED = Set.of("BROADCAST", "CONFIRMED", "FAILED", "REJECTED", "UNKNOWN");

    private final OperationService service;
    private final JsonMapper json;

    public ResultListener(OperationService service, JsonMapper json) {
        this.service = service;
        this.json = json;
    }

    @KafkaListener(topics = "${tela.results-topic:tela.operations.results.v1}", groupId = "tela-backend")
    public void onResult(String payload) {
        final JsonNode n;
        try {
            n = json.readTree(payload);
        } catch (RuntimeException e) {
            log.warn("unparseable result skipped");
            return;
        }
        String status = text(n, "status");
        String opId = text(n, "operationId");
        if (n.path("schemaVersion").asInt() != 1 || status == null || !ALLOWED.contains(status) || opId == null) {
            log.warn("invalid result skipped operationId={} status={}", opId, status);
            return;
        }
        String tx = text(n, "txHash");
        if (tx != null && !tx.matches("^0x[0-9a-f]{64}$")) {
            log.warn("invalid txHash skipped operationId={}", opId);
            return;
        }
        String block = text(n, "blockNumber");
        String reason = text(n, "reason");
        if ((block != null && !block.matches("^[0-9]{1,18}$")) || (reason != null && !reason.matches("^[A-Za-z0-9_:]{1,128}$"))) {
            log.warn("invalid result fields skipped operationId={}", opId);
            return;
        }
        service.applyResult(new OperationService.Result(UUID.fromString(opId), Status.valueOf(status), tx,
                block == null ? null : Long.valueOf(block), reason));
    }

    private static String text(JsonNode n, String f) {
        JsonNode v = n.get(f);
        return v == null || v.isNull() ? null : v.asString();
    }
}
