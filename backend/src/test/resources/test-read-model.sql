-- Stand-in for the Ponder read model (`tela_read` views), same column names as indexer/ponder.schema.ts.
CREATE SCHEMA backend;
CREATE SCHEMA tela_read;
CREATE TABLE tela_read.account_balance (id text PRIMARY KEY, token text, account text, balance numeric(78,0), last_block numeric(78,0));
CREATE TABLE tela_read.operation_execution (id text PRIMARY KEY, ref text, token text, "from" text, "to" text, amount numeric(78,0),
  tx_hash text, block_number numeric(78,0), log_index int);
CREATE TABLE tela_read.chain_head (id text PRIMARY KEY, block_number numeric(78,0), timestamp numeric(78,0));
