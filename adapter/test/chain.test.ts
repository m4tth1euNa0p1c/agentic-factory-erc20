// Review #18 F1: broadcast error classification must not confuse "unknown" with "known".
import { describe, expect, it } from "vitest";
import { ViemChain } from "../src/chain.ts";

const chainWith = (details: string) => {
  const c = new ViemChain("http://127.0.0.1:1", 1);
  (c as unknown as { client: { request: () => Promise<never> } }).client = {
    request: async () => { const e = new Error("RPC Request failed.") as Error & { details: string }; e.details = details; throw e; },
  };
  return c;
};

describe("ViemChain.sendRawTransaction classification", () => {
  it.each([
    ["Known transaction", "known"],
    ["already known", "known"],
    ["Nonce too low", "nonce-too-low"],
  ])("%s -> %s", async (details, want) => {
    expect(await chainWith(details).sendRawTransaction("0x01")).toBe(want);
  });

  it.each(["unknown transaction type", "Unknown error", "invalid signature"])("%s -> throws", async (details) => {
    await expect(chainWith(details).sendRawTransaction("0x01")).rejects.toThrow();
  });
});
