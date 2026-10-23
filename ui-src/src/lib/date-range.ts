// EXPORTS: isDateInRange, monthsInRange, MONTH_PERIODS
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';

import { MONTH_LABELS } from '@/data/deptseries';

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
export function monthsInRange(from: string, to: string): string[] {
  return MONTH_LABELS.filter((label) => {
    const period = MONTH_PERIODS[label];
    if (!period) return true;
    if (from && period.end < from) return false;
    if (to && period.start > to) return false;
    return true;
  });
}
