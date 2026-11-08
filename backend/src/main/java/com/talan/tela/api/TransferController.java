package com.talan.tela.api;

import com.talan.tela.domain.Status;
import com.talan.tela.operation.IndexedBalances;
import com.talan.tela.operation.Operation;
import com.talan.tela.operation.OperationRepository;
import com.talan.tela.operation.OperationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigInteger;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Implements schemas/openapi/tela-api.v1.yaml. */
@RestController
@RequestMapping("/api/v1")
@Validated
public class TransferController {
    private static final String ADDRESS = "^0x[0-9a-fA-F]{40}$";
    private static final List<String> TOKENS = List.of("TCE", "TCD", "TIF");

    private final OperationService service;
    private final OperationRepository repo;
    private final IndexedBalances indexed;

    public TransferController(OperationService service, OperationRepository repo, IndexedBalances indexed) {
        this.service = service;
        this.repo = repo;
        this.indexed = indexed;
    }

    public record TransferBody(
            @NotNull @Pattern(regexp = ADDRESS) String from,
            @NotNull @Pattern(regexp = ADDRESS) String to,
            @NotNull @Pattern(regexp = "^(TCE|TCD|TIF)$") String token,
            @NotNull @Pattern(regexp = "^[1-9][0-9]{0,77}$") String amount) {}

    public record OperationDto(String operationId, String type, String from, String to, String token, String amount,
            String reference, String status, String txHash, String blockNumber, String failureReason, String createdAt, String updatedAt) {
        static OperationDto of(Operation o) {
            return new OperationDto(o.operationId().toString(), o.type(), o.from(), o.to(), o.token(), o.amount().toString(),
                    o.reference(), o.status().name(), o.txHash(), o.blockNumber() == null ? null : o.blockNumber().toString(),
                    o.failureReason(), String.valueOf(o.createdAt()), String.valueOf(o.updatedAt()));
        }
    }

    public record BalanceDto(String token, String indexed, String pending, String available, String availableRaw,
            String heldTotal, String indexedAtBlock) {}

    @PostMapping("/transfers")
    public ResponseEntity<OperationDto> createTransfer(
            @RequestHeader("Idempotency-Key") @Size(min = 8, max = 128) String idempotencyKey,
            @Valid @RequestBody TransferBody body) {
        var req = new OperationService.TransferRequest(
                body.from().toLowerCase(Locale.ROOT), body.to().toLowerCase(Locale.ROOT), body.token(), new BigInteger(body.amount()));
        var created = service.createTransfer(req, idempotencyKey);
        return ResponseEntity.status(created.replay() ? HttpStatus.OK : HttpStatus.ACCEPTED).body(OperationDto.of(created.operation()));
    }

    @GetMapping("/operations/{operationId}")
    public ResponseEntity<OperationDto> getOperation(@PathVariable UUID operationId) {
        return repo.find(operationId).map(o -> ResponseEntity.ok(OperationDto.of(o))).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/operations")
    public List<OperationDto> listOperations(
            @RequestParam(required = false) @Pattern(regexp = ADDRESS) String account,
            @RequestParam(required = false) Status status,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return repo.list(account == null ? null : account.toLowerCase(Locale.ROOT), status, limit).stream().map(OperationDto::of).toList();
    }

    @GetMapping("/accounts/{address}/balances")
    public List<BalanceDto> getBalances(@PathVariable @Pattern(regexp = ADDRESS) String address) {
        String account = address.toLowerCase(Locale.ROOT);
        return TOKENS.stream().map(t -> {
            var a = indexed.availability(account, t);
            // `available` is what the user may still reserve (display, clamped at 0);
            // `availableRaw` is the unclamped invariant value, exposed so verifiers can check it is never negative.
            return new BalanceDto(t, a.indexed().toString(), a.pending().toString(), a.raw().max(BigInteger.ZERO).toString(),
                    a.raw().toString(), a.heldTotal().toString(), indexed.head().map(String::valueOf).orElse(null));
        }).toList();
    }
}
