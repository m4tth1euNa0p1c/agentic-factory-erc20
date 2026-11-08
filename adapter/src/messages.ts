// Mirrors schemas/kafka/*.v1.json (Constitution §III). Unknown fields are rejected (.strict()).
import { z } from "zod";
import { keccak256, stringToBytes, type Hex, type Address } from "viem";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((s) => s as Address);
const hex32 = z.string().regex(/^0x[0-9a-f]{64}$/).transform((s) => s as Hex);

export const Token = z.enum(["TCE", "TCD", "TIF"]);
export type Token = z.infer<typeof Token>;

export const OperationCommand = z
  .object({
    schemaVersion: z.literal(1),
    type: z.enum(["TRANSFER", "RECONCILE"]),
    operationId: z.uuid(),
    reference: hex32,
    token: Token,
    from: address,
    to: address,
    amount: z.string().regex(/^[1-9][0-9]{0,77}$/),
    issuedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type OperationCommand = z.infer<typeof OperationCommand>;

export const ResultStatus = z.enum(["BROADCAST", "CONFIRMED", "FAILED", "REJECTED", "UNKNOWN"]);
export type ResultStatus = z.infer<typeof ResultStatus>;

export type OperationResult = {
  schemaVersion: 1;
  operationId: string;
  status: ResultStatus;
  txHash?: Hex;
  blockNumber?: string;
  reason?: string;
  observedAt: string;
};

/** D-02: on-chain reference = keccak256(utf8(operationId)). */
export const referenceOf = (operationId: string): Hex => keccak256(stringToBytes(operationId));

export const result = (
  operationId: string,
  status: ResultStatus,
  extra: Partial<Pick<OperationResult, "txHash" | "blockNumber" | "reason">> = {},
  now: () => Date = () => new Date(),
): OperationResult => ({ schemaVersion: 1, operationId, status, ...extra, observedAt: now().toISOString() });
