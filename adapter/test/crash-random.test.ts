// SC-002 at unit level: random crashes at every checkpoint between signature and offset commit,
// with Kafka-like redelivery until the message is committed. Invariant: exactly one effect per operation.
import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { Processor } from "../src/processor.ts";
import { referenceOf } from "../src/messages.ts";
import { Crash, FakeChain, FakeSigner, MemJournal, MemPublisher, silent } from "./fakes.ts";

const ALICE = "0x00000000000000000000000000000000000a11ce" as Address;
const BOB = "0x0000000000000000000000000000000000000b0b" as Address;
const TCE = "0x00000000000000000000000000000000000000ce" as Address;

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("SC-002 crash-random (unit)", () => {
  it("200 operations, random crashes at every checkpoint: one debit and one event per operation", async () => {
    const chain = new FakeChain();
    chain.balances.set(ALICE.toLowerCase(), 1_000_000_000n);
    const signer = new FakeSigner(chain), journal = new MemJournal(), pub = new MemPublisher();
    const rnd = mulberry32(42);
    const p = new Processor({ journal, chain, signer, publisher: pub, tokens: { TCE, TCD: TCE, TIF: TCE }, receiptTimeoutMs: 1000,
      fault: "crash-random", faultProbability: 0.25, random: rnd, log: silent, crash: (c) => { throw new Crash(c); } });
    let crashes = 0;
    const ops: string[] = [];
    for (let i = 0; i < 200; i++) {
      const id = `0190f5a2-7c3e-7b1a-9f00-${String(i).padStart(12, "0")}`;
      ops.push(id);
      const msg = { schemaVersion: 1, type: "TRANSFER", operationId: id, reference: referenceOf(id), token: "TCE",
        from: ALICE, to: BOB, amount: "1000000", issuedAt: "2026-11-08T12:00:00Z" };
      for (;;) { // redelivery loop: until the offset would be committed
        try { await p.handle(msg); p.checkpoint("after-result", id); break; }
        catch (e) { if (e instanceof Crash) { crashes++; continue; } throw e; }
      }
    }
    expect(crashes).toBeGreaterThanOrEqual(100);
    expect(chain.bal(ALICE)).toBe(1_000_000_000n - 200n * 1_000_000n);
    expect(chain.usedRefs.size).toBe(200);
    for (const id of ops) {
      const finals = pub.out.filter((r) => r.operationId === id && r.status !== "BROADCAST");
      expect(finals.length).toBeGreaterThan(0);
      expect(new Set(finals.map((r) => r.status))).toEqual(new Set(["CONFIRMED"]));
      expect(new Set(pub.out.filter((r) => r.operationId === id && r.txHash).map((r) => r.txHash)).size).toBe(1);
    }
    console.log(`crash-random: ${crashes} crashes over 200 operations`);
  });

  it("pause-after-broadcast: Besu accepted the tx then becomes unreachable -> UNKNOWN, one effect after RECONCILE", async () => {
    const chain = new FakeChain();
    chain.balances.set(ALICE.toLowerCase(), 100_000_000n);
    const signer = new FakeSigner(chain), journal = new MemJournal(), pub = new MemPublisher();
    const id = "0190f5a2-7c3e-7b1a-9f00-00000000aaaa";
    const msg = { schemaVersion: 1, type: "TRANSFER", operationId: id, reference: referenceOf(id), token: "TCE",
      from: ALICE, to: BOB, amount: "10000000", issuedAt: "2026-11-08T12:00:00Z" };
    const mk = (fault: "pause-after-broadcast" | "none") => new Processor({ journal, chain, signer, publisher: pub,
      tokens: { TCE, TCD: TCE, TIF: TCE }, receiptTimeoutMs: 1000, fault, log: silent, crash: (c) => { throw new Crash(c); },
      pause: async () => { chain.down = true; } });
    expect(await mk("pause-after-broadcast").handle(msg)).toMatchObject({ status: "UNKNOWN", reason: "RPC_UNAVAILABLE" });
    expect(chain.bal(ALICE)).toBe(90_000_000n); // the tx WAS executed although the adapter does not know
    chain.down = false;
    expect(await mk("none").handle({ ...msg, type: "RECONCILE" })).toMatchObject({ status: "CONFIRMED" });
    expect(chain.bal(ALICE)).toBe(90_000_000n);
    expect(signer.calls).toBe(1);
  });
});
