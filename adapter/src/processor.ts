// Core of the adapter (spec 002 FR-004..FR-006, D-03, D-04). Pure orchestration over injected ports.
// Invariant: a signed transaction is persisted before it is broadcast; a command is never signed twice.
import { keccak256, type Address, type Hex } from "viem";
import { OperationCommand, referenceOf, result, type OperationResult } from "./messages.ts";
import { RetryableError, type Chain, type Fault, type Journal, type Logger, type Publisher, type Signer, type TxAttempt } from "./ports.ts";

export type ProcessorDeps = {
  journal: Journal;
  chain: Chain;
  signer: Signer;
  publisher: Publisher;
  tokens: Record<"TCE" | "TCD" | "TIF", Address>; // whitelist of `to` contracts
  receiptTimeoutMs: number;
  fault: Fault;
  crash: (code: number) => never; // injected (process.exit in prod, throw in tests)
  log: Logger;
  now?: () => Date;
};

export type Outcome = OperationResult | { dlq: true; reason: string };

export class Processor {
  private readonly d: ProcessorDeps;
  constructor(deps: ProcessorDeps) {
    this.d = deps;
  }

  /** Handle one raw Kafka message value. Throws RetryableError to keep the offset uncommitted. */
  async handle(raw: unknown): Promise<Outcome> {
    const parsed = OperationCommand.safeParse(raw);
    if (!parsed.success) {
      const opId = typeof raw === "object" && raw && "operationId" in raw ? String((raw as { operationId: unknown }).operationId) : null;
      this.d.log.warn("invalid command -> DLQ", { operationId: opId, issues: parsed.error.issues.length });
      if (opId && /^[0-9a-f-]{36}$/i.test(opId)) await this.emit(result(opId, "REJECTED", { reason: "INVALID_MESSAGE" }, this.d.now));
      return { dlq: true, reason: "INVALID_MESSAGE" };
    }
    const cmd = parsed.data;
    if (cmd.reference !== referenceOf(cmd.operationId)) {
      return this.emit(result(cmd.operationId, "REJECTED", { reason: "INVALID_REFERENCE" }, this.d.now));
    }
    const token = this.d.tokens[cmd.token];

    const existing = await this.d.journal.get(cmd.operationId);
    if (existing) return this.resume(existing);
    return this.execute(cmd, token);
  }

  private async execute(cmd: OperationCommand, token: Address): Promise<OperationResult> {
    const { chain, journal, signer } = this.d;
    const amount = BigInt(cmd.amount);
    const ref = cmd.reference;

    const sim = await this.rpc(() => chain.simulateTransfer({ token, from: cmd.from, to: cmd.to, amount, ref }));
    if (!sim.ok) {
      if (sim.errorName === "ReferenceAlreadyUsed") {
        // The business effect already happened (e.g. journal lost after broadcast): never re-execute (spec 002 US2-3).
        const log = await this.rpc(() => chain.findReferenceLog(token, cmd.from, ref));
        // Only conclude "already executed" if the original event matches this exact operation (review M-4).
        if (log && (log.to.toLowerCase() !== cmd.to.toLowerCase() || log.amount !== amount)) {
          this.d.log.error("reference reused with different parameters", { operationId: cmd.operationId, txHash: log.txHash });
          return this.emit(result(cmd.operationId, "REJECTED", { reason: "REFERENCE_CONFLICT" }, this.d.now));
        }
        if (log) {
          this.d.log.info("reference already executed on-chain", { operationId: cmd.operationId, txHash: log.txHash });
          return this.emit(result(cmd.operationId, "CONFIRMED", { txHash: log.txHash, blockNumber: log.blockNumber.toString() }, this.d.now));
        }
        return this.emit(result(cmd.operationId, "REJECTED", { reason: "SIMULATION_REVERT:ReferenceAlreadyUsed" }, this.d.now));
      }
      return this.emit(result(cmd.operationId, "REJECTED", { reason: `SIMULATION_REVERT:${sim.errorName}` }, this.d.now));
    }

    const chainNonce = await this.rpc(() => chain.pendingNonce(cmd.from));
    const journalMax = await journal.maxNonce(cmd.from);
    const nonce = journalMax !== null && journalMax + 1n > chainNonce ? journalMax + 1n : chainNonce;
    const gas = (sim.gas * 12n) / 10n;
    const data = chain.encodeTransfer(cmd.to, amount, ref);

    const rawTx = await this.rpc(() => signer.signTransaction({ from: cmd.from, to: token, data, nonce, gas, gasPrice: 0n }));
    const txHash = keccak256(rawTx);
    await journal.insertSigned({ operationId: cmd.operationId, from: cmd.from, nonce, rawTx, txHash });
    this.d.log.info("signed and journaled", { operationId: cmd.operationId, txHash, nonce: nonce.toString() });

    if (this.d.fault === "crash-before-broadcast") this.d.crash(137);
    return this.broadcastAndTrack({ operationId: cmd.operationId, from: cmd.from, nonce, rawTx, txHash, state: "SIGNED", finalStatus: null, blockNumber: null }, true);
  }

