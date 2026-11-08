import type { components } from '../api/schema';
import { statusLabel } from './status';

export type Transition = components['schemas']['Transition'];

export interface TimelineEntry {
  status: string;
  label: string;
  from: string | null;
  source: string;
  at: string;
}

/**
 * Chronologie = transitions réellement observées, triées par horodatage (tri stable).
 * Aucun état intermédiaire n'est inféré (D-14 : PUBLISHED -> SETTLED est légitime).
 */
export function buildTimeline(transitions: readonly Transition[]): TimelineEntry[] {
  return transitions
    .map((t, i) => ({ t, i }))
    .sort((a, b) => Date.parse(a.t.at) - Date.parse(b.t.at) || a.i - b.i)
    .map(({ t }) => ({
      status: t.to,
      label: statusLabel(t.to),
      from: t.from ?? null,
      source: t.source,
      at: t.at,
    }));
}
