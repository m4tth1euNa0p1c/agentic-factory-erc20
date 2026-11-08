import { createConfig } from "ponder";
import type { Address } from "viem";
import { TelaTokenAbi } from "./abis/TelaTokenAbi";

const req = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

export const TOKENS: Record<string, Address> = {
  TCE: req("TCE_ADDRESS") as Address,
  TCD: req("TCD_ADDRESS") as Address,
  TIF: req("TIF_ADDRESS") as Address,
};
const startBlock = Number(process.env.TOKENS_START_BLOCK ?? 0);

export default createConfig({
  database: { kind: "postgres", connectionString: req("DATABASE_URL"), poolConfig: { max: 10 } },
  chains: {
    tela: {
      id: Number(req("TELA_CHAIN_ID")),
      rpc: req("PONDER_RPC_URL"),
      pollingInterval: 1_000,
      // QBFT has immediate finality; keep RPC cache off so a sandbox reset never serves stale data.
      cacheRpcRequests: false,
      // QBFT finality is immediate. The default (180 s = 90 blocks at 2 s) made Ponder roll the read model back
      // up to 90 blocks on every restart (crash recovery), briefly exposing a stale balance next to already
      // settled operations (found by the ponder-lag invariant sampler, 2026-11-08).
      reorgWindow: 0,
    },
  },
  contracts: {
    TelaToken: {
      chain: "tela",
      abi: TelaTokenAbi,
      address: Object.values(TOKENS),
      startBlock,
    },
  },
  blocks: {
    ChainHead: { chain: "tela", startBlock: "latest", interval: 1 },
  },
});
