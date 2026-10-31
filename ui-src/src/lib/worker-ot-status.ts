// EXPORTS: WorkerOtAlertStatus, getWorkerOtAlertStatus, aggregateWorkerOtSpikes, aggregateWorkerOtPlanSpikes, queryWorkerOtSpikes, formatOtMinutes, WORKER_OT_ALERT_COLORS, SPIKE_DEPARTMENT_GROUPS, countWorkerOtSpikesByDepartment, OTWorkerAlertLevel, OT_WORKER_ALERT_COLORS, getOTWorkerAlert
import type { IWorkerOtRecord } from '@/data/otrecords';

// Absolute actual-OT bands per worker per working day (confirmed rule):
//   normal — Actual OT <= 2h   (not shown in the alert chart)
//   pink   — 2h < Actual OT < 4h   ("tăng ca cao" / high overtime)
//   red    — Actual OT >= 4h       ("tăng ca đột biến" / spike overtime)
// Exactly 2h is normal; 2h01m is pink; 3h59m is pink; exactly 4h is red.
// Unverified / missing values are NOT treated as 0h — they are skipped.
// NOTE: in production this classification must run on the Node.js backend
// over verified attendance + OT-registration data; this module is the
// interim sample-data implementation of the exact same rules.
export type WorkerOtAlertStatus = 'pink' | 'red';

export function getWorkerOtAlertStatus(
  actualOtMinutes: number | null | undefined
): 'normal' | WorkerOtAlertStatus {
  if (
    actualOtMinutes == null ||
    !Number.isFinite(actualOtMinutes) ||
    actualOtMinutes < 0
  ) {
    return 'normal';
  }
  if (actualOtMinutes >= 240) return 'red';
  if (actualOtMinutes > 120) return 'pink';
  return 'normal';
}

// Required palette from the specification (hex literals for chart rendering).
// Rose #E879A8 = 2h < OT < 4h, Crimson #DC3545 = OT >= 4h — solid, no
// gradients, so both alert bands stay clearly distinguishable.
export const WORKER_OT_ALERT_COLORS = {
  pink: '#E879A8',
  red: '#DC3545',
} as const;

export interface IWorkerOtSpikeRow {
  workerNo: string;
  name: string;
  department: string;
  workDate: string;
  actualOtMinutes: number;
}

// Query parameters for the paginated spike detail table. In production this
// is the request body of GET /ot/spikes — the Node.js backend filters
// ActualOT >= 4h, sorts desc, applies search/department filters and returns
// only the requested page, so the frontend never loads the full dataset.
export interface IWorkerOtSpikeQuery {
  search?: string;
  department?: string; // 'all' or a department code
  page: number; // 1-based
  pageSize: number;
}

export interface IWorkerOtSpikeQueryResult {
  rows: IWorkerOtSpikeRow[]; // only the requested page
  page: number; // clamped to the valid range
  totalPages: number;
  total: number; // total matching worker-day cases
  uniqueWorkers: number; // distinct workers among the matches
}

// "5h 50m" — the shared OT time format for chart labels and tables.
export function formatOtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// SPIKE_OT_THRESHOLD_MINUTES = 240 (4 hours). In production this runs on the
// Node.js backend over verified actual-OT data; this module is the interim
// sample-data implementation of the exact same rule.
const SPIKE_OT_THRESHOLD_MINUTES = 240;

// Shared per-worker-per-day aggregation used by BOTH the actual and the
// planned OT >= 4h views of the by-department chart:
//   1. The picked OT field is summed per worker per working day (overnight
//      shifts included) — a worker-day is never duplicated.
//   2. ONLY cases with OT >= 4h are returned (4.00h included, 3.99h
//      excluded). OT across multiple days is never summed for the
//      threshold — each day is judged on its own.
//   3. OT is never inferred from scan records.
//   4. Rows are sorted by OT desc (then date desc, then workerNo).
function aggregateWorkerOtRows(
  records: IWorkerOtRecord[],
  pick: (record: IWorkerOtRecord) => number
): IWorkerOtSpikeRow[] {
  const acc = new Map<string, IWorkerOtSpikeRow>();

  for (const record of records) {
    if (
      !record ||
      typeof record.workerId !== 'string' ||
      typeof record.date !== 'string'
    ) {
      continue; // malformed row — skipped, never guessed
    }
    const minutes = pick(record);
    if (minutes <= 0) continue; // unverified / missing — not treated as 0h OT

    // One row per worker per working day; same-day segments are summed.
    const key = `${record.date}::${record.workerId}`;
    const existing = acc.get(key);
    if (existing) {
      existing.actualOtMinutes += minutes;
      continue;
    }
    acc.set(key, {
      workerNo: record.workerId,
      name: typeof record.workerName === 'string' ? record.workerName : '',
      department: record.department,
      workDate: record.date,
      actualOtMinutes: minutes,
    });
  }

  return Array.from(acc.values())
    .filter((row) => row.actualOtMinutes >= SPIKE_OT_THRESHOLD_MINUTES)
    .sort(
      (a, b) =>
        b.actualOtMinutes - a.actualOtMinutes ||
        b.workDate.localeCompare(a.workDate) ||
        a.workerNo.localeCompare(b.workerNo)
    );
}

