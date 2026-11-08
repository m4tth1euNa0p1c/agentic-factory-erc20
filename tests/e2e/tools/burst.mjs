// Fire N transfer requests concurrently against the TELA API and print one JSON summary line.
// Usage: node tests/e2e/tools/burst.mjs <api> <from> <to> <amount> <n> <keyPrefix>
const [api, from, to, amount, n, prefix] = process.argv.slice(2);
const N = Number(n);
const t0 = Date.now();
const results = await Promise.all(
  Array.from({ length: N }, async (_, i) => {
    try {
      const r = await fetch(`${api}/transfers`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": `${prefix}-${i}-${crypto.randomUUID()}` },
        body: JSON.stringify({ from, to, token: "TCE", amount }),
      });
      const body = await r.json().catch(() => ({}));
      return { code: r.status, id: body.operationId ?? null, err: body.code ?? null };
    } catch (e) {
      return { code: 0, id: null, err: String(e?.cause?.code ?? e) };
    }
  }),
);
const by = (c) => results.filter((r) => r.code === c).length;
console.log(JSON.stringify({
  requests: N, ms: Date.now() - t0, accepted: by(202), refused: by(409), other: N - by(202) - by(409),
  otherErrors: [...new Set(results.filter((r) => r.code !== 202 && r.code !== 409).map((r) => `${r.code}:${r.err}`))].slice(0, 5),
  ids: results.filter((r) => r.code === 202).map((r) => r.id),
}));
