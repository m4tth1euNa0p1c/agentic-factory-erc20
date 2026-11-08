// Core of the adapter (spec 002 FR-004..FR-006, D-03, D-04, D-12). Pure orchestration over injected ports.
// Invariants:
//  - a signed transaction is persisted before it is broadcast, and a command is never signed twice;
//  - a terminal FAILED is published only when the reference is proven NOT executed on-chain (review F1/F4);
//  - an RPC failure after signing is reported UNKNOWN (the reservation is kept, D-07).
import { keccak256, type Address, type Hex } from "viem";
import { OperationCommand, referenceOf, result, type OperationResult } from "./messages.ts";
import {
  RetryableError, errMsg, type Chain, type Fault, type Journal, type Logger, type Publisher, type Receipt, type Signer, type TxAttempt,
} from "./ports.ts";

export type ProcessorDeps = {
  journal: Journal;
  chain: Chain;
  signer: Signer;
  publisher: Publisher;
  tokens: Record<"TCE" | "TCD" | "TIF", Address>; // whitelist of `to` contracts
  /** Accounts this adapter may sign for (lowercase). Undefined = no restriction (unit tests only). */
  signableAccounts?: ReadonlySet<string>;
  receiptTimeoutMs: number;
  reconcileReceiptTimeoutMs?: number; // RECONCILE must not hold the partition (review F2)
  fault: Fault;
  crash: (code: number) => never; // injected (process.exit in prod, throw in tests)
  pause?: () => Promise<void>; // fault "pause-before-broadcast": window between signing and broadcast (tests only)
  log: Logger;
  now?: () => Date;
};

export type Outcome = OperationResult | { dlq: true; reason: string };

type Ctx = { cmd: OperationCommand; token: Address; amount: bigint; timeoutMs: number };
type Executed = { txHash: Hex; blockNumber: bigint } | "conflict" | null;

export class Processor {
  private readonly d: ProcessorDeps;
  constructor(deps: ProcessorDeps) {
    this.d = deps;
  }

  /** Handle one raw Kafka message value. Throws RetryableError to keep the offset uncommitted. */
  async handle(raw: unknown): Promise<Outcome> {
    const parsed = OperationCommand.safeParse(raw);
    if (!parsed.success) {
      // Never publish a result for an invalid message: a forged one could release a reservation (review #18).
      this.d.log.warn("invalid command -> DLQ", { issues: parsed.error.issues.length });
      return { dlq: true, reason: "INVALID_MESSAGE" };
    }
    const cmd = parsed.data;
    if (cmd.reference !== referenceOf(cmd.operationId)) {
      return this.emit(result(cmd.operationId, "REJECTED", { reason: "INVALID_REFERENCE" }, this.d.now));
    }
    if (this.d.signableAccounts && !this.d.signableAccounts.has(cmd.from.toLowerCase())) {
      this.d.log.warn("sender not allowed for signing", { operationId: cmd.operationId });
      return this.emit(result(cmd.operationId, "REJECTED", { reason: "FROM_NOT_ALLOWED" }, this.d.now));
    }
    const ctx: Ctx = {
      cmd, token: this.d.tokens[cmd.token], amount: BigInt(cmd.amount),
      timeoutMs: cmd.type === "RECONCILE" ? (this.d.reconcileReceiptTimeoutMs ?? 3000) : this.d.receiptTimeoutMs,
    };

    const existing = await this.d.journal.get(cmd.operationId);
    if (existing) return this.resume(ctx, existing);
    if (cmd.type === "RECONCILE") return this.reconcileWithoutJournal(ctx);
    return this.execute(ctx);
  }

