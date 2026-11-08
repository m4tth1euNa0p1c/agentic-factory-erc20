import type { components } from '../api/schema';

export type Status = components['schemas']['Status'];

/** Libellés français des statuts D-06. UNKNOWN n'est jamais présenté comme un échec. */
export const STATUS_LABELS: Record<Status, string> = {
  RECEIVED: 'Reçue',
  PUBLISHED: 'Transmise au service de diffusion',
  BROADCAST: 'Diffusée sur le réseau',
  UNKNOWN: 'Résultat en cours de vérification',
  CONFIRMED: 'Confirmée on-chain',
  SETTLED: 'Réglée',
  FAILED: 'Échec confirmé',
  REJECTED: 'Rejetée avant diffusion',
};

export type StatusTone = 'progress' | 'checking' | 'success' | 'failure';

export function statusTone(s: Status): StatusTone {
  switch (s) {
    case 'SETTLED':
      return 'success';
    case 'FAILED':
    case 'REJECTED':
      return 'failure';
    case 'UNKNOWN':
      return 'checking';
    default:
      return 'progress';
  }
}

const TERMINAL: ReadonlySet<Status> = new Set<Status>(['SETTLED', 'FAILED', 'REJECTED']);
export const isTerminal = (s: Status): boolean => TERMINAL.has(s);

export function statusLabel(s: string): string {
  return (STATUS_LABELS as Record<string, string>)[s] ?? `Statut inconnu (${s})`;
}
