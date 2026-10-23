// EXPORTS: WorkerOtAlertStatus, getWorkerOtAlertStatus, aggregateWorkerOtSpikes, queryWorkerOtSpikes, formatOtMinutes, WORKER_OT_ALERT_COLORS, SPIKE_DEPARTMENT_GROUPS, countWorkerOtSpikesByDepartment, OTWorkerAlertLevel, OT_WORKER_ALERT_COLORS, getOTWorkerAlert
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

// Aggregates spike-overtime worker-days for the per-worker chart:
//   1. Verified actual OT is summed per worker per working day (overnight
//      shifts included) — a worker-day is never duplicated.
//   2. ONLY cases with ActualOT >= 4h are returned (4.00h included,
//      3.99h excluded). OT across multiple days is never summed for the
//      threshold — each day is judged on its own.
//   3. OT is never inferred from the last IGM scan.
//   4. Rows are sorted by OT desc (then date desc, then workerNo).
export function aggregateWorkerOtSpikes(
  records: IWorkerOtRecord[]
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
    const minutes =
      typeof record.actualOtMinutes === 'number' && record.actualOtMinutes > 0
        ? record.actualOtMinutes
        : 0;
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

// The seven fixed department groups of the by-department spike chart. Every
// department outside the six named production groups falls into 'OTHER'
// ("Khác"), which is why the bucket list never grows with the data.
export const SPIKE_DEPARTMENT_GROUPS = [
  'CUT',
  'SEW',
  'EMB',
  'PRI',
  'FIN',
  'PAC',
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

export interface IDepartmentSpikeBucket {
  department: SpikeDepartmentGroup;
  // Worker-day cases (one worker counted at most once per working day) —
  // NOT the number of unique workers.
  workerDays: number;
  uniqueWorkers: number;
  // Workers with actual OT >= 4h on the department's worst single day in the
  // selected range. The bar height AND the threshold color are both judged
  // against this per-day number — multi-day totals never drive the alert
  // level, so a whole-month sum is never compared with a one-day threshold.
  maxDailyWorkers: number;
  // The worst day inside the range ('' when the department has no cases).
  peakDate: string;
  // Threshold alert computed from maxDailyWorkers (see getOTWorkerAlert).
  alert: { level: OTWorkerAlertLevel; color: string };
}

export interface IDepartmentSpikeStats {
  buckets: IDepartmentSpikeBucket[]; // always the 7 fixed groups, in order
  totalWorkerDays: number;
  uniqueWorkers: number;
  activeDepartments: number;
}

// Counts verified spike worker-days (actual OT >= 4h per worker per working
// day) per department group. It reuses the exact same per-worker-per-day
// aggregation as the spike chart, so both views can never disagree: same-day
// segments are summed BEFORE the 4h threshold is applied, and each worker is
// counted at most once per day.
// For the alert coloring the workers are additionally counted PER DEPARTMENT
// PER DAY: each bucket carries the worst single day (maxDailyWorkers +
// peakDate) and the threshold status derived from it — never the range
// total. In production this aggregation runs on the Node.js backend — the
// React layer only calls the endpoint and renders the response, never
// recomputing the OT business rules itself.
export function countWorkerOtSpikesByDepartment(
  records: IWorkerOtRecord[]
): IDepartmentSpikeStats {
  const rows = aggregateWorkerOtSpikes(records);
  const acc = new Map<
    SpikeDepartmentGroup,
    { workerDays: number; workers: Set<string>; daily: Map<string, number> }
  >();
  for (const group of SPIKE_DEPARTMENT_GROUPS) {
    acc.set(group, { workerDays: 0, workers: new Set(), daily: new Map() });
  }
  const allWorkers = new Set<string>();

  for (const row of rows) {
    const group = (
      SPIKE_DEPARTMENT_GROUPS as readonly string[]
    ).includes(row.department)
      ? (row.department as SpikeDepartmentGroup)
      : 'OTHER'; // departments outside CUT/SEW/EMB/PRI/FIN/PAC
    const bucket = acc.get(group)!;
    bucket.workerDays += 1;
    bucket.workers.add(row.workerNo);
    bucket.daily.set(row.workDate, (bucket.daily.get(row.workDate) ?? 0) + 1);
    allWorkers.add(row.workerNo);
  }

  const buckets: IDepartmentSpikeBucket[] = SPIKE_DEPARTMENT_GROUPS.map(
    (department) => {
      const accBucket = acc.get(department)!;
      // Worst single day: highest per-day count, earliest date wins ties so
      // the result is deterministic. With a single-day filter this is exactly
      // that day's worker count.
      let maxDailyWorkers = 0;
      let peakDate = '';
      for (const [date, count] of Array.from(
        accBucket.daily.entries()
      ).sort((a, b) => a[0].localeCompare(b[0]))) {
        if (count > maxDailyWorkers) {
          maxDailyWorkers = count;
          peakDate = date;
        }
      }
      return {
        department,
        workerDays: accBucket.workerDays,
        uniqueWorkers: accBucket.workers.size,
        maxDailyWorkers,
        peakDate,
        alert: getOTWorkerAlert(maxDailyWorkers),
      };
    }
  );

  return {
    buckets,
    totalWorkerDays: rows.length,
    uniqueWorkers: allWorkers.size,
    activeDepartments: buckets.filter((bucket) => bucket.workerDays > 0).length,
  };
}
