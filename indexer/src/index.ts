import { ponder } from "ponder:registry";
import { accountBalance, chainHead, operationExecution } from "ponder:schema";
import { zeroAddress, type Address } from "viem";
import { TOKENS } from "../ponder.config";

const SYMBOL = new Map(Object.entries(TOKENS).map(([sym, addr]) => [addr.toLowerCase(), sym]));
const symbolOf = (a: Address) => {
  const s = SYMBOL.get(a.toLowerCase());
  if (!s) throw new Error(`unknown token ${a}`);
  return s;
};

ponder.on("TelaToken:Transfer", async ({ event, context }) => {
  const token = symbolOf(event.log.address);
  const { from, to, value } = event.args;
  const block = event.block.number;
  if (from !== zeroAddress) {
    const account = from.toLowerCase() as Address;
    await context.db
      .insert(accountBalance)
      .values({ id: `${token}:${account}`, token, account, balance: -value, lastBlock: block })
      .onConflictDoUpdate((row) => ({ balance: row.balance - value, lastBlock: block }));
  }
  if (to !== zeroAddress) {
    const account = to.toLowerCase() as Address;
    await context.db
      .insert(accountBalance)
      .values({ id: `${token}:${account}`, token, account, balance: value, lastBlock: block })
      .onConflictDoUpdate((row) => ({ balance: row.balance + value, lastBlock: block }));
  }
});

ponder.on("TelaToken:TransferWithReference", async ({ event, context }) => {
  const token = symbolOf(event.log.address);
  const from = event.args.from.toLowerCase() as Address;
  await context.db
    .insert(operationExecution)
    .values({
      id: `${token}:${from}:${event.args.ref}`,
      ref: event.args.ref,
      token,
      from,
      to: event.args.to.toLowerCase() as Address,
      amount: event.args.amount,
      txHash: event.transaction.hash,
      blockNumber: event.block.number,
      logIndex: event.log.logIndex,
    })
    .onConflictDoNothing();
});

ponder.on("ChainHead:block", async ({ event, context }) => {
  await context.db
    .insert(chainHead)
    .values({ id: "head", blockNumber: event.block.number, timestamp: event.block.timestamp })
    .onConflictDoUpdate({ blockNumber: event.block.number, timestamp: event.block.timestamp });
});
