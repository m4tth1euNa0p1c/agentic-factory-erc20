// Besu access through viem (read + raw broadcast only; no key material here).
import {
  BaseError, ContractFunctionRevertedError, WaitForTransactionReceiptTimeoutError, TransactionReceiptNotFoundError,
  createPublicClient, defineChain, encodeFunctionData, http, type Address, type Hex, type PublicClient,
} from "viem";
import { telaTokenAbi } from "./abi.ts";
import type { Chain, Receipt, SimulationOutcome } from "./ports.ts";

const transferEvent = telaTokenAbi.find((x) => x.type === "event" && x.name === "TransferWithReference")!;

export class ViemChain implements Chain {
  private readonly client: PublicClient;
  constructor(rpcUrl: string, chainId: number, timeoutMs = 5000) {
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

  async sendRawTransaction(raw: Hex): Promise<void> {
    try {
      await this.client.request({ method: "eth_sendRawTransaction", params: [raw] });
    } catch (e) {
      // Re-broadcast of the very same signed tx (D-04): Besu answers "known transaction"/"nonce too low".
      if (/known|already|nonce too low/i.test(String((e as Error)?.message ?? e))) return;
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

  async findReferenceLog(token: Address, from: Address, ref: Hex) {
    const logs = await this.client.getLogs({ address: token, event: transferEvent, args: { ref, from }, fromBlock: 0n, toBlock: "latest" });
    const l = logs[0];
    if (!l || !l.transactionHash || l.blockNumber === null || !l.args.to || l.args.amount === undefined) return null;
    return { txHash: l.transactionHash, blockNumber: l.blockNumber, to: l.args.to, amount: l.args.amount };
  }

  encodeTransfer(to: Address, amount: bigint, ref: Hex): Hex {
    return encodeFunctionData({ abi: telaTokenAbi, functionName: "transferWithReference", args: [to, amount, ref] });
  }
}
