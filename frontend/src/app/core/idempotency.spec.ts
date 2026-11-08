import { IdempotencyKeys, newUuid } from './idempotency';

describe('IdempotencyKeys', () => {
  const p = { from: '0x1', to: '0x2', token: 'TCE', amount: '1' };
  it('generates a uuid', () => {
    expect(newUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('keeps the key on retry of the same submission', () => {
    const k = new IdempotencyKeys();
    expect(k.keyFor(p)).toBe(k.keyFor({ ...p }));
  });
  it('renews the key when the payload changes', () => {
    const k = new IdempotencyKeys();
    expect(k.keyFor(p)).not.toBe(k.keyFor({ ...p, amount: '2' }));
  });
  it('renews the key after settle', () => {
    const k = new IdempotencyKeys();
    const first = k.keyFor(p);
    k.settle();
    expect(k.keyFor(p)).not.toBe(first);
  });
});
