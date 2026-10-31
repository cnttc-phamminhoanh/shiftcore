// EXPORTS: SAMPLE_FROM, SAMPLE_TO, computeSearchDays, shiftSampleDate
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  subMonths,
} from 'date-fns';

// Mặc định: 3 tháng gần nhất.
const now = new Date();
export const SAMPLE_TO = format(now, 'yyyy-MM-dd');
export const SAMPLE_FROM = format(subMonths(now, 2), 'yyyy-MM-dd');

// The illustrative datasets were authored around a fixed anchor window
// (2025-10-29 → 2025-10-31). shiftSampleDate re-anchors those sample dates
// onto today (same day offsets from the anchor), so the rolling default
// window always contains the demo records regardless of when the app loads.
const SAMPLE_ANCHOR = '2025-10-31';
export function shiftSampleDate(iso: string): string {
  const date = parseISO(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const offset = differenceInCalendarDays(date, parseISO(SAMPLE_ANCHOR));
  return format(addDays(new Date(), offset), 'yyyy-MM-dd');
}

// Inclusive day count of the applied search range ("search days" input of
// the OT warning thresholds). Empty, unparsable or reversed ranges yield 0,
// which makes getActualOTStatus fall back to the neutral state instead of
// computing a wrong warning.
export function computeSearchDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const start = parseISO(from);
  const end = parseISO(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const days = differenceInCalendarDays(end, start) + 1;
  return days > 0 ? days : 0;
}
