package com.talan.tela.operation;

import com.talan.tela.TelaProperties;
import com.talan.tela.domain.Ids;
import com.talan.tela.domain.Status;
import com.talan.tela.messaging.Outbox;
import java.math.BigInteger;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OperationService {
    private static final Logger log = LoggerFactory.getLogger(OperationService.class);

    private final OperationRepository repo;
    private final IndexedBalances indexed;
    private final Outbox outbox;
    private final TelaProperties props;

    public OperationService(OperationRepository repo, IndexedBalances indexed, Outbox outbox, TelaProperties props) {
        this.repo = repo;
        this.indexed = indexed;
        this.outbox = outbox;
        this.props = props;
    }

    public record TransferRequest(String from, String to, String token, BigInteger amount) {}

    public record Created(Operation operation, boolean replay) {}

    public static class InsufficientAvailableException extends RuntimeException {
        public final BigInteger available;

        public InsufficientAvailableException(BigInteger available) {
            super("insufficient available balance");
            this.available = available;
        }
    }

    public static class IdempotencyConflictException extends RuntimeException {
        public IdempotencyConflictException() {
            super("Idempotency-Key reused with a different request");
        }
    }

    /**
     * FR-001..FR-003: check available = indexed - held >= amount and reserve, under a per (account, token) lock,
     * then write the operation, its reservation and the outbox command in ONE transaction.
     */
    @Transactional
    public Created createTransfer(TransferRequest req, String idempotencyKey) {
        var existing = repo.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) return replay(existing.get(), req);

        repo.lockAccount(req.from(), req.token());
        // re-check after acquiring the lock: a concurrent request with the same key may have committed meanwhile
        existing = repo.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) return replay(existing.get(), req);

        // Read reservations BEFORE the indexed balance (review #18 F3): a reservation is released only after its
        // execution is indexed, so this order can only under-estimate the available amount, never over-estimate it.
        BigInteger held = repo.heldAmount(req.from(), req.token());
        BigInteger available = indexed.balance(req.from(), req.token()).balance().subtract(held);
        if (available.compareTo(req.amount()) < 0) throw new InsufficientAvailableException(available.max(BigInteger.ZERO));

        UUID id = Ids.uuidV7();
        var op = new Operation(id, idempotencyKey, "TRANSFER", req.from(), req.to(), req.token(), req.amount(),
                Ids.reference(id), Status.RECEIVED, null, null, null, null, null);
        try {
            repo.insert(op);
        } catch (DuplicateKeyException e) {
            throw new IdempotencyConflictException();
        }
        outbox.enqueueCommand("TRANSFER", op);
        log.info("operation received operationId={} from={} token={} amount={}", id, req.from(), req.token(), req.amount());
        return new Created(repo.find(id).orElseThrow(), false);
    }

    private Created replay(Operation o, TransferRequest req) {
        boolean same = o.from().equals(req.from()) && o.to().equals(req.to()) && o.token().equals(req.token()) && o.amount().equals(req.amount());
        if (!same) throw new IdempotencyConflictException();
        return new Created(o, true);
    }

    public record Result(UUID operationId, Status status, String txHash, Long blockNumber, String reason) {}

    /** Idempotent, order-tolerant application of an adapter result (FR-006, D-06, D-07). */
    @Transactional
    public void applyResult(Result r) {
        if (!repo.markResultProcessed(r.operationId(), r.status().name())) {
            log.debug("duplicate result ignored operationId={} status={}", r.operationId(), r.status());
            return;
        }
        var op = repo.findForUpdate(r.operationId()).orElse(null);
        if (op == null) {
            log.warn("result for unknown operation {}", r.operationId());
            return;
        }
        if (!op.status().canMoveTo(r.status())) {
            log.info("transition {} -> {} ignored for {}", op.status(), r.status(), r.operationId());
            return;
        }
        repo.updateStatus(op.operationId(), op.status(), r.status(), r.txHash(), r.blockNumber(), r.reason(), "adapter");
        log.info("operation {} {} -> {} txHash={}", op.operationId(), op.status(), r.status(), r.txHash());
    }

    @Transactional
    public void requestReconcile(Operation op) {
        outbox.enqueueCommand("RECONCILE", op);
        repo.touchReconcile(op.operationId());
        log.info("reconcile requested operationId={} status={}", op.operationId(), op.status());
    }

    public TelaProperties props() {
        return props;
    }
}