  /** Re-processing after a crash/redelivery: reuse the journaled signed tx, never sign again (D-04). */
  private async resume(a: TxAttempt): Promise<OperationResult> {
    this.d.log.info("resuming journaled attempt", { operationId: a.operationId, txHash: a.txHash, state: a.state });
    if (a.state === "FINAL" && a.finalStatus) {
      const extra = { txHash: a.txHash, ...(a.blockNumber !== null ? { blockNumber: a.blockNumber.toString() } : {}) };
      return this.emit(result(a.operationId, a.finalStatus, extra, this.d.now));
    }
    const receipt = await this.tryRpc(() => this.d.chain.getReceipt(a.txHash));
    if (receipt) return this.finalize(a, receipt);
    return this.broadcastAndTrack(a);
  }

  /** `fresh` = first execution of the command; fault injection only fires then (no crash loop on resume). */
  private async broadcastAndTrack(a: TxAttempt, fresh = false): Promise<OperationResult> {
    const sent = await this.tryRpc(() => this.d.chain.sendRawTransaction(a.rawTx).then(() => true));
    if (sent === null) {
      // Signed + maybe broadcast: the outcome is unknown, the reservation must be kept (D-07).
      return this.emit(result(a.operationId, "UNKNOWN", { txHash: a.txHash, reason: "RPC_UNAVAILABLE" }, this.d.now));
    }
    if (fresh && this.d.fault === "crash-after-broadcast") {
      this.d.log.warn("FAULT INJECTION: crash after broadcast", { operationId: a.operationId, txHash: a.txHash });
      this.d.crash(137);
    }
    if (a.state === "SIGNED") await this.d.journal.markBroadcast(a.operationId);
    await this.emit(result(a.operationId, "BROADCAST", { txHash: a.txHash }, this.d.now));
    return this.track(a);
  }

  private async track(a: TxAttempt): Promise<OperationResult> {
    let receipt;
    try {
      receipt = await this.d.chain.waitForReceipt(a.txHash, this.d.receiptTimeoutMs);
    } catch (e) {
      this.d.log.warn("receipt lookup failed", { operationId: a.operationId, err: String(e) });
      return this.emit(result(a.operationId, "UNKNOWN", { txHash: a.txHash, reason: "RPC_UNAVAILABLE" }, this.d.now));
    }
    if (!receipt) return this.emit(result(a.operationId, "UNKNOWN", { txHash: a.txHash, reason: "RECEIPT_TIMEOUT" }, this.d.now));
    return this.finalize(a, receipt);
  }

  private async finalize(a: TxAttempt, r: { status: "success" | "reverted"; blockNumber: bigint }): Promise<OperationResult> {
    const status = r.status === "success" ? "CONFIRMED" : "FAILED";
    await this.d.journal.markFinal(a.operationId, status, r.blockNumber);
    return this.emit(
      result(a.operationId, status, { txHash: a.txHash, blockNumber: r.blockNumber.toString(), ...(status === "FAILED" ? { reason: "REVERTED" } : {}) }, this.d.now),
    );
  }

  private async emit(r: OperationResult): Promise<OperationResult> {
    await this.d.publisher.publish(r);
    this.d.log.info("result published", { operationId: r.operationId, status: r.status, txHash: r.txHash, reason: r.reason });
    return r;
  }

  /** Before anything is signed, an RPC failure means nothing happened: retry later. */
  private async rpc<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e) {
      throw new RetryableError(`rpc unavailable before broadcast: ${String(e)}`);
    }
  }

  /** After signing, RPC failures are reported as an unknown outcome instead of retried blindly. */
  private async tryRpc<T>(f: () => Promise<T>): Promise<T | null> {
    try {
      return await f();
    } catch (e) {
      this.d.log.warn("rpc call failed after signing", { err: String(e) });
      return null;
    }
  }
}

export const isDlq = (o: Outcome): o is { dlq: true; reason: string } => "dlq" in o;
export type { Hex };
