package com.talan.tela.api;

import com.talan.tela.operation.IndexedBalances;
import com.talan.tela.operation.OperationService;
import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.http.converter.HttpMessageNotReadableException;

/** RFC 9457 problem responses with a stable machine `code` (OpenAPI Problem.code). */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static ProblemDetail problem(HttpStatus s, String code, String detail) {
        var p = ProblemDetail.forStatusAndDetail(s, detail);
        p.setProperty("code", code);
        return p;
    }

    @ExceptionHandler(OperationService.InsufficientAvailableException.class)
    ProblemDetail insufficient(OperationService.InsufficientAvailableException e) {
        var p = problem(HttpStatus.CONFLICT, "INSUFFICIENT_AVAILABLE", e.getMessage());
        p.setProperty("available", e.available.toString());
        return p;
    }

    @ExceptionHandler(OperationService.IdempotencyConflictException.class)
    ProblemDetail idempotency(OperationService.IdempotencyConflictException e) {
        return problem(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", e.getMessage());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HandlerMethodValidationException.class,
            ConstraintViolationException.class, HttpMessageNotReadableException.class, MissingRequestHeaderException.class,
            IllegalArgumentException.class})
    ProblemDetail invalid(Exception e) {
        return problem(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "invalid request");
    }

    @ExceptionHandler(IndexedBalances.IndexerUnavailableException.class)
    ProblemDetail indexer(IndexedBalances.IndexerUnavailableException e) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "INDEXER_UNAVAILABLE", "read model not available yet");
    }
}
