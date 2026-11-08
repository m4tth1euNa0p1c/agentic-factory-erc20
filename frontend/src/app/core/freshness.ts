import type { components } from '../api/schema';

export type IndexerStatus = components['schemas']['IndexerStatus'];

export const LATE_THRESHOLD_SECONDS = 10;

export type FreshnessLevel = 'ok' | 'late' | 'regressed' | 'unavailable' | 'unknown';

export interface Freshness {
  level: FreshnessLevel;
  ageSeconds: number | null;
  indexedBlock: string | null;
  banner: string | null;
}

export const BANNER_LATE = 'Indexation en retard';
export const BANNER_REGRESSED = 'Modèle de lecture en régression : les soldes affichés peuvent être périmés';
export const BANNER_UNAVAILABLE = 'Modèle de lecture indisponible : les soldes ne peuvent pas être affichés';

/** `unavailable` = HTTP 503 / API injoignable (aucune donnée périmée présentée comme actuelle). */
export function evaluateFreshness(
  status: IndexerStatus | null,
  unavailable: boolean,
  nowMs: number,
): Freshness {
  if (unavailable) {
    return { level: 'unavailable', ageSeconds: null, indexedBlock: null, banner: BANNER_UNAVAILABLE };
  }
  if (status === null) {
    return { level: 'unknown', ageSeconds: null, indexedBlock: null, banner: null };
  }
  const ts = status.indexedBlockTimestamp != null ? Number(status.indexedBlockTimestamp) : NaN;
  const age = Number.isFinite(ts) ? Math.max(0, Math.floor(nowMs / 1000 - ts)) : null;
  const block = status.indexedBlock ?? null;
  if (status.regressed) return { level: 'regressed', ageSeconds: age, indexedBlock: block, banner: BANNER_REGRESSED };
  if (age === null) return { level: 'unknown', ageSeconds: null, indexedBlock: block, banner: null };
  if (age > LATE_THRESHOLD_SECONDS) return { level: 'late', ageSeconds: age, indexedBlock: block, banner: BANNER_LATE };
  return { level: 'ok', ageSeconds: age, indexedBlock: block, banner: null };
}
