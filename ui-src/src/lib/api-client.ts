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
    get<{ workerCount: number; planHours: number; actualHours: number; searchDays: number }>(
      '/overtime/summary',
      { ...range }
    ),

  daily: (range: DateRange, dept = 'all') =>
    get<{ rows: IDailySummary[] }>('/overtime/daily', { ...range, dept }),

  records: (
    range: DateRange,
    opts: {
      dept?: string;
      process?: string;
      alert?: string;
      search?: string;
      date?: string;
      heavyOt?: boolean;
      status?: string;
      drillDept?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortDir?: string;
    } = {}
  ) =>
    get<{
      rows: IWorkerOtRecord[];
      total: number;
      stats?: { cases: number; unique: number } | null;
      totals?: { plan: number; actual: number };
    }>('/overtime/records', {
      ...range,
      dept: opts.dept || 'all',
      process: opts.process,
      alert: opts.alert,
      search: opts.search,
      date: opts.date,
      heavyOt: opts.heavyOt ? '1' : undefined,
      status: opts.status,
      drillDept: opts.drillDept,
      page: opts.page !== undefined ? String(opts.page) : undefined,
      pageSize: opts.pageSize !== undefined ? String(opts.pageSize) : undefined,
      sortBy: opts.sortBy,
      sortDir: opts.sortDir,
    }),

  processRollup: (
    range: DateRange,
    opts: { dept?: string; process?: string; alert?: string; date?: string } = {}
  ) =>
    get<{
      rows: {
        date: string;
        process: string;
        workers: number;
        records: number;
        plan: number;
        actual: number;
        over: number;
        level: string;
        status: string;
      }[];
    }>('/overtime/process-rollup', {
      ...range,
      dept: opts.dept || 'all',
      process: opts.process,
      alert: opts.alert,
      date: opts.date,
    }),

  monthly: (range: DateRange) => get<{ rows: IMonthlyData[] }>('/overtime/monthly', { ...range }),

  departmentTrend: (range: DateRange) =>
    get<{ rows: { id: string; month: string; department: string; hours: number; planHours?: number }[] }>(
      '/overtime/department-trend',
      { ...range }
    ),
};
