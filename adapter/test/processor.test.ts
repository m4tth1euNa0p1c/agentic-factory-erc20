// Spec 002 acceptance scenarios at the adapter boundary (US1, US2, US4) — written before the processor (T010/T020/T040).
import { beforeEach, describe, expect, it } from "vitest";
import type { Address } from "viem";
import { Processor } from "../src/processor.ts";
import { referenceOf } from "../src/messages.ts";
import { RetryableError, type Fault } from "../src/ports.ts";
import { Crash, FakeChain, FakeSigner, MemJournal, MemPublisher, silent } from "./fakes.ts";

const ALICE = "0x00000000000000000000000000000000000a11ce" as Address;
const BOB = "0x0000000000000000000000000000000000000b0b" as Address;
const TCE = "0x00000000000000000000000000000000000000ce" as Address;
const OP = "0190f5a2-7c3e-7b1a-9f00-000000000001";

const cmd = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1, type: "TRANSFER", operationId: OP, reference: referenceOf(OP),
  token: "TCE", from: ALICE, to: BOB, amount: "10000000", issuedAt: "2026-11-08T12:00:00Z", ...over,
});

let chain: FakeChain, signer: FakeSigner, journal: MemJournal, pub: MemPublisher;
const make = (fault: Fault = "none") =>
  new Processor({
    journal, chain, signer, publisher: pub, tokens: { TCE, TCD: TCE, TIF: TCE }, receiptTimeoutMs: 1000, fault, log: silent,
    crash: (code) => { throw new Crash(code); },
  });

beforeEach(() => {
  chain = new FakeChain();
  chain.balances.set(ALICE.toLowerCase(), 100_000_000n);
  signer = new FakeSigner(chain);
  journal = new MemJournal();
  pub = new MemPublisher();
});

describe("US1 nominal", () => {
  it("signs once, journals before broadcast, publishes BROADCAST then CONFIRMED", async () => {
    const r = await make().handle(cmd());
    expect(r).toMatchObject({ status: "CONFIRMED", operationId: OP });
    expect(pub.statuses(OP)).toEqual(["BROADCAST", "CONFIRMED"]);
    expect(chain.bal(ALICE)).toBe(90_000_000n);
    expect(chain.bal(BOB)).toBe(10_000_000n);
    expect((await journal.get(OP))?.state).toBe("FINAL");
    expect(signer.calls).toBe(1);
  });

  it("rejects a reference that is not keccak256(operationId)", async () => {
    const r = await make().handle(cmd({ reference: "0x" + "ab".repeat(32) }));
    expect(r).toMatchObject({ status: "REJECTED", reason: "INVALID_REFERENCE" });
    expect(signer.calls).toBe(0);
  });

  it("sends schema-invalid messages to DLQ and never signs", async () => {
    const r = await make().handle(cmd({ amount: "1.5" }));
    expect(r).toEqual({ dlq: true, reason: "INVALID_MESSAGE" });
    expect(pub.statuses(OP)).toEqual(["REJECTED"]);
    expect(signer.calls).toBe(0);
  });

  it("rejects unknown fields (strict schema)", async () => {
    expect(await make().handle({ ...cmd(), evil: true })).toMatchObject({ dlq: true });
  });

  it("allocates increasing nonces per account from journal and chain", async () => {
    await make().handle(cmd());
    const op2 = "0190f5a2-7c3e-7b1a-9f00-000000000002";
    await make().handle(cmd({ operationId: op2, reference: referenceOf(op2) }));
    expect((await journal.get(op2))?.nonce).toBe(1n);
  });
});

describe("US2 restart after broadcast", () => {
  it("crash after broadcast then redelivery: same tx re-used, exactly one debit, no second signature", async () => {
    chain.autoMine = false;
    await expect(make("crash-after-broadcast").handle(cmd())).rejects.toBeInstanceOf(Crash);
    const journaled = await journal.get(OP);
    expect(journaled?.state).toBe("SIGNED"); // crashed before markBroadcast
    chain.mine(); // tx was in the mempool and gets mined while the adapter is down

    const r = await make().handle(cmd()); // Kafka redelivers (offset not committed)
    expect(r).toMatchObject({ status: "CONFIRMED", txHash: journaled!.txHash });
    expect(signer.calls).toBe(1);
    expect(chain.bal(ALICE)).toBe(90_000_000n);
    expect([...chain.usedRefs.keys()]).toHaveLength(1);
  });

  it("fault injection does not re-fire on resume (restart policy keeps the env): no crash loop", async () => {
    chain.autoMine = false;
    await expect(make("crash-after-broadcast").handle(cmd())).rejects.toBeInstanceOf(Crash);
    // restarted with the SAME fault setting, tx not mined yet -> must rebroadcast and track, not crash
    const p = make("crash-after-broadcast");
    chain.autoMine = true;
    expect(await p.handle(cmd())).toMatchObject({ status: "CONFIRMED" });
    expect(signer.calls).toBe(1);
  });

  it("crash before broadcast: journaled tx is broadcast on resume (same hash)", async () => {
    await expect(make("crash-before-broadcast").handle(cmd())).rejects.toBeInstanceOf(Crash);
    expect(chain.sendCount).toBe(0);
    const r = await make().handle(cmd());
    expect(r).toMatchObject({ status: "CONFIRMED", txHash: (await journal.get(OP))!.txHash });
    expect(signer.calls).toBe(1);
  });

  it("journal lost after execution: ReferenceAlreadyUsed -> original log -> CONFIRMED, nothing re-sent", async () => {
    const first = await make().handle(cmd());
    journal.rows.clear();
    const sends = chain.sendCount;
    const r = await make().handle(cmd());
    expect(r).toMatchObject({ status: "CONFIRMED", txHash: (first as { txHash: string }).txHash });
    expect(chain.sendCount).toBe(sends);
    expect(chain.bal(ALICE)).toBe(90_000_000n);
  });

  it("reference already used with different parameters -> REJECTED REFERENCE_CONFLICT (never a false CONFIRMED)", async () => {
    await make().handle(cmd());
    journal.rows.clear();
    expect(await make().handle(cmd({ amount: "5000000" }))).toMatchObject({ status: "REJECTED", reason: "REFERENCE_CONFLICT" });
    expect(chain.bal(ALICE)).toBe(90_000_000n);
  });

  it("redelivery of a FINAL operation republishes the same final result", async () => {
    const first = await make().handle(cmd());
    const again = await make().handle(cmd());
    expect(again).toMatchObject({ status: "CONFIRMED", txHash: (first as { txHash: string }).txHash });
    expect(signer.calls).toBe(1);
  });
});

