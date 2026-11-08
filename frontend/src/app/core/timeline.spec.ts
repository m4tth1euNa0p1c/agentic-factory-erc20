import { buildTimeline } from './timeline';

describe('buildTimeline', () => {
  it('renders only observed transitions (D-14: no inferred BROADCAST/CONFIRMED)', () => {
    const tl = buildTimeline([
      { from: null, to: 'RECEIVED', source: 'api', at: '2026-11-08T10:00:00Z' },
      { from: 'RECEIVED', to: 'PUBLISHED', source: 'outbox', at: '2026-11-08T10:00:01Z' },
      { from: 'PUBLISHED', to: 'SETTLED', source: 'indexer', at: '2026-11-08T10:00:05Z' },
    ]);
    expect(tl.map((e) => e.status)).toEqual(['RECEIVED', 'PUBLISHED', 'SETTLED']);
    expect(tl).toHaveLength(3);
  });
  it('sorts by timestamp, stable for equal timestamps', () => {
    const tl = buildTimeline([
      { to: 'SETTLED', source: 'indexer', at: '2026-11-08T10:00:05Z' },
      { to: 'RECEIVED', source: 'api', at: '2026-11-08T10:00:00Z' },
      { to: 'PUBLISHED', source: 'outbox', at: '2026-11-08T10:00:00Z' },
    ]);
    expect(tl.map((e) => e.status)).toEqual(['RECEIVED', 'PUBLISHED', 'SETTLED']);
  });
  it('empty input gives empty timeline', () => {
    expect(buildTimeline([])).toEqual([]);
  });
  it('labels UNKNOWN as verification, not failure', () => {
    const [e] = buildTimeline([{ to: 'UNKNOWN', source: 'adapter', at: '2026-11-08T10:00:00Z' }]);
    expect(e.label).toBe('Résultat en cours de vérification');
  });
});
