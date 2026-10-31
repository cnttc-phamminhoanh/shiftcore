// EXPORTS: isDateInRange, monthsInRange, MONTH_PERIODS
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';

// Calendar period covered by each sample-data month label (ISO yyyy-mm-dd).
// The three labels track the three calendar months ending with the current
// month, so they always intersect the rolling 3-month default search window.
function monthsAgoPeriod(monthsAgo: number): { start: string; end: string } {
  const month = subMonths(new Date(), monthsAgo);
  return {
    start: format(startOfMonth(month), 'yyyy-MM-dd'),
    end: format(endOfMonth(month), 'yyyy-MM-dd'),
  };
}

export const MONTH_PERIODS: Record<string, { start: string; end: string }> = {
  'Month 8': monthsAgoPeriod(2),
  'Month 9': monthsAgoPeriod(1),
  'Month 10': monthsAgoPeriod(0),
};

// ISO yyyy-mm-dd containment check; empty bounds are treated as unbounded.
export function isDateInRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

// Month labels whose calendar period intersects the selected date range.
// Sinh động theo from..to: Month 1..Month 12.
export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to) return out;
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`Month ${m}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