describe("US4 confirmed failure vs unknown result", () => {
  it("receipt status 0 -> FAILED (reason REVERTED)", async () => {
    chain.revertOnMine = true;
    expect(await make().handle(cmd())).toMatchObject({ status: "FAILED", reason: "REVERTED" });
  });

  it("deterministic simulation revert -> REJECTED, nothing signed", async () => {
    chain.paused = true;
    expect(await make().handle(cmd())).toMatchObject({ status: "REJECTED", reason: "SIMULATION_REVERT:EnforcedPause" });
    expect(signer.calls).toBe(0);
  });

  it("insufficient on-chain balance -> REJECTED", async () => {
    expect(await make().handle(cmd({ amount: "200000000" }))).toMatchObject({ status: "REJECTED", reason: "SIMULATION_REVERT:ERC20InsufficientBalance" });
  });

  it("RPC down before signing -> RetryableError (offset kept), nothing published", async () => {
    chain.down = true;
    await expect(make().handle(cmd())).rejects.toBeInstanceOf(RetryableError);
    expect(pub.out).toHaveLength(0);
  });

  it("RPC down after broadcast -> UNKNOWN (never FAILED), then RECONCILE converges to CONFIRMED", async () => {
    chain.autoMine = false;
    const p = make();
    // go down right after the tx reached the mempool
    const orig = chain.sendRawTransaction.bind(chain);
    chain.sendRawTransaction = async (raw) => { await orig(raw); chain.down = true; };
    expect(await p.handle(cmd())).toMatchObject({ status: "UNKNOWN", reason: "RPC_UNAVAILABLE" });
    expect(pub.statuses(OP)).not.toContain("FAILED");

    chain.sendRawTransaction = orig;
    chain.down = false;
    chain.mine();
    expect(await make().handle(cmd({ type: "RECONCILE" }))).toMatchObject({ status: "CONFIRMED" });
    expect(signer.calls).toBe(1);
  });

  it("pause-before-broadcast window: token paused meanwhile -> mined revert -> FAILED (not REJECTED)", async () => {
    const p = new Processor({
      journal, chain, signer, publisher: pub, tokens: { TCE, TCD: TCE, TIF: TCE }, receiptTimeoutMs: 1000, fault: "pause-before-broadcast", log: silent,
      crash: (code) => { throw new Crash(code); }, pause: async () => { chain.paused = true; },
    });
    expect(await p.handle(cmd())).toMatchObject({ status: "FAILED", reason: "REVERTED" });
    expect(chain.bal(ALICE)).toBe(100_000_000n);
  });

  it("pause-before-broadcast window: Besu unreachable meanwhile -> UNKNOWN, then RECONCILE -> CONFIRMED", async () => {
    const p = new Processor({
      journal, chain, signer, publisher: pub, tokens: { TCE, TCD: TCE, TIF: TCE }, receiptTimeoutMs: 1000, fault: "pause-before-broadcast", log: silent,
      crash: (code) => { throw new Crash(code); }, pause: async () => { chain.down = true; },
    });
    expect(await p.handle(cmd())).toMatchObject({ status: "UNKNOWN", reason: "RPC_UNAVAILABLE" });
    chain.down = false;
    expect(await make().handle(cmd({ type: "RECONCILE" }))).toMatchObject({ status: "CONFIRMED" });
    expect(signer.calls).toBe(1);
    expect(chain.bal(ALICE)).toBe(90_000_000n);
  });

  it("receipt timeout -> UNKNOWN with RECEIPT_TIMEOUT", async () => {
    chain.autoMine = false;
    expect(await make().handle(cmd())).toMatchObject({ status: "UNKNOWN", reason: "RECEIPT_TIMEOUT" });
  });
});