// ACTUAL OT >= 4h worker-days — the "thực tế" bar and the alert metric.
export function aggregateWorkerOtSpikes(
  records: IWorkerOtRecord[]
): IWorkerOtSpikeRow[] {
  return aggregateWorkerOtRows(
    records,
    (record) =>
      typeof record.actualOtMinutes === 'number' && record.actualOtMinutes > 0
        ? record.actualOtMinutes
        : 0
  );
}

// PLANNED (registered) OT >= 4h worker-days — the "kế hoạch" companion bar
// of the by-department chart, judged with the exact same 4h/day rule so
// plan and actual stay directly comparable.
export function aggregateWorkerOtPlanSpikes(
  records: IWorkerOtRecord[]
): IWorkerOtSpikeRow[] {
  return aggregateWorkerOtRows(
    records,
    (record) =>
      typeof record.planOtMinutes === 'number' && record.planOtMinutes > 0
        ? record.planOtMinutes
        : 0
  );
}

// Paginated spike query for the detail dialog: applies a case-insensitive
// search over workerNo / name / department plus a department filter, then
// returns only the requested page together with the total case count and
// the distinct-worker count (so the UI can tell worker-days apart from
// unique workers when a range spans multiple days).
export function queryWorkerOtSpikes(
  rows: IWorkerOtSpikeRow[],
  query: IWorkerOtSpikeQuery
): IWorkerOtSpikeQueryResult {
  const search = (query.search ?? '').trim().toLowerCase();
  const department = query.department && query.department !== 'all'
    ? query.department
    : null;

  const filtered = rows.filter((row) => {
    if (department && row.department !== department) return false;
    if (!search) return true;
    return (
      row.workerNo.toLowerCase().includes(search) ||
      row.name.toLowerCase().includes(search) ||
      row.department.toLowerCase().includes(search)
    );
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const start = (page - 1) * query.pageSize;

  return {
    rows: filtered.slice(start, start + query.pageSize),
    page,
    totalPages,
    total,
    uniqueWorkers: new Set(filtered.map((row) => row.workerNo)).size,
  };
}

// The eight fixed department groups of the by-department spike chart. Every
// department outside the seven named production groups falls into 'OTHER'
// ("Khác"), which is why the bucket list never grows with the data.
export const SPIKE_DEPARTMENT_GROUPS = [
  'CUT',
  'SEW',
  'EMB',
  'PRI',
  'FIN',
  'PAC',
  'SOC',
  'OTHER',
] as const;

export type SpikeDepartmentGroup = (typeof SPIKE_DEPARTMENT_GROUPS)[number];

// Threshold-based alert levels for the by-department spike chart. The
// thresholds count WORKERS PER WORKING DAY (never multi-day or monthly
// totals, so a whole-month sum is never compared against a one-day rule):
//   below 5 workers/day          → green  #22C55E  "normal"
//   5 to below 8 workers/day     → yellow #FACC15  "watch"
//   8 to 10 workers/day          → orange #F97316  "high"
//   above 10 workers/day         → red    #EF4444  "critical"
// Invalid / missing counts return slate #94A3B8 ("noData") and are never
// mapped to a real band — the boundary checks are exclusive, so a count can
// only ever fall into exactly one bucket (4=green, 5=yellow, 7=yellow,
// 8=orange, 10=orange, 11=red).
// In production the Node.js backend computes and returns this status with
// the aggregation; the React layer only renders the color/status it gets.
export type OTWorkerAlertLevel =
  | 'normal'
  | 'watch'
  | 'high'
  | 'critical'
  | 'noData';

export const OT_WORKER_ALERT_COLORS: Record<OTWorkerAlertLevel, string> = {
  normal: '#22C55E',
  watch: '#FACC15',
  high: '#F97316',
  critical: '#EF4444',
  noData: '#94A3B8',
};

export function getOTWorkerAlert(count: number | null | undefined): {
  level: OTWorkerAlertLevel;
  color: string;
} {
  if (count == null || !Number.isFinite(count) || count < 0) {
    return { level: 'noData', color: OT_WORKER_ALERT_COLORS.noData };
  }
  if (count < 5) {
    return { level: 'normal', color: OT_WORKER_ALERT_COLORS.normal };
  }
  if (count < 8) {
    return { level: 'watch', color: OT_WORKER_ALERT_COLORS.watch };
  }
  if (count <= 10) {
    return { level: 'high', color: OT_WORKER_ALERT_COLORS.high };
  }
  return { level: 'critical', color: OT_WORKER_ALERT_COLORS.critical };
}
