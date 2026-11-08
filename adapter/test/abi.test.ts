// Contract-first guard (Constitution §III): the adapter's embedded ABI must match the compiled contract ABI.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { toFunctionSignature, toEventSignature, type AbiFunction, type AbiEvent } from "viem";
import { telaTokenAbi } from "../src/abi.ts";

const path = new URL("../../contracts/abi/TelaToken.json", import.meta.url);

describe.skipIf(!existsSync(path))("ABI parity with contracts/abi/TelaToken.json", () => {
  const compiled = JSON.parse(readFileSync(path, "utf8")) as Array<{ type: string; name?: string }>;
  it.each(telaTokenAbi.filter((x) => x.type === "function") as AbiFunction[])("function $name", (f) => {
    const sigs = (compiled.filter((x) => x.type === "function") as AbiFunction[]).map(toFunctionSignature);
    expect(sigs).toContain(toFunctionSignature(f));
  });
  it.each(telaTokenAbi.filter((x) => x.type === "event") as AbiEvent[])("event $name", (ev) => {
    const sigs = (compiled.filter((x) => x.type === "event") as AbiEvent[]).map(toEventSignature);
    expect(sigs).toContain(toEventSignature(ev));
  });
  it.each(telaTokenAbi.filter((x) => x.type === "error").map((x) => (x as { name: string }).name))("error %s", (name) => {
    expect(compiled.some((x) => x.type === "error" && x.name === name)).toBe(true);
  });
});
