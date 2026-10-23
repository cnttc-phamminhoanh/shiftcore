// ============================================================
// API CLIENT cho UI — gọi tới backend Node.js cùng origin (/api/...).
// Mọi lời gọi đi đường tương đối /api → không CORS, không lộ địa chỉ server.
// ============================================================
import type { IDailySummary } from '@/data/dailysummarydata';
import type { IKpiData } from '@/data/kpidata';
import type { IMonthlyData } from '@/data/monthlydata';
import type { IWorkerOtRecord } from '@/data/otrecords';

export interface DateRange {
  from: string;
  to: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Cửa sổ mặc định: 90 ngày kết thúc hôm nay (khớp mặc định của UI).
export function defaultRange(days = 90): DateRange {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
  return {
    from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
    to: `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
  };
}

async function get<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, v);
  }
  const url = `/api${path}${qs.size ? `?${qs.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Lỗi HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  departments: () => get<{ groups: string[] }>('/departments', {}),

  kpi: (range: DateRange) =>
    get<{ from: string; to: string; cards: IKpiData[] }>('/kpi', { ...range }),

  summary: (range: DateRange) =>
    get<{ workerCount: number; planHours: number; actualHours: number; igmHours: number; searchDays: number }>(
      '/overtime/summary',
      { ...range }
    ),

  daily: (range: DateRange, dept = 'all') =>
    get<{ rows: IDailySummary[] }>('/overtime/daily', { ...range, dept }),

  records: (
    range: DateRange,
    opts: { dept?: string; process?: string; alert?: string; search?: string; heavyOt?: boolean } = {}
  ) =>
    get<{ rows: IWorkerOtRecord[]; total: number }>('/overtime/records', {
      ...range,
      dept: opts.dept || 'all',
      process: opts.process,
      alert: opts.alert,
      search: opts.search,
      heavyOt: opts.heavyOt ? '1' : undefined,
    }),

  monthly: (range: DateRange) => get<{ rows: IMonthlyData[] }>('/overtime/monthly', { ...range }),

  departmentTrend: (range: DateRange) =>
    get<{ rows: { id: string; month: string; department: string; hours: number; planHours?: number }[] }>(
      '/overtime/department-trend',
      { ...range }
    ),

  spikeStats: (range: DateRange, dept = 'all') =>
    get<{ buckets: { department: string; workerDays: number; uniqueWorkers: number; maxDailyWorkers: number; peakDate: string; alert: { level: string; color: string } }[] }>(
      '/ot/spike-stats',
      { ...range, dept }
    ),
};
