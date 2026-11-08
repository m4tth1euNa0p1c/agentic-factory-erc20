// Adapter entrypoint: Kafka consumer (manual commit) -> Processor -> results producer.
// Offsets are committed only after the result is published; a crash before that causes redelivery,
// which the journal + on-chain reference make harmless (spec 002 US2).
import { createServer } from "node:http";
import { KafkaJS } from "@confluentinc/kafka-javascript";
import { loadConfig } from "./config.ts";
import { ViemChain } from "./chain.ts";
import { Web3Signer } from "./signer.ts";
import { PgJournal } from "./journal.ts";
import { Processor, isDlq } from "./processor.ts";
import { RetryableError } from "./ports.ts";

const log = {
  info: (msg: string, f: Record<string, unknown> = {}) => console.log(JSON.stringify({ level: "info", t: new Date().toISOString(), msg, ...f })),
  warn: (msg: string, f: Record<string, unknown> = {}) => console.log(JSON.stringify({ level: "warn", t: new Date().toISOString(), msg, ...f })),
  error: (msg: string, f: Record<string, unknown> = {}) => console.error(JSON.stringify({ level: "error", t: new Date().toISOString(), msg, ...f })),
};

const cfg = loadConfig();
const journal = new PgJournal(cfg.ADAPTER_DATABASE_URL);
await journal.migrate();

const kafka = new KafkaJS.Kafka({ kafkaJS: { clientId: "tela-adapter", brokers: cfg.KAFKA_BROKERS.split(",") } });
const producer = kafka.producer({ kafkaJS: { idempotent: true, acks: -1 } });
const consumer = kafka.consumer({
  kafkaJS: { groupId: cfg.KAFKA_GROUP_ID, autoCommit: false, fromBeginning: true },
  "max.poll.interval.ms": 900_000,
});
await producer.connect();
await consumer.connect();
await consumer.subscribe({ topics: [cfg.TOPIC_COMMANDS] });

const processor = new Processor({
  journal,
  chain: new ViemChain(cfg.BESU_RPC_URL, cfg.TELA_CHAIN_ID),
  signer: new Web3Signer(cfg.WEB3SIGNER_URL),
  publisher: {
    publish: async (r) => {
      await producer.send({ topic: cfg.TOPIC_RESULTS, messages: [{ key: r.operationId, value: JSON.stringify(r) }] });
    },
  },
  tokens: { TCE: cfg.TCE_ADDRESS, TCD: cfg.TCD_ADDRESS, TIF: cfg.TIF_ADDRESS },
  receiptTimeoutMs: cfg.RECEIPT_TIMEOUT_MS,
  fault: cfg.ADAPTER_FAULT,
  crash: (code) => process.exit(code),
  log,
});

let ready = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    let value: unknown;
    try {
      value = JSON.parse(message.value?.toString("utf8") ?? "null");
    } catch {
      value = null;
    }
    // Retry in place (keeps per-account ordering, i.e. nonce order) while nothing has happened on-chain.
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await processor.handle(value);
        if (isDlq(out)) {
          await producer.send({ topic: cfg.TOPIC_DLQ, messages: [{ key: message.key, value: message.value, headers: { reason: out.reason } }] });
        }
        break;
      } catch (e) {
        if (e instanceof RetryableError && attempt < 60) {
          log.warn("retryable failure, backing off", { attempt, err: e.message });
          await sleep(Math.min(30_000, 500 * 2 ** Math.min(attempt, 6)));
          continue;
        }
        throw e; // not committed -> redelivered after restart
      }
    }
    await consumer.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
  },
});
ready = true;
log.info("adapter started", { fault: cfg.ADAPTER_FAULT, chainId: cfg.TELA_CHAIN_ID });

createServer((req, res) => {
  res.writeHead(req.url === "/health" && ready ? 200 : 503).end();
}).listen(cfg.HEALTH_PORT);

const shutdown = async () => {
  log.info("shutting down");
  await consumer.disconnect().catch(() => {});
  await producer.disconnect().catch(() => {});
  await journal.close().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
