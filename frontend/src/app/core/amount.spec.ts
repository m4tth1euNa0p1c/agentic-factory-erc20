import { formatAmount, parseAmount } from './amount';

describe('parseAmount', () => {
  const ok = (s: string) => {
    const r = parseAmount(s);
    return r.ok ? r.value : r.error;
  };
  it('converts whole and decimal values', () => {
    expect(ok('1')).toBe('1000000');
    expect(ok('12.5')).toBe('12500000');
    expect(ok('12,5')).toBe('12500000');
    expect(ok('0.000001')).toBe('1');
    expect(ok('0.1')).toBe('100000');
  });
  it('rejects zero', () => {
    expect(ok('0')).toBe('ZERO');
    expect(ok('0.000000')).toBe('ZERO');
  });
  it('accepts six decimals and rejects more', () => {
    expect(ok('1.123456')).toBe('1123456');
    expect(ok('1.1234567')).toBe('TOO_MANY_DECIMALS');
  });
  it('strips leading zeros', () => {
    expect(ok('000123')).toBe('123000000');
    expect(ok('0000.000010')).toBe('10');
  });
  it('is exact on huge values (no float)', () => {
    expect(ok('9007199254740993')).toBe('9007199254740993000000');
    expect(ok('9'.repeat(72))).toBe('9'.repeat(72) + '000000');
    expect(ok('9'.repeat(73))).toBe('TOO_LARGE');
  });
  it('rejects malformed input', () => {
    expect(ok('')).toBe('EMPTY');
    expect(ok('  ')).toBe('EMPTY');
    expect(ok('abc')).toBe('FORMAT');
    expect(ok('-1')).toBe('FORMAT');
    expect(ok('1e3')).toBe('FORMAT');
    expect(ok('.')).toBe('FORMAT');
    expect(ok('1.2.3')).toBe('FORMAT');
  });
  it('result matches the API pattern', () => {
    for (const s of ['1', '0.000001', '123456789.123456']) {
      expect(ok(s)).toMatch(/^[1-9][0-9]{0,77}$/);
    }
  });
});

describe('formatAmount', () => {
  it('formats minimal units', () => {
    expect(formatAmount('0')).toBe('0,00');
    expect(formatAmount('1')).toBe('0,000001');
    expect(formatAmount('1000000')).toBe('1,00');
    expect(formatAmount('12500000')).toBe('12,50');
    expect(formatAmount('1234567890000')).toBe('1 234 567,89');
  });
  it('handles missing values', () => {
    expect(formatAmount(null)).toBe('—');
  });
});