  private async execute(ctx: Ctx): Promise<OperationResult> {
    const { chain, journal, signer } = this.d;
    const { cmd, token, amount } = ctx;
    const ref = cmd.reference;

    const sim = await this.rpc(() => chain.simulateTransfer({ token, from: cmd.from, to: cmd.to, amount, ref }));
    if (!sim.ok) {
      if (sim.errorName === "ReferenceAlreadyUsed") {
        // The business effect may already have happened (e.g. journal lost after broadcast): never re-execute (US2-3).
        const ex = await this.rpc(() => this.executedOnChain(ctx));
        if (ex === "conflict") return this.emit(result(cmd.operationId, "REJECTED", { reason: "REFERENCE_CONFLICT" }, this.d.now));
        if (ex) return this.emit(result(cmd.operationId, "CONFIRMED", { txHash: ex.txHash, blockNumber: ex.blockNumber.toString() }, this.d.now));
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
    if (this.d.fault === "pause-before-broadcast" && this.d.pause) {
      this.d.log.warn("FAULT INJECTION: pause before broadcast", { operationId: cmd.operationId, txHash });
      await this.d.pause();
    }
    const attempt: TxAttempt = { operationId: cmd.operationId, from: cmd.from, nonce, rawTx, txHash, state: "SIGNED", finalStatus: null, blockNumber: null };
    return this.broadcastAndTrack(ctx, attempt, true);
  }

  /** Re-processing after a crash/redelivery/RECONCILE: reuse the journaled signed tx, never sign again (D-04). */
  private async resume(ctx: Ctx, a: TxAttempt): Promise<OperationResult> {
    this.d.log.info("resuming journaled attempt", { operationId: a.operationId, txHash: a.txHash, state: a.state });
    if (a.state === "FINAL" && a.finalStatus) {
      const extra = { txHash: a.txHash, ...(a.blockNumber !== null ? { blockNumber: a.blockNumber.toString() } : {}) };
      return this.emit(result(a.operationId, a.finalStatus, extra, this.d.now));
    }
    const receipt = await this.tryRpc(() => this.d.chain.getReceipt(a.txHash));
    if (receipt) return this.finalize(ctx, a, receipt);
    return this.broadcastAndTrack(ctx, a, false);
  }

  /** RECONCILE for an operation this adapter never journaled: look, never sign (review F4, FR-009). */
  private async reconcileWithoutJournal(ctx: Ctx): Promise<OperationResult> {
    const ex = await this.tryRpc(() => this.executedOnChain(ctx));
    if (ex && ex !== "conflict") {
      return this.emit(result(ctx.cmd.operationId, "CONFIRMED", { txHash: ex.txHash, blockNumber: ex.blockNumber.toString() }, this.d.now));
    }
    return this.emit(result(ctx.cmd.operationId, "UNKNOWN", { reason: ex === "conflict" ? "REFERENCE_CONFLICT" : "NOT_JOURNALED" }, this.d.now));
  }

  /** `fresh` = first execution of the command; fault injection only fires then (no crash loop on resume). */
  private async broadcastAndTrack(ctx: Ctx, a: TxAttempt, fresh = false): Promise<OperationResult> {
    const sent = await this.tryRpc(() => this.d.chain.sendRawTransaction(a.rawTx));
    if (sent === undefined) {
      // Signed + maybe broadcast: the outcome is unknown, the reservation must be kept (D-07).
      return this.emit(result(a.operationId, "UNKNOWN", { txHash: a.txHash, reason: "RPC_UNAVAILABLE" }, this.d.now));
    }
    if (sent === "nonce-too-low") return this.nonceConsumed(ctx, a);
    if (fresh && this.d.fault === "crash-after-broadcast") {
      this.d.log.warn("FAULT INJECTION: crash after broadcast", { operationId: a.operationId, txHash: a.txHash });
      this.d.crash(137);
    }
    if (a.state === "SIGNED") await this.d.journal.markBroadcast(a.operationId);
    await this.emit(result(a.operationId, "BROADCAST", { txHash: a.txHash }, this.d.now));
    return this.track(ctx, a);
  }

  /**
   * The node says our nonce is used. Either our tx was mined (receipt), or the reference was executed by another
   * tx, or another writer consumed the nonce and our tx can never be mined -> proven failure (review F1).
   */
  private async nonceConsumed(ctx: Ctx, a: TxAttempt): Promise<OperationResult> {
    const receipt = await this.tryRpc(() => this.d.chain.getReceipt(a.txHash));
    if (receipt) return this.finalize(ctx, a, receipt);
    const ex = await this.tryRpc(() => this.executedOnChain(ctx));
    if (ex && ex !== "conflict") return this.confirmFromLog(a, ex);
    const latest = await this.tryRpc(() => this.d.chain.latestNonce(a.from));
    if (ex === null && latest !== undefined && latest > a.nonce) {
      this.d.log.error("nonce consumed by another transaction; journaled tx can never be mined", { operationId: a.operationId, txHash: a.txHash });
      await this.d.journal.markFinal(a.operationId, "FAILED", null);
      return this.emit(result(a.operationId, "FAILED", { txHash: a.txHash, reason: "NONCE_CONSUMED" }, this.d.now));
    }
    return this.emit(result(a.operationId, "UNKNOWN", { txHash: a.txHash, reason: "NONCE_STATE_UNCLEAR" }, this.d.now));
  }

  private async track(ctx: Ctx, a: TxAttempt): Promise<OperationResult> {
    let receipt: Receipt | null;
    try {
      receipt = await this.d.chain.waitForReceipt(a.txHash, ctx.timeoutMs);
    } catch (e) {
      this.d.log.warn("receipt lookup failed", { operationId: a.operationId, err: errMsg(e) });
      return this.emit(result(a.operationId, "UNKNOWN", { txHash: a.txHash, reason: "RPC_UNAVAILABLE" }, this.d.now));
    }
    if (!receipt) return this.emit(result(a.operationId, "UNKNOWN", { txHash: a.txHash, reason: "RECEIPT_TIMEOUT" }, this.d.now));
    return this.finalize(ctx, a, receipt);
  }

  private async finalize(ctx: Ctx, a: TxAttempt, r: Receipt): Promise<OperationResult> {
    if (r.status === "reverted") {
      // A revert of OUR tx does not prove the operation failed: another tx may have executed the reference (F4).
      const ex = await this.tryRpc(() => this.executedOnChain(ctx));
      if (ex && ex !== "conflict") return this.confirmFromLog(a, ex);
      if (ex === undefined) {
        return this.emit(result(a.operationId, "UNKNOWN", { txHash: a.txHash, reason: "REVERT_UNVERIFIED" }, this.d.now));
      }
    }
    const status = r.status === "success" ? "CONFIRMED" : "FAILED";
    await this.d.journal.markFinal(a.operationId, status, r.blockNumber);
    return this.emit(
      result(a.operationId, status, { txHash: a.txHash, blockNumber: r.blockNumber.toString(), ...(status === "FAILED" ? { reason: "REVERTED" } : {}) }, this.d.now),
    );
  }

  private async confirmFromLog(a: TxAttempt, ex: { txHash: Hex; blockNumber: bigint }): Promise<OperationResult> {
    this.d.log.info("reference executed on-chain by another tx", { operationId: a.operationId, txHash: ex.txHash });
    await this.d.journal.markFinal(a.operationId, "CONFIRMED", ex.blockNumber);
    return this.emit(result(a.operationId, "CONFIRMED", { txHash: ex.txHash, blockNumber: ex.blockNumber.toString() }, this.d.now));
  }

  /** Matching event (same from, ref, to, amount) -> its tx; same (from, ref) with other parameters -> "conflict"; none -> null. */
  private async executedOnChain(ctx: Ctx): Promise<Executed> {
    const log = await this.d.chain.findReferenceLog(ctx.token, ctx.cmd.from, ctx.cmd.reference);
    if (!log) return null;
    if (log.to.toLowerCase() !== ctx.cmd.to.toLowerCase() || log.amount !== ctx.amount) {
      this.d.log.error("reference reused with different parameters", { operationId: ctx.cmd.operationId, txHash: log.txHash });
      return "conflict";
    }
    return { txHash: log.txHash, blockNumber: log.blockNumber };
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
      throw new RetryableError(`rpc unavailable before broadcast: ${errMsg(e)}`);
    }
  }

  /** After signing, RPC failures are reported as an unknown outcome instead of retried blindly (undefined on error). */
  private async tryRpc<T>(f: () => Promise<T>): Promise<T | undefined> {
    try {
      return await f();
    } catch (e) {
      this.d.log.warn("rpc call failed after signing", { err: errMsg(e) });
      return undefined;
    }
  }
}

export const isDlq = (o: Outcome): o is { dlq: true; reason: string } => "dlq" in o;
