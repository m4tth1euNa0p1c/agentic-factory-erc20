-- Spec 002 data-model.md §backend. Schema `backend` is owned by tela_backend.
CREATE TABLE operation (
    operation_id      uuid PRIMARY KEY,
    idempotency_key   text NOT NULL UNIQUE,
    type              text NOT NULL CHECK (type IN ('TRANSFER')),
    from_address      char(42) NOT NULL CHECK (from_address = lower(from_address)),
    to_address        char(42) NOT NULL CHECK (to_address = lower(to_address)),
    token             text NOT NULL CHECK (token IN ('TCE', 'TCD', 'TIF')),
    amount            numeric(78, 0) NOT NULL CHECK (amount > 0),
    reference         char(66) NOT NULL,
    status            text NOT NULL CHECK (status IN ('RECEIVED','PUBLISHED','BROADCAST','UNKNOWN','CONFIRMED','SETTLED','FAILED','REJECTED')),
    tx_hash           char(66),
    block_number      bigint,
    failure_reason    text,
    last_reconcile_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operation_status_idx ON operation (status, updated_at);
CREATE INDEX operation_from_idx ON operation (from_address, created_at DESC);

CREATE TABLE operation_transition (
    id           bigserial PRIMARY KEY,
    operation_id uuid NOT NULL REFERENCES operation,
    from_status  text,
    to_status    text NOT NULL,
    source       text NOT NULL,
    at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reservation (
    operation_id uuid PRIMARY KEY REFERENCES operation,
    account      char(42) NOT NULL,
    token        text NOT NULL,
    amount       numeric(78, 0) NOT NULL CHECK (amount > 0),
    state        text NOT NULL CHECK (state IN ('HELD', 'RELEASED')),
    released_at  timestamptz
);
CREATE INDEX reservation_held_idx ON reservation (account, token) WHERE state = 'HELD';

-- One row per (account, token), locked FOR UPDATE to serialize availability checks (FR-002).
CREATE TABLE account_lock (
    account char(42) NOT NULL,
    token   text NOT NULL,
    PRIMARY KEY (account, token)
);

CREATE TABLE outbox (
    id           bigserial PRIMARY KEY,
    topic        text NOT NULL,
    msg_key      text NOT NULL,
    payload      text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX outbox_pending_idx ON outbox (id) WHERE published_at IS NULL;

-- Idempotent results consumer: a given (operation, status) is applied at most once.
CREATE TABLE processed_result (
    operation_id uuid NOT NULL,
    status       text NOT NULL,
    at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (operation_id, status)
);
