-- D-23: highest indexed block ever observed; a lower head means the read model regressed
CREATE TABLE indexer_watermark (id text PRIMARY KEY, block bigint NOT NULL);
