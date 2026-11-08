import { isTerminal, STATUS_LABELS, statusLabel, statusTone, Status } from './status';

const ALL: Status[] = ['RECEIVED', 'PUBLISHED', 'BROADCAST', 'UNKNOWN', 'CONFIRMED', 'SETTLED', 'FAILED', 'REJECTED'];

describe('status labels', () => {
  it('has a non-empty label for every D-06 status', () => {
    for (const s of ALL) expect(STATUS_LABELS[s].length).toBeGreaterThan(3);
  });
  it('UNKNOWN is a verification wording, never a failure', () => {
    expect(statusLabel('UNKNOWN')).toBe('Résultat en cours de vérification');
    expect(statusLabel('UNKNOWN').toLowerCase()).not.toContain('échec');
    expect(statusTone('UNKNOWN')).toBe('checking');
    expect(isTerminal('UNKNOWN')).toBe(false);
  });
  it('FAILED and REJECTED wording', () => {
    expect(statusLabel('FAILED')).toBe('Échec confirmé');
    expect(statusLabel('REJECTED')).toBe('Rejetée avant diffusion');
  });
  it('terminal statuses are SETTLED, FAILED, REJECTED only', () => {
    expect(ALL.filter(isTerminal).sort()).toEqual(['FAILED', 'REJECTED', 'SETTLED']);
  });
  it('unknown future status does not throw', () => {
    expect(statusLabel('WHATEVER')).toContain('WHATEVER');
  });
});
