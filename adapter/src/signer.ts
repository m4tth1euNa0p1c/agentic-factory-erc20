// Web3Signer (eth1 mode) client: only eth_signTransaction is used, so the adapter controls broadcast (D-04).
import { toHex, type Address, type Hex } from "viem";
import type { Signer } from "./ports.ts";

export class Web3Signer implements Signer {
  private readonly url: string;
  private readonly timeoutMs: number;
  constructor(url: string, timeoutMs = 5000) {
    this.url = url;
    this.timeoutMs = timeoutMs;
  }

  async signTransaction(tx: { from: Address; to: Address; data: Hex; nonce: bigint; gas: bigint; gasPrice: bigint }): Promise<Hex> {
    const body = {
      jsonrpc: "2.0", id: 1, method: "eth_signTransaction",
      params: [{ from: tx.from, to: tx.to, data: tx.data, nonce: toHex(tx.nonce), gas: toHex(tx.gas), gasPrice: toHex(tx.gasPrice), value: "0x0" }],
    };
    const res = await fetch(this.url, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`web3signer HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string; error?: { code: number; message: string } };
    if (json.error || typeof json.result !== "string" || !/^0x[0-9a-fA-F]+$/.test(json.result)) {
      throw new Error(`web3signer error: ${json.error?.code ?? "?"} ${json.error?.message ?? "invalid result"}`);
    }
    return json.result as Hex;
  }
}
