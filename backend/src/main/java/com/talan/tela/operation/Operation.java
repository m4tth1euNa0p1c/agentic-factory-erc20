package com.talan.tela.operation;

import com.talan.tela.domain.Status;
import java.math.BigInteger;
import java.time.OffsetDateTime;
import java.util.UUID;

public record Operation(
        UUID operationId,
        String idempotencyKey,
        String type,
        String from,
        String to,
        String token,
        BigInteger amount,
        String reference,
        Status status,
        String txHash,
        Long blockNumber,
        String failureReason,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {}
