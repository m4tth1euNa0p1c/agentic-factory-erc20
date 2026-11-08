// Besu access through viem (read + raw broadcast only; no key material here).
import {
  BaseError, ContractFunctionRevertedError, WaitForTransactionReceiptTimeoutError, TransactionReceiptNotFoundError,
  createPublicClient, defineChain, encodeFunctionData, http, type Address, type Hex, type PublicClient,
} from "viem";
import { telaTokenAbi } from "./abi.ts";
import type { Chain, Receipt, SendOutcome, SimulationOutcome } from "./ports.ts";

const transferEvent = telaTokenAbi.find((x) => x.type === "event" && x.name === "TransferWithReference")!;

export class ViemChain implements Chain {
  private readonly client: PublicClient;
  private readonly startBlock: bigint;
  private readonly logsRange: bigint;
  constructor(rpcUrl: string, chainId: number, opts: { timeoutMs?: number; startBlock?: bigint; logsRange?: bigint } = {}) {
    const timeoutMs = opts.timeoutMs ?? 5000;
    this.startBlock = opts.startBlock ?? 0n;
    this.logsRange = opts.logsRange ?? 4000n; // below Besu's default --rpc-max-logs-range (review F5)
    const chain = defineChain({ id: chainId, name: "tela", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
    this.client = createPublicClient({ chain, transport: http(rpcUrl, { timeout: timeoutMs, retryCount: 0 }), pollingInterval: 500 });
  }

  async simulateTransfer(p: { token: Address; from: Address; to: Address; amount: bigint; ref: Hex }): Promise<SimulationOutcome> {
    const req = { address: p.token, abi: telaTokenAbi, functionName: "transferWithReference", args: [p.to, p.amount, p.ref], account: p.from } as const;
    try {
      await this.client.simulateContract(req);
      const gas = await this.client.estimateContractGas(req);
      return { ok: true, gas };
    } catch (e) {
      const revert = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
      if (revert instanceof ContractFunctionRevertedError) {
        return { ok: false, kind: "revert", errorName: revert.data?.errorName ?? (revert.reason ? "Error" : "UnknownRevert") };
      }
      throw e; // transport / RPC failure: not deterministic
    }
  }

  async pendingNonce(from: Address): Promise<bigint> {
    return BigInt(await this.client.getTransactionCount({ address: from, blockTag: "pending" }));
  }

  async latestNonce(from: Address): Promise<bigint> {
    return BigInt(await this.client.getTransactionCount({ address: from, blockTag: "latest" }));
  }

  async sendRawTransaction(raw: Hex): Promise<SendOutcome> {
    try {
      await this.client.request({ method: "eth_sendRawTransaction", params: [raw] });
      return "sent";
    } catch (e) {
      // Classify on the node's own error text only (not the formatted message: "unknown" contains "known", F1).
      const details = String((e as BaseError)?.details ?? (e as { cause?: { message?: string } })?.cause?.message ?? "");
      if (/(^|[^a-z])(already known|known transaction|transaction already imported)/i.test(details)) return "known";
      if (/(^|[^a-z])nonce too low/i.test(details)) return "nonce-too-low";
      throw e;
    }
  }

  async waitForReceipt(hash: Hex, timeoutMs: number): Promise<Receipt | null> {
    try {
      const r = await this.client.waitForTransactionReceipt({ hash, timeout: timeoutMs, pollingInterval: 500, retryCount: 0 });
      return { status: r.status, blockNumber: r.blockNumber, transactionHash: r.transactionHash };
    } catch (e) {
      if (e instanceof WaitForTransactionReceiptTimeoutError) return null;
      throw e;
    }
  }

  async getReceipt(hash: Hex): Promise<Receipt | null> {
    try {
      const r = await this.client.getTransactionReceipt({ hash });
      return { status: r.status, blockNumber: r.blockNumber, transactionHash: r.transactionHash };
    } catch (e) {
      if (e instanceof TransactionReceiptNotFoundError) return null;
      throw e;
    }
  }

  /** Paginated from the deployment block in ranges accepted by Besu (review F5). Topics: ref + from (indexed). */
  async findReferenceLog(token: Address, from: Address, ref: Hex) {
    const head = await this.client.getBlockNumber();
    for (let lo = this.startBlock; lo <= head; lo += this.logsRange) {
      const hi = lo + this.logsRange - 1n < head ? lo + this.logsRange - 1n : head;
      const logs = await this.client.getLogs({ address: token, event: transferEvent, args: { ref, from }, fromBlock: lo, toBlock: hi });
      const l = logs[0];
      if (l && l.transactionHash && l.blockNumber !== null && l.args.to && l.args.amount !== undefined) {
        return { txHash: l.transactionHash, blockNumber: l.blockNumber, to: l.args.to, amount: l.args.amount };
      }
    }
    return null;
  }

  encodeTransfer(to: Address, amount: bigint, ref: Hex): Hex {
    return encodeFunctionData({ abi: telaTokenAbi, functionName: "transferWithReference", args: [to, amount, ref] });
  }
}
