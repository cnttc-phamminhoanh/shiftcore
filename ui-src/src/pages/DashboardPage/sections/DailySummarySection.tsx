import { memo, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Layers,
  ListFilter,
  Search,
  SearchX,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import DepartmentBadge, { ProcessBadge } from '@/components/DepartmentBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { filterDepartments, type DepartmentFilter } from '@/data/deptseries';
import type { IDailySummary } from '@/data/dailysummarydata';
import type { IWorkerOtRecord } from '@/data/otrecords';
import { isDateInRange } from '@/lib/date-range';
import {
  formatMinutes,
  formatRatio,
  getOtAlertLevel,
  OT_LEVEL_META,
  type OtAlertLevel,
} from '@/lib/ot-alert';
import {
  getWorkerOtAlertStatus,
  WORKER_OT_ALERT_COLORS,
  type WorkerOtAlertStatus,
} from '@/lib/worker-ot-status';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;
const SKELETON_ROWS = 5;

// Toolbar dropdown options (department codes are business identifiers).
const DEPARTMENT_OPTIONS = ['CUT', 'SEW', 'EMB', 'PRI', 'FIN', 'OTHER', 'PAC'] as const;
// Alert dropdown options: the four deviation levels plus the independent
// spike-OT filter (labels come from the otAlert.* i18n keys).
const ALERT_FILTER_OPTIONS: readonly (OtAlertLevel | 'heavyOt')[] = [
  'normal',
  'yellow',
  'orange',
  'red',
  'heavyOt',
];
// Spike-OT threshold: actual OT of at least 4 hours per worker per working
// day (numeric minutes — 239 is below, 240 and 241 are above). In production
// the same threshold runs on the Node.js backend over verified OT minutes.
const HEAVY_OT_MINUTES = 4 * 60;

// Applied toolbar filter state (committed by the "Apply Filters" button).
interface ToolbarFilters {
  department: string;
  process: string;
  search: string;
  alert: string;
}

type ViewMode = 'process' | 'worker' | 'processRollup';

type SortKey = 'process' | 'workers' | 'records' | 'plan' | 'actual' | 'ratio' | 'over';
type SortDir = 'asc' | 'desc';
type DetailSortKey =
  | 'date'
  | 'department'
  | 'process'
  | 'workers'
  | 'planHours'
  | 'planIssueDate'
  | 'otHours'
  | 'scanTime';

// Color rule from the reference: near-plan = green, moderate over-plan =
// orange, severe over-plan = red.
function otValueClass(level: OtAlertLevel): string {
  switch (level) {
    case 'red':
    case 'orange':
      return 'text-destructive';
    case 'yellow':
      return 'text-orange-600';
    case 'normal':
      return 'text-success';
    default:
      return 'text-muted-foreground';
  }
}

interface SortableHeadProps {
  label: string;
  column: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  alignRight?: boolean;
  alignCenter?: boolean;
}

function SortableHead({
  label,
  column,
  sortKey,
  onSort,
  alignRight,
  alignCenter,
}: SortableHeadProps) {
  const active = sortKey === column;
  return (
    <TableHead className={cn('whitespace-nowrap', alignRight && 'text-right', alignCenter && 'text-center')}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 rounded px-0.5 transition-colors hover:text-foreground',
          alignRight && 'flex-row-reverse',
          alignCenter && 'justify-center',
          active && 'text-foreground'
        )}
      >
        {label}
      </button>
    </TableHead>
  );
}

// Loading placeholder shown while the (mock) data query resolves.
function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
        <TableRow key={`skeleton-${rowIndex}`} className="h-11">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <TableCell key={colIndex}>
              <div
                className={cn(
                  'h-4 max-w-[110px] animate-pulse rounded bg-muted',
                  (rowIndex + colIndex) % 3 === 0 ? 'w-3/4' : 'w-1/2'
                )}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchX className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">{t('table.noRecords')}</p>
      <p className="text-xs text-muted-foreground">{t('table.noRecordsHint')}</p>
    </div>
  );
}

// Chart drill-down filter applied on top of the toolbar filters
// (department + absolute-OT status from the abnormal-OT stacked chart).
interface OtDrillDown {
  department: string;
  status: WorkerOtAlertStatus;
}

interface DailySummarySectionProps {
  selected: DepartmentFilter;
  dateFrom: string;
  dateTo: string;
  drillDown?: OtDrillDown | null;
  onClearDrillDown?: () => void;
  daily: IDailySummary[];
  records: IWorkerOtRecord[];
}

