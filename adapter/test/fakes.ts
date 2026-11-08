// In-memory fakes modelling the real systems closely enough for the 002 scenarios:
// - FakeChain keeps balances, used references, a mempool and mined txs; can be "down".
// - FakeSigner produces deterministic raw txs (keccak of the payload) so hashes are stable.
import { encodeAbiParameters, keccak256, stringToHex, type Address, type Hex } from "viem";
import type { Chain, Journal, Publisher, Receipt, Signer, SimulationOutcome, TxAttempt } from "../src/ports.ts";
import type { OperationResult, ResultStatus } from "../src/messages.ts";

const k = (from: Address, ref: Hex) => `${from.toLowerCase()}|${ref}`;

type Pending = { raw: Hex; from: Address; to: Address; amount: bigint; ref: Hex; nonce: bigint };

export class FakeChain implements Chain {
  balances = new Map<string, bigint>();
  usedRefs = new Map<string, { txHash: Hex; blockNumber: bigint; to: Address; amount: bigint }>(); // key: from|ref
  mined = new Map<Hex, Receipt>();
  mempool = new Map<Hex, Pending>();
  nonces = new Map<string, bigint>();
  decoded = new Map<Hex, Pending>(); // raw -> decoded payload (filled by FakeSigner)
  block = 100n;
  down = false;
  paused = false;
  autoMine = true;
  sendCount = 0;
  revertOnMine = false;

  private check() {
    if (this.down) throw new Error("ECONNREFUSED besu:8545");
  }
  bal(a: Address) {
    return this.balances.get(a.toLowerCase()) ?? 0n;
  }
  async simulateTransfer(p: { token: Address; from: Address; to: Address; amount: bigint; ref: Hex }): Promise<SimulationOutcome> {
    this.check();
    if (this.paused) return { ok: false, kind: "revert", errorName: "EnforcedPause" };
    if (this.usedRefs.has(k(p.from, p.ref))) return { ok: false, kind: "revert", errorName: "ReferenceAlreadyUsed" };
    if (this.bal(p.from) < p.amount) return { ok: false, kind: "revert", errorName: "ERC20InsufficientBalance" };
    return { ok: true, gas: 60_000n };
  }
  async pendingNonce(from: Address) {
    this.check();
    return this.nonces.get(from.toLowerCase()) ?? 0n;
  }
  async sendRawTransaction(raw: Hex) {
    this.check();
    this.sendCount++;
    const hash = keccak256(raw);
    if (this.mined.has(hash) || this.mempool.has(hash)) return; // already known: idempotent
    const p = this.decoded.get(raw);
    if (!p) throw new Error("unknown raw tx");
    if (p.nonce < (this.nonces.get(p.from.toLowerCase()) ?? 0n)) return; // nonce too low (same tx re-sent)
    this.mempool.set(hash, p);
    this.nonces.set(p.from.toLowerCase(), p.nonce + 1n);
    if (this.autoMine) this.mine();
  }
  mine() {
    for (const [hash, p] of this.mempool) {
      this.block++;
      const ok = !this.revertOnMine && !this.paused && !this.usedRefs.has(k(p.from, p.ref)) && this.bal(p.from) >= p.amount;
      if (ok) {
        this.balances.set(p.from.toLowerCase(), this.bal(p.from) - p.amount);
        this.balances.set(p.to.toLowerCase(), this.bal(p.to) + p.amount);
        this.usedRefs.set(k(p.from, p.ref), { txHash: hash, blockNumber: this.block, to: p.to, amount: p.amount });
      }
      this.mined.set(hash, { status: ok ? "success" : "reverted", blockNumber: this.block, transactionHash: hash });
      this.mempool.delete(hash);
    }
  }
  async waitForReceipt(hash: Hex, _t: number) {
    this.check();
    if (this.autoMine) this.mine(); // time passes while waiting: pending txs get mined
    return this.mined.get(hash) ?? null;
  }
  async getReceipt(hash: Hex) {
    this.check();
    return this.mined.get(hash) ?? null;
  }
  async findReferenceLog(_token: Address, from: Address, ref: Hex) {
    this.check();
    return this.usedRefs.get(k(from, ref)) ?? null;
  }
  encodeTransfer(to: Address, amount: bigint, ref: Hex): Hex {
    return encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes32" }], [to, amount, ref]);
  }
}

export class FakeSigner implements Signer {
  calls = 0;
  constructor(private readonly chain: FakeChain) {}
  async signTransaction(tx: { from: Address; to: Address; data: Hex; nonce: bigint; gas: bigint; gasPrice: bigint }): Promise<Hex> {
    this.calls++;
    const raw = stringToHex(`${tx.from}|${tx.to}|${tx.data}|${tx.nonce}`);
    // decode our own encoding back for the fake chain
    const body = tx.data.slice(2);
    const to = ("0x" + body.slice(24, 64)) as Address;
    const amount = BigInt("0x" + body.slice(64, 128));
    const ref = ("0x" + body.slice(128, 192)) as Hex;
    this.chain.decoded.set(raw, { raw, from: tx.from, to, amount, ref, nonce: tx.nonce });
    return raw;
  }
}

export class MemJournal implements Journal {
  rows = new Map<string, TxAttempt>();
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }
  async maxNonce(from: Address) {
    let m: bigint | null = null;
    for (const r of this.rows.values()) if (r.from.toLowerCase() === from.toLowerCase() && (m === null || r.nonce > m)) m = r.nonce;
    return m;
  }
  async insertSigned(a: Omit<TxAttempt, "state" | "finalStatus" | "blockNumber">) {
    if (this.rows.has(a.operationId)) throw new Error("duplicate operation_id");
    for (const r of this.rows.values()) if (r.from === a.from && r.nonce === a.nonce) throw new Error("duplicate (from, nonce)");
    this.rows.set(a.operationId, { ...a, state: "SIGNED", finalStatus: null, blockNumber: null });
  }
  async markBroadcast(id: string) {
    const r = this.rows.get(id)!;
    if (r.state === "SIGNED") r.state = "BROADCAST";
  }
  async markFinal(id: string, s: ResultStatus, b: bigint | null) {
    const r = this.rows.get(id)!;
    r.state = "FINAL";
    r.finalStatus = s;
    r.blockNumber = b;
  }
}

export class MemPublisher implements Publisher {
  out: OperationResult[] = [];
  async publish(r: OperationResult) {
    this.out.push(r);
  }
  statuses(id: string) {
    return this.out.filter((r) => r.operationId === id).map((r) => r.status);
  }
}

export const silent = { info() {}, warn() {}, error() {} };
export class Crash extends Error {
  constructor(public code: number) {
    super(`crash ${code}`);
  }
}
