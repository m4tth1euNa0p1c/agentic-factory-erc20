-- Review #18 F2: bounded, backed-off reconciliation
ALTER TABLE operation ADD COLUMN reconcile_attempts int NOT NULL DEFAULT 0;
