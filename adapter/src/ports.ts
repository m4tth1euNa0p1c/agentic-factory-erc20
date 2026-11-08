// Ports used by the processor. Real implementations: journal.ts (pg), chain.ts (viem/Besu), signer.ts (Web3Signer).
// Unit tests inject in-memory fakes (test/fakes.ts).
import type { Address, Hex } from "viem";
import type { OperationResult, ResultStatus } from "./messages.ts";

export type AttemptState = "SIGNED" | "BROADCAST" | "FINAL";

export type TxAttempt = {
  operationId: string;
  from: Address;
  nonce: bigint;
  rawTx: Hex;
  txHash: Hex;
  state: AttemptState;
  finalStatus: ResultStatus | null;
  blockNumber: bigint | null;
};

export interface Journal {
  get(operationId: string): Promise<TxAttempt | null>;
  maxNonce(from: Address): Promise<bigint | null>;
  /** Must fail if operationId or (from, nonce) already exists. Persisted BEFORE broadcast (D-04). */
  insertSigned(a: Omit<TxAttempt, "state" | "finalStatus" | "blockNumber">): Promise<void>;
  markBroadcast(operationId: string): Promise<void>;
  markFinal(operationId: string, status: ResultStatus, blockNumber: bigint | null, txHash?: Hex): Promise<void>;
}

export type Receipt = { status: "success" | "reverted"; blockNumber: bigint; transactionHash: Hex };

export type SimulationOutcome =
  | { ok: true; gas: bigint }
  | { ok: false; kind: "revert"; errorName: string }; // deterministic revert

export interface Chain {
  simulateTransfer(p: { token: Address; from: Address; to: Address; amount: bigint; ref: Hex }): Promise<SimulationOutcome>;
  pendingNonce(from: Address): Promise<bigint>;
  /** Idempotent: "already known" / "nonce too low" for the same tx are swallowed by the implementation. */
  sendRawTransaction(raw: Hex): Promise<void>;
  /** Resolves null on timeout. Throws on RPC unavailability. */
  waitForReceipt(hash: Hex, timeoutMs: number): Promise<Receipt | null>;
  getReceipt(hash: Hex): Promise<Receipt | null>;
  /** Original TransferWithReference event emitted by `from` for `ref` (refs are scoped per sender, D-12). */
  findReferenceLog(token: Address, from: Address, ref: Hex): Promise<{ txHash: Hex; blockNumber: bigint; to: Address; amount: bigint } | null>;
  encodeTransfer(to: Address, amount: bigint, ref: Hex): Hex;
}

export interface Signer {
  /** Web3Signer eth_signTransaction (legacy, EIP-155 with configured chain id). Returns raw signed tx. */
  signTransaction(tx: { from: Address; to: Address; data: Hex; nonce: bigint; gas: bigint; gasPrice: bigint }): Promise<Hex>;
}

export interface Publisher {
  publish(r: OperationResult): Promise<void>;
}

export type Fault = "none" | "crash-after-broadcast" | "crash-before-broadcast" | "pause-before-broadcast";

export type Logger = {
  info(msg: string, f?: Record<string, unknown>): void;
  warn(msg: string, f?: Record<string, unknown>): void;
  error(msg: string, f?: Record<string, unknown>): void;
};

/** Thrown when nothing happened on-chain yet and the command must be retried later (offset NOT committed). */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}
