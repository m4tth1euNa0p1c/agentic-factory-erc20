// Read model consumed by Java through the `tela_read` views (data-model.md §ponder).
import { index, onchainTable } from "ponder";

export const accountBalance = onchainTable(
  "account_balance",
  (t) => ({
    id: t.text().primaryKey(), // `${token}:${account}`
    token: t.text().notNull(), // TCE | TCD | TIF
    account: t.hex().notNull(), // lowercase address
    balance: t.bigint().notNull(),
    lastBlock: t.bigint().notNull(),
  }),
  (table) => ({ accountIdx: index().on(table.account) }),
);

/** One row per executed business operation (TransferWithReference). Refs are scoped per sender (D-12). */
export const operationExecution = onchainTable(
  "operation_execution",
  (t) => ({
    id: t.text().primaryKey(), // `${token}:${from}:${ref}`
    ref: t.hex().notNull(),
    token: t.text().notNull(),
    from: t.hex().notNull(),
    to: t.hex().notNull(),
    amount: t.bigint().notNull(),
    txHash: t.hex().notNull(),
    blockNumber: t.bigint().notNull(),
    logIndex: t.integer().notNull(),
  }),
  (table) => ({ refIdx: index().on(table.ref) }),
);

/** Indexing freshness (spec 005 A-03). */
export const chainHead = onchainTable("chain_head", (t) => ({
  id: t.text().primaryKey(), // 'head'
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));
