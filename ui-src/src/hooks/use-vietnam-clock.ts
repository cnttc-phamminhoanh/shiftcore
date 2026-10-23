// EXPORTS: VN_TIME_ZONE, formatVietnamDateTime, useVietnamClock
import { useEffect, useState } from 'react';

// Vietnam factory timezone (UTC+7), uniform across the whole dashboard.
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Formats a Date as `yyyy-MM-dd HH:mm:ss` in Asia/Ho_Chi_Minh,
// independent of the viewer's local timezone.
export function formatVietnamDateTime(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

// Live system clock formatted in Vietnam time, refreshed every second.
// Pure UI state — no page reload or data refetch needed.
export function useVietnamClock(): string {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return formatVietnamDateTime(now);
}
