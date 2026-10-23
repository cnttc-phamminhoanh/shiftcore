// EXPORTS: getActualOTStatus, getOTDifferencePercent, ACTUAL_OT_STATUS_COLORS

// Classifies the Actual OT KPI card by the confirmed overtime-warning
// thresholds (workers W, search days D, plan OT P, actual OT A):
//   green  — A <  P + W * 0.5  * D  (within the expected OT envelope)
//   yellow — A >= P + W * 0.5  * D  and A <  P + W * 0.75 * D
//   orange — A >= P + W * 0.75 * D  and A <= P + W * 1    * D
//   red    — A >  P + W * 1    * D
// The bands are continuous: no gaps and no overlaps.
// Neutral covers missing / loading / invalid input (non-finite numbers,
// negative workers or OT values, or searchDays <= 0) so the card never shows
// a wrong warning while data is unavailable.
export type ActualOtStatus = 'green' | 'yellow' | 'orange' | 'red' | 'neutral';

export function getActualOTStatus(
  actualOT: number | null | undefined,
  planOT: number | null | undefined,
  totalWorkers: number | null | undefined,
  searchDays: number | null | undefined
): ActualOtStatus {
  if (
    !Number.isFinite(actualOT) ||
    !Number.isFinite(planOT) ||
    !Number.isFinite(totalWorkers) ||
    !Number.isFinite(searchDays) ||
    (actualOT as number) < 0 ||
    (planOT as number) < 0 ||
    (totalWorkers as number) < 0 ||
    (searchDays as number) <= 0
  ) {
    return 'neutral';
  }

  const workers = totalWorkers as number;
  const days = searchDays as number;
  const plan = planOT as number;

  const yellowThreshold = plan + workers * 0.5 * days;
  const orangeThreshold = plan + workers * 0.75 * days;
  const redThreshold = plan + workers * 1 * days;

  const actual = actualOT as number;
  if (actual > redThreshold) return 'red';
  if (actual >= orangeThreshold) return 'orange';
  if (actual >= yellowThreshold) return 'yellow'; 

  return 'green';
}

// Display-only deviation % vs plan: (actualOT − planOT) / planOT × 100.
// Returns null when planOT <= 0 or inputs are invalid, so the UI can show a
// neutral "no planned OT" label instead of Infinity / NaN. This percentage is
// NEVER used for colour classification — only the thresholds above are.
export function getOTDifferencePercent(
  actualOT: number | null | undefined,
  planOT: number | null | undefined
): number | null {
  if (!Number.isFinite(actualOT) || !Number.isFinite(planOT)) return null;
  const plan = planOT as number;
  if (plan <= 0) return null;
  return Math.round((((actualOT as number) - plan) / plan) * 100);
}

// Synchronized accent colors for the Actual OT card per status.
// neutral uses a slate tone so it reads as "no assessment".
export const ACTUAL_OT_STATUS_COLORS: Record<ActualOtStatus, string> = {
  green: '#10B981',
  yellow: '#F59E0B',
  orange: '#F97316',
  red: '#EF4444',
  neutral: '#64748B',
};
