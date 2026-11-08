// Crash-safe journal of signed transactions (db tela_adapter). Written BEFORE broadcast (D-04).
import pg from "pg";
import type { Address, Hex } from "viem";
import type { ResultStatus } from "./messages.ts";
import type { Journal, TxAttempt } from "./ports.ts";

export const MIGRATION = `
CREATE TABLE IF NOT EXISTS tx_attempt (
  operation_id  uuid PRIMARY KEY,
  from_address  text   NOT NULL,
  nonce         numeric(20,0) NOT NULL,
  raw_tx        text   NOT NULL,
  tx_hash       text   NOT NULL UNIQUE,
  state         text   NOT NULL CHECK (state IN ('SIGNED','BROADCAST','FINAL')),
  final_status  text   CHECK (final_status IN ('CONFIRMED','FAILED')),
  block_number  numeric(20,0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_address, nonce)
);`;

type Row = { operation_id: string; from_address: string; nonce: string; raw_tx: string; tx_hash: string; state: TxAttempt["state"]; final_status: ResultStatus | null; block_number: string | null };

export class PgJournal implements Journal {
  private readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 4 });
  }
  async migrate() {
    await this.pool.query(MIGRATION);
  }
  async close() {
    await this.pool.end();
  }
  async get(operationId: string): Promise<TxAttempt | null> {
    const { rows } = await this.pool.query<Row>("SELECT * FROM tx_attempt WHERE operation_id = $1", [operationId]);
    const r = rows[0];
    if (!r) return null;
    return {
      operationId: r.operation_id, from: r.from_address as Address, nonce: BigInt(r.nonce), rawTx: r.raw_tx as Hex, txHash: r.tx_hash as Hex,
      state: r.state, finalStatus: r.final_status, blockNumber: r.block_number === null ? null : BigInt(r.block_number),
    };
  }
  async maxNonce(from: Address): Promise<bigint | null> {
    const { rows } = await this.pool.query<{ m: string | null }>("SELECT max(nonce)::text AS m FROM tx_attempt WHERE from_address = $1", [from.toLowerCase()]);
    return rows[0]?.m == null ? null : BigInt(rows[0].m);
  }
  async insertSigned(a: Omit<TxAttempt, "state" | "finalStatus" | "blockNumber">) {
    await this.pool.query(
      "INSERT INTO tx_attempt (operation_id, from_address, nonce, raw_tx, tx_hash, state) VALUES ($1,$2,$3,$4,$5,'SIGNED')",
      [a.operationId, a.from.toLowerCase(), a.nonce.toString(), a.rawTx, a.txHash],
    );
  }
  async markBroadcast(operationId: string) {
    await this.pool.query("UPDATE tx_attempt SET state='BROADCAST', updated_at=now() WHERE operation_id=$1 AND state='SIGNED'", [operationId]);
  }
  async markFinal(operationId: string, status: ResultStatus, blockNumber: bigint | null) {
    await this.pool.query(
      "UPDATE tx_attempt SET state='FINAL', final_status=$2, block_number=$3, updated_at=now() WHERE operation_id=$1",
      [operationId, status, blockNumber === null ? null : blockNumber.toString()],
    );
  }
}
