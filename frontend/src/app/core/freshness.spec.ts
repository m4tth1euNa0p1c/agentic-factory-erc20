import { evaluateFreshness } from './freshness';

const NOW = Date.UTC(2026, 10, 8, 10, 0, 0);
const ts = (agoS: number) => String(NOW / 1000 - agoS);

describe('evaluateFreshness', () => {
  it('ok when age <= 10 s', () => {
    const f = evaluateFreshness({ indexedBlock: '42', indexedBlockTimestamp: ts(10), regressed: false }, false, NOW);
    expect(f.level).toBe('ok');
    expect(f.banner).toBeNull();
    expect(f.ageSeconds).toBe(10);
    expect(f.indexedBlock).toBe('42');
  });
  it('late when age > 10 s', () => {
    const f = evaluateFreshness({ indexedBlock: '42', indexedBlockTimestamp: ts(11), regressed: false }, false, NOW);
    expect(f.level).toBe('late');
    expect(f.banner).toBe('Indexation en retard');
  });
  it('regressed takes priority over late', () => {
    const f = evaluateFreshness({ indexedBlock: '42', indexedBlockTimestamp: ts(60), regressed: true }, false, NOW);
    expect(f.level).toBe('regressed');
    expect(f.banner).toContain('régression');
  });
  it('unavailable on 503', () => {
    const f = evaluateFreshness(null, true, NOW);
    expect(f.level).toBe('unavailable');
    expect(f.banner).toContain('indisponible');
  });
  it('no banner when timestamp absent (cannot assert lateness)', () => {
    const f = evaluateFreshness({ indexedBlock: null, indexedBlockTimestamp: null, regressed: false }, false, NOW);
    expect(f.level).toBe('unknown');
    expect(f.banner).toBeNull();
  });
  it('clock skew gives age 0, not negative', () => {
    const f = evaluateFreshness({ indexedBlockTimestamp: ts(-5), regressed: false }, false, NOW);
    expect(f.ageSeconds).toBe(0);
  });
});
