package com.talan.tela;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("tela")
public record TelaProperties(
        String commandsTopic,
        String resultsTopic,
        Duration reconcileAfter,
        int relayBatchSize) {

    public TelaProperties {
        if (commandsTopic == null) commandsTopic = "tela.operations.commands.v1";
        if (resultsTopic == null) resultsTopic = "tela.operations.results.v1";
        if (reconcileAfter == null) reconcileAfter = Duration.ofSeconds(30);
        if (relayBatchSize <= 0) relayBatchSize = 100;
    }
}
