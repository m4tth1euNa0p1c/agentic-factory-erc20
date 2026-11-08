import { z } from "zod";
import type { Address } from "viem";

const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((s) => s as Address);

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TELA_CHAIN_ID: z.coerce.number().int().positive(),
  BESU_RPC_URL: z.url(),
  WEB3SIGNER_URL: z.url(),
  ADAPTER_DATABASE_URL: z.string().startsWith("postgres"),
  KAFKA_BROKERS: z.string().min(1),
  KAFKA_GROUP_ID: z.string().default("tela-adapter"),
  TOPIC_COMMANDS: z.string().default("tela.operations.commands.v1"),
  TOPIC_RESULTS: z.string().default("tela.operations.results.v1"),
  TOPIC_DLQ: z.string().default("tela.operations.dlq.v1"),
  TCE_ADDRESS: addr,
  TCD_ADDRESS: addr,
  TIF_ADDRESS: addr,
  RECEIPT_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  ADAPTER_FAULT: z.enum(["none", "crash-after-broadcast", "crash-before-broadcast", "pause-before-broadcast"]).default("none"),
  ADAPTER_FAULT_PAUSE_MS: z.coerce.number().int().min(0).max(120_000).default(10_000),
  HEALTH_PORT: z.coerce.number().int().default(8081),
});
export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const c = Env.parse(env);
  if (c.NODE_ENV === "production" && c.ADAPTER_FAULT !== "none") {
    throw new Error("ADAPTER_FAULT is forbidden in production");
  }
  return c;
}