export default memo(function DailySummarySection({
  selected,
  dateFrom,
  dateTo,
  drillDown,
  onClearDrillDown,
  daily,
  records,
}: DailySummarySectionProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [mode, setMode] = useState<ViewMode>('process');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('actual');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [detailSortKey, setDetailSortKey] = useState<DetailSortKey>('date');
  const [detailSortDir, setDetailSortDir] = useState<SortDir>('asc');

  // Toolbar filters: draft values are committed to `filters` when the
  // "Apply Filters" button is pressed (form submit).
  const [draftDepartment, setDraftDepartment] = useState('all');
  const [draftProcess, setDraftProcess] = useState('all');
  const [draftAlert, setDraftAlert] = useState('all');
  const [draftSearch, setDraftSearch] = useState('');
  const [filters, setFilters] = useState<ToolbarFilters>({
    department: 'all',
    process: 'all',
    search: '',
    alert: 'all',
  });

  const handleApplyFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters({
      department: draftDepartment,
      process: draftProcess,
      search: draftSearch.trim().toLowerCase(),
      alert: draftAlert,
    });
    // The spike-OT filter only applies to the per-worker view.
    if (draftAlert === 'heavyOt') {
      setMode('worker');
    }
  };

  // Chart drill-down activates the per-worker view filtered by the clicked
  // department + pink/red absolute-OT status (cleared via the banner chip).
  useEffect(() => {
    if (drillDown) {
      setMode('worker');
      setPage(1);
    }
  }, [drillDown]);

  // Simulates the async fetch cadence of the future production API.
  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(timer);
  }, [selected, mode, filters]);

  useEffect(() => {
    setPage(1);
  }, [selected, mode, sortKey, sortDir, detailSortKey, detailSortDir, filters]);

  // Toolbar predicate: department + process + free-text search
  // over department / process / worker.
  // Fixed illustrative dataset — filtered by the applied date-range search
  // (unified with the header picker) + department chips + toolbar.
  const processRows = useMemo(
    () =>
      daily.filter(
        (row) =>
          isDateInRange(row.date, dateFrom, dateTo) &&
          filterDepartments(selected).includes(row.department) &&
          (filters.department === 'all' || row.department === filters.department) &&
          (filters.process === 'all' || row.process === filters.process) &&
          (filters.alert === 'all' ||
            getOtAlertLevel(row.planHours * 60, row.actualOtHours * 60) === filters.alert) &&
          (!filters.search ||
            `${row.department} ${row.process}`.toLowerCase().includes(filters.search))
      ),
    [selected, filters, dateFrom, dateTo, daily]
  );

  // Client-side sorting for the department detail table (default: date asc).
  const sortedProcessRows = useMemo(() => {
    const rows = [...processRows];
    const dir = detailSortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (detailSortKey) {
        case 'date':
          cmp = a.date.localeCompare(b.date);
          break;
        case 'department':
          cmp = a.department.localeCompare(b.department);
          break;
        case 'process':
          cmp = a.process.localeCompare(b.process);
          break;
        case 'workers':
          cmp = a.workers - b.workers;
          break;
        case 'planHours':
          cmp = a.planHours - b.planHours;
          break;
        case 'planIssueDate':
          cmp = a.planIssueDate.localeCompare(b.planIssueDate);
          break;
        case 'otHours':
          cmp = a.actualOtHours - b.actualOtHours;
          break;
        case 'scanTime':
          cmp = a.scanTimeMinutes - b.scanTimeMinutes;
          break;
      }
      return cmp * dir;
    });
    return rows;
  }, [processRows, detailSortKey, detailSortDir]);

  const handleDetailSort = (key: string) => {
    const typedKey = key as DetailSortKey;
    if (typedKey === detailSortKey) {
      setDetailSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setDetailSortKey(typedKey);
      setDetailSortDir('asc');
    }
  };

  const workerRows = useMemo(
    () =>
      records.filter(
        (row) =>
          isDateInRange(row.date, dateFrom, dateTo) &&
          filterDepartments(selected).includes(row.department) &&
          (filters.department === 'all' || row.department === filters.department) &&
          (filters.process === 'all' || row.process === filters.process) &&
          (filters.alert === 'all' ||
            filters.alert === 'heavyOt' ||
            getOtAlertLevel(row.planOtMinutes, row.actualOtMinutes) === filters.alert) &&
          (!drillDown ||
            (row.department === drillDown.department &&
              getWorkerOtAlertStatus(row.actualOtMinutes) === drillDown.status)) &&
          (!filters.search ||
            `${row.department} ${row.process} ${row.workerName} ${row.workerId}`
              .toLowerCase()
              .includes(filters.search))
      ),
    [selected, filters, drillDown, dateFrom, dateTo, records]
  );

  // Spike-OT view data: first aggregate verified actual OT per worker per
  // working day (same-day segments are summed before the threshold is
  // applied), then keep only worker-days with OT >= 4h, sorted OT desc —
  // the exact rule the production Node.js endpoint applies server-side.
  // For every other alert filter the raw per-record rows are used as-is.
  const workerViewRows = useMemo<IWorkerOtRecord[]>(() => {
    if (filters.alert !== 'heavyOt') return workerRows;
    const acc = new Map<string, IWorkerOtRecord>();
    for (const record of workerRows) {
      const key = `${record.date}::${record.workerId}`;
      const existing = acc.get(key);
      if (existing) {
        existing.planOtMinutes += record.planOtMinutes;
        existing.actualOtMinutes += record.actualOtMinutes;
        // Keep the latest IGM scan of that worker-day.
        if (record.scanTime > existing.scanTime) existing.scanTime = record.scanTime;
      } else {
        acc.set(key, { ...record });
      }
    }
    return Array.from(acc.values())
      .filter((row) => row.actualOtMinutes >= HEAVY_OT_MINUTES)
      .sort(
        (a, b) =>
          b.actualOtMinutes - a.actualOtMinutes ||
          b.date.localeCompare(a.date) ||
          a.workerId.localeCompare(b.workerId)
      );
  }, [workerRows, filters.alert]);

  // Whole-result spike stats (not just the current page): total worker-day
  // cases and distinct workers with OT >= 4h inside the applied filters.
  const heavyOtStats = useMemo(() => {
    if (filters.alert !== 'heavyOt') return { cases: 0, unique: 0 };
    return {
      cases: workerViewRows.length,
      unique: new Set(workerViewRows.map((row) => row.workerId)).size,
    };
  }, [workerViewRows, filters.alert]);

  // Distinct process names for the toolbar dropdown (union of both datasets).
  const processOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...daily.map((r) => r.process),
          ...records.map((r) => r.process),
        ])
      ).sort(),
    [daily, records]
  );

  // Exports the currently visible rows of the active view as an
  // Excel-compatible UTF-8 CSV (with BOM so Vietnamese opens cleanly).
  const handleExport = () => {
    let header: string[] = [];
    let data: (string | number)[][] = [];
    if (mode === 'process') {
      header = [
        t('table.date'),
        t('table.department'),
        t('table.process'),
        t('table.workers'),
        t('table.planHours'),
        t('table.planIssueDate'),
        t('table.actualHours'),
        t('table.scanCheckTime'),
      ];
      data = sortedProcessRows.map((r) => [
        r.date,
        r.department,
        r.process,
        r.workers,
        Math.round(r.planHours * 10) / 10,
        r.planIssueDate,
        Math.round(r.actualOtHours * 10) / 10,
        r.scanTimeMinutes,
      ]);
    } else if (mode === 'worker') {
      header = [
        t('table.date'),
        t('table.department'),
        t('table.workerId'),
        t('table.workerName'),
        t('table.process'),
        t('table.planHours'),
        t('table.planIssueDate'),
        t('table.actualHours'),
        t('table.scanCheckTime'),
      ];
      // Exports the FULL filtered result (all pages), never just the
      // current page — same columns and OT time formats as the table.
      data = workerViewRows.map((r) => [
        r.date,
        r.department,
        r.workerId,
        r.workerName,
        r.process,
        Math.round((r.planOtMinutes / 60) * 10) / 10,
        r.planIssueDate,
        Math.round((r.actualOtMinutes / 60) * 10) / 10,
        r.scanTime,
      ]);
    } else {
      header = [
        t('table.process'),
        t('table.workers'),
        t('table.otRecords'),
        t('table.planOT'),
        t('table.actualOT'),
        t('table.otRatio'),
        t('table.overPlan'),
      ];
      data = sortedRollup.map((r) => [
        r.process,
        r.workers,
        r.records,
        Math.round((r.plan / 60) * 10) / 10,
        Math.round((r.actual / 60) * 10) / 10,
        r.plan > 0 ? Math.round((r.actual / r.plan) * 100) : 0,
        Math.round((r.over / 60) * 10) / 10,
      ]);
    }
    const esc = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const csv = [
      header.map(esc).join(','),
      ...data.map((row) => row.map(esc).join(',')),
    ].join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `production-report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('table.exportDone', { count: data.length }));
  };

  // By-process rollup: one row per process, aggregated live from the
  // per-worker OT records (same illustrative dataset, nothing hardcoded).
  const processRollup = useMemo(() => {
    const acc = new Map<
      string,
      { workers: Set<string>; records: number; plan: number; actual: number; over: number }
    >();
    for (const row of workerRows) {
      const entry =
        acc.get(row.process) ?? {
          workers: new Set<string>(),
          records: 0,
          plan: 0,
          actual: 0,
          over: 0,
        };
      entry.workers.add(row.workerId);
      entry.records += 1;
      entry.plan += row.planOtMinutes;
      entry.actual += row.actualOtMinutes;
      if (row.actualOtMinutes > row.planOtMinutes) entry.over += 1;
      acc.set(row.process, entry);
    }
    return Array.from(acc.entries())
      .map(([process, e]) => ({
        process,
        workers: e.workers.size,
        records: e.records,
        plan: e.plan,
        actual: e.actual,
        over: e.over,
        level: getOtAlertLevel(e.plan, e.actual),
      }))
      .filter((row) => filters.alert === 'all' || row.level === filters.alert)
      .sort((a, b) => b.actual - a.actual);
  }, [workerRows, filters.alert]);

  // Client-side sorting for the by-process table (default: actual OT desc).
  const sortedRollup = useMemo(() => {
    const rows = [...processRollup];
    const dir = sortDir === 'asc' ? 1 : -1;
    const ratioOf = (r: (typeof processRollup)[number]) => (r.plan > 0 ? r.actual / r.plan : 0);
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'process') cmp = a.process.localeCompare(b.process);
      else if (sortKey === 'workers') cmp = a.workers - b.workers;
      else if (sortKey === 'records') cmp = a.records - b.records;
      else if (sortKey === 'plan') cmp = a.plan - b.plan;
      else if (sortKey === 'actual') cmp = a.actual - b.actual;
      else if (sortKey === 'ratio') cmp = ratioOf(a) - ratioOf(b);
      else cmp = a.over - b.over;
      return cmp * dir;
    });
    return rows;
  }, [processRollup, sortKey, sortDir]);

  const handleSort = (key: string) => {
    const typedKey = key as SortKey;
    if (typedKey === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(typedKey);
      setSortDir(typedKey === 'process' ? 'asc' : 'desc');
    }
  };

  const filteredCount =
    mode === 'process'
      ? processRows.length
      : mode === 'worker'
        ? workerViewRows.length
        : processRollup.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const pageProcessRows = sortedProcessRows.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const pageWorkerRows = workerViewRows.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const pageProcessRollupRows = sortedRollup.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const from = filteredCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, filteredCount);

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <ClipboardList className="size-5 text-primary" />
              {t('table.title')}
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode('process')}
              title={t('table.byProcess')}
              className={cn(
                'px-2.5 sm:px-3',
                mode === 'process' &&
                  'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
              )}
            >
              <Workflow className="size-4" />
              <span className="hidden sm:inline">{t('table.byProcess')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode('processRollup')}
              title={t('table.byProcessRollup')}
              className={cn(
                'px-2.5 sm:px-3',
                mode === 'processRollup' &&
                  'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
              )}
            >
              <Layers className="size-4" />
              <span className="hidden sm:inline">{t('table.byProcessRollup')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode('worker')}
              title={t('table.perWorker')}
              className={cn(
                'px-2.5 sm:px-3',
                mode === 'worker' &&
                  'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
              )}
            >
              <Users className="size-4" />
              <span className="hidden sm:inline">{t('table.perWorker')}</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      {/* Chart drill-down banner: per-worker view is filtered by the pink/red
          segment clicked on the abnormal-OT chart until cleared here. */}
      {drillDown && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2 text-xs md:px-6">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span
              className="inline-block size-2 shrink-0 rounded-full"
              style={{
                backgroundColor: WORKER_OT_ALERT_COLORS[drillDown.status],
              }}
            />
            {t('table.chartDrillDown')}:{' '}
            {drillDown.department === 'OTHER'
              ? t('filter.other')
              : drillDown.department}
            <span className="text-muted-foreground">•</span>
            {t(`otStatus.${drillDown.status}`)}
          </span>
          <span className="text-muted-foreground">
            {t('table.chartDrillDownHint')}
          </span>
          {onClearDrillDown && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 rounded-full px-2 text-xs"
              onClick={onClearDrillDown}
            >
              <X className="size-3" />
              {t('common.clear')}
            </Button>
          )}
        </div>
      )}
      {/* Spike-OT stats strip: shown while the "OT >= 4h/day" filter is
          applied — counts cover the whole filtered result, not the page. */}
      {filters.alert === 'heavyOt' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-destructive/5 px-4 py-2 text-xs md:px-6">
          <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
          <span className="font-medium text-foreground">{t('otAlert.heavyOt')}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">
            {t('table.heavyOtSummary', {
              cases: heavyOtStats.cases,
              unique: heavyOtStats.unique,
            })}
          </span>
        </div>
      )}
      {/* Filter & actions toolbar: dropdowns + search + apply/export */}
      <div className="border-y border-border/60 bg-muted/30 px-4 py-2.5 md:px-6">
        <form
          onSubmit={handleApplyFilters}
          className="flex flex-wrap items-center gap-2"
        >
            {/* Department dropdown */}
            <Select value={draftDepartment} onValueChange={setDraftDepartment}>
              <SelectTrigger
                aria-label={t('table.department')}
                className="h-9 w-[calc(50%-4px)] rounded-lg bg-card text-sm sm:w-[150px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filter.allDepartments')}</SelectItem>
                {DEPARTMENT_OPTIONS.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept === 'OTHER' ? t('filter.other') : dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Process dropdown */}
            <Select value={draftProcess} onValueChange={setDraftProcess}>
              <SelectTrigger
                aria-label={t('table.process')}
                className="h-9 w-[calc(50%-4px)] rounded-lg bg-card text-sm sm:w-[150px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('table.allProcesses')}</SelectItem>
                {processOptions.map((process) => (
                  <SelectItem key={process} value={process}>
                    {process}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* OT alert level dropdown ("Cảnh báo OT" column filter) */}
            <Select value={draftAlert} onValueChange={setDraftAlert}>
              <SelectTrigger
                aria-label={t('table.otAlert')}
                className="h-9 w-[calc(50%-4px)] rounded-lg bg-card text-sm sm:w-[160px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('table.allAlerts')}</SelectItem>
                {ALERT_FILTER_OPTIONS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`otAlert.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Free-text search */}
            <div className="relative w-full sm:w-[180px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder={t('table.searchPlaceholder')}
                className="h-9 rounded-lg bg-card pl-8 text-sm"
              />
            </div>

          {/* Actions — kept right after the search box, left-aligned like the rest of the toolbar */}
          <div className="flex gap-2">
            <Button type="submit" className="h-9 gap-1.5 rounded-lg px-3 text-sm">
              <ListFilter className="size-4" />
              {t('table.applyFilters')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 rounded-lg bg-card px-3 text-sm"
              onClick={handleExport}
            >
              <Download className="size-4" />
              {t('table.exportExcel')}
            </Button>

          </div>
        </form>
      </div>
      <CardContent className="p-0">
        <div className="w-full overflow-x-auto">
          {mode === 'process' ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 whitespace-nowrap text-center">#</TableHead>
                  <SortableHead
                    label={t('table.date')}
                    column="date"
                    sortKey={detailSortKey}
                    sortDir={detailSortDir}
                    onSort={handleDetailSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.department')}
                    column="department"
                    sortKey={detailSortKey}
                    sortDir={detailSortDir}
                    onSort={handleDetailSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.process')}
                    column="process"
                    sortKey={detailSortKey}
                    sortDir={detailSortDir}
                    onSort={handleDetailSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.workers')}
                    column="workers"
                    sortKey={detailSortKey}
                    sortDir={detailSortDir}
                    onSort={handleDetailSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.planHours')}
                    column="planHours"
                    sortKey={detailSortKey}
                    sortDir={detailSortDir}
                    onSort={handleDetailSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.planIssueDate')}
                    column="planIssueDate"
                    sortKey={detailSortKey}
                    sortDir={detailSortDir}
                    onSort={handleDetailSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.actualHours')}
                    column="otHours"
                    sortKey={detailSortKey}
                    sortDir={detailSortDir}
                    onSort={handleDetailSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.scanCheckTime')}
                    column="scanTime"
                    sortKey={detailSortKey}
                    sortDir={detailSortDir}
                    onSort={handleDetailSort}
                    alignCenter
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows columns={9} />
                ) : (
                  pageProcessRows.map((row, idx) => (
                    <TableRow key={row.id} className="h-11 even:bg-muted/25">
                      <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                        {row.date}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <DepartmentBadge departmentCode={row.department} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <ProcessBadge processName={row.process} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums">
                        {row.workers}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums">
                        {formatMinutes(row.planHours * 60)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                        {row.planIssueDate}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums font-medium">
                        {formatMinutes(row.actualOtHours * 60)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums">
                        {formatMinutes(row.scanTimeMinutes)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : mode === 'worker' ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 whitespace-nowrap text-center">#</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.date')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.department')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.workerId')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.workerName')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.process')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.planHours')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.planIssueDate')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.actualHours')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.scanCheckTime')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows columns={11} />
                ) : (
                  pageWorkerRows.map((row, idx) => {
                    const level = getOtAlertLevel(row.planOtMinutes, row.actualOtMinutes);
                    const valueClass = otValueClass(level);
                    return (
                      <TableRow key={row.id} className="h-11 even:bg-muted/25">
                        <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                          {(page - 1) * PAGE_SIZE + idx + 1}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                          {row.date}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <DepartmentBadge departmentCode={row.department} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                          {row.workerId}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center font-medium">
                          {row.workerName}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <ProcessBadge processName={row.process} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.planOtMinutes > 0 ? formatMinutes(row.planOtMinutes) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                          {row.planIssueDate}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          {row.actualOtMinutes >= HEAVY_OT_MINUTES ? (
                            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 font-bold tabular-nums text-destructive">
                              {formatMinutes(row.actualOtMinutes)}
                            </span>
                          ) : (
                            <span
                              className={cn('tabular-nums font-semibold', valueClass)}
                            >
                              {formatMinutes(row.actualOtMinutes)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.scanTime}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          {row.actualOtMinutes >= HEAVY_OT_MINUTES ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                              <AlertTriangle className="size-3 shrink-0" />
                              {t('table.heavyOtBadge')}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
                                OT_LEVEL_META[level].badge
                              )}
                            >
                              {t(`otAlert.${level}`)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 whitespace-nowrap text-center">#</TableHead>
                  <SortableHead
                    label={t('table.process')}
                    column="process"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.workers')}
                    column="workers"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.otRecords')}
                    column="records"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.planOT')}
                    column="plan"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.actualOT')}
                    column="actual"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.otRatio')}
                    column="ratio"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    alignCenter
                  />
                  <SortableHead
                    label={t('table.overPlan')}
                    column="over"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    alignCenter
                  />
                  <TableHead className="whitespace-nowrap text-center">{t('table.otAlert')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <SkeletonRows columns={9} />
                ) : (
                  pageProcessRollupRows.map((row, idx) => {
                    const levelMeta = OT_LEVEL_META[row.level];
                    const valueClass = otValueClass(row.level);
                    return (
                      <TableRow key={row.process} className="h-11 even:bg-muted/25">
                        <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                          {(page - 1) * PAGE_SIZE + idx + 1}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <ProcessBadge processName={row.process} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.workers}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.records}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.plan > 0 ? formatMinutes(row.plan) : '—'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'whitespace-nowrap text-center tabular-nums font-semibold',
                            valueClass
                          )}
                        >
                          {formatMinutes(row.actual)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'whitespace-nowrap text-center tabular-nums font-semibold',
                            valueClass
                          )}
                        >
                          {formatRatio(row.plan, row.actual)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.over > 0 ? (
                            <span className="font-semibold text-warning">{row.over}</span>
                          ) : (
                            row.over
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
                              levelMeta.badge
                            )}
                          >
                            {t(`otAlert.${row.level}`)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
        {loading ? (
          <div className="border-t border-border/60 px-4 py-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
        ) : filteredCount === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {t('table.showing', { from, to, total: filteredCount })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
                {t('table.prev')}
              </Button>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {t('table.pageOf', { page, totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {t('table.next')}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
