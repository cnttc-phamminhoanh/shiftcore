import { memo, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { filterDepartments, type DepartmentFilter } from '@/data/deptseries';
import type { IDailySummary } from '@/data/dailysummarydata';
import type { IWorkerOtRecord } from '@/data/otrecords';
import { api } from '@/lib/api-client';
import { isDateInRange } from '@/lib/date-range';
import {
  formatHoursFromMinutes,
  formatRatio,
  getOtAlertLevel,
  OT_LEVEL_META,
  type OtAlertLevel,
} from '@/lib/ot-alert';
import {
  WORKER_OT_ALERT_COLORS,
  type WorkerOtAlertStatus,
} from '@/lib/worker-ot-status';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;
const SKELETON_ROWS = PAGE_SIZE; // 10 — khớp chiều cao bảng thật (10 dòng h-11)
                                   // → khi tải KHÔNG co bảng lại nửa → hết giật (31/10/2026)

// Toolbar dropdown options (department codes are business identifiers).
const DEPARTMENT_OPTIONS = ['CUT', 'SEW', 'EMB', 'PRI', 'FIN', 'PAC', 'SOC', 'OTHER'] as const;
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
// day (numeric minutes —239 is below, 240 and 241 are above). In production
// the same threshold runs on the Node.js backend over verified OT minutes.
const HEAVY_OT_MINUTES = 4 * 60;

// Applied toolbar filter state (committed by the "Apply Filters" button).
interface ToolbarFilters {
  department: string;
  process: string;
  search: string;
  alert: string;
  date: string;
}

type ViewMode = 'process' | 'worker' | 'processRollup';

type SortKey = 'date' | 'process' | 'workers' | 'plan' | 'actual' | 'ratio' | 'over';
type SortDir = 'asc' | 'desc';
type DetailSortKey =
  | 'date'
  | 'department'
  | 'workers'
  | 'planHours'
  | 'otHours';

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

// 31/10/2026: dòng Tổng GIẢ khi đang tải (chưa có dữ liệu) — giữ bảng luôn có đủ
// 10 dòng + 1 dòng tổng để chiều cao không đổi khi dữ liệu về (tránh giật ở đáy bảng).
function TotalRowSkeleton({ columns }: { columns: number }) {
  return (
    <TableRow className="bg-muted/60 hover:bg-muted/60">
      <TableCell colSpan={columns} className="whitespace-nowrap text-center">
        <div className="mx-auto h-4 w-32 animate-pulse rounded bg-muted" />
      </TableCell>
    </TableRow>
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

interface RollupRow {
  date: string;
  process: string;
  workers: number;
  otGe4: number;
  plan: number;
  actual: number;
  over: number;
  status: string;
}

// Màu + nhãn cho cột "Trạng thái" của bảng tổng (công thức getDeptRangeAlertStatus
// 30/10/2026). green = Trong kế hoạch, yellow = Chênh lệch nhỏ, orange = Chênh
// lệch lớn, red = Bất thường, neutral = không đủ dữ liệu.
const RANGE_STATUS_META: Record<string, { labelKey: string; badge: string }> = {
  green: { labelKey: 'otAlert.normal', badge: 'bg-success/15 text-success' },
  yellow: { labelKey: 'otAlert.yellow', badge: 'bg-yellow-100 text-yellow-800' },
  orange: { labelKey: 'otAlert.orange', badge: 'bg-orange-100 text-orange-800' },
  red: { labelKey: 'otAlert.red', badge: 'bg-red-100 text-red-700' },
  neutral: { labelKey: '', badge: 'bg-muted text-muted-foreground' },
};

interface DailySummarySectionProps {
  selected: DepartmentFilter;
  dateFrom: string;
  dateTo: string;
  drillDown?: OtDrillDown | null;
  onClearDrillDown?: () => void;
  daily: IDailySummary[];
}

export default memo(function DailySummarySection({
  selected,
  dateFrom,
  dateTo,
  drillDown,
  onClearDrillDown,
  daily,
}: DailySummarySectionProps) {
  const { t } = useTranslation();
  // Nh峄?tab 膽ang ch峄峮 khi load l岷 trang (sessionStorage) —tr瓢峄沜 膽芒y lu么n v峄?  // tab "Chi ti岷縯 b峄?ph岷璶" khi F5 r岷 b岷 ti峄噉 (29/10/2026).
  const [mode, setMode] = useState<ViewMode>(() => {
    const saved = sessionStorage.getItem('ot-detail-tab');
    return saved === 'process' || saved === 'processRollup' || saved === 'worker' ? saved : 'process';
  });
  const [page, setPage] = useState(1);
  // 31/10/2026: mỗi tab GIỮ trang riêng — chuyển tab qua lại không mất vị trí trang;
  // chỉ reset khi đổi bộ lọc. (Trước đây 1 biến page chung → drill sang công nhân
  // reset trang → quay về bảng cũ mất vị trí page.)
  const [rollupPage, setRollupPage] = useState(1);
  const [workerPage, setWorkerPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('actual');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [detailSortKey, setDetailSortKey] = useState<DetailSortKey>('date');
  const [detailSortDir, setDetailSortDir] = useState<SortDir>('asc');

  // B岷g c么ng nh芒n: server tr岷?膼脷NG trang 膽茫 l峄峜/s岷痯 x岷縫 + t峄昻g + th峄憂g k锚
  // (30/10/2026 —chuy峄僴 l峄峜 + ph芒n trang l锚n server 膽峄?h岷縯 ngh岷絥 20MB).
  const [workerData, setWorkerData] = useState<{
    rows: IWorkerOtRecord[];
    total: number;
    stats: { cases: number; unique: number } | null;
    totals: { plan: number; actual: number };
  } | null>(null);
  // Tab "Theo b峄?ph岷璶 chi ti岷縯": g峄檖 s岷祅 tr锚n server (s峄?d貌ng ≥s峄?ph貌ng ban).
  const [rollupRows, setRollupRows] = useState<RollupRow[] | null>(null);
  const [workerLoading, setWorkerLoading] = useState(false as boolean);
  const [rollupLoading, setRollupLoading] = useState(false as boolean);
  const [exporting, setExporting] = useState(false as boolean);

  // 31/10/2026: đổi khoảng ngày thì XOÁ data cũ của 2 bảng server-side ngay
  // (worker + rollup) — tránh bảng hiện dữ liệu khoảng cũ trong lúc đang tải.
  // (Bảng chỉ GIỮ dữ liệu cũ khi CHUYỂN TAB / CHUYỂN TRANG cùng 1 khoảng để hết giật.)
  const prevRange = useRef<{ from: string; to: string } | null>(null);
  useEffect(() => {
    if (
      prevRange.current &&
      (prevRange.current.from !== dateFrom || prevRange.current.to !== dateTo)
    ) {
      setWorkerData(null);
      setRollupRows(null);
    }
    prevRange.current = { from: dateFrom, to: dateTo };
  }, [dateFrom, dateTo]);

  useEffect(() => {
    sessionStorage.setItem('ot-detail-tab', mode);
  }, [mode]);

  // Toolbar filters: m峄梚 tab c贸 b峄?l峄峜 RI脢NG (29/10/2026) —l峄峜 tr锚n tab n脿y
  // kh么ng 谩p d峄g l锚n tab kh谩c; chuy峄僴 tab qua l岷 v岷玭 nh峄?l峄峜 c峄 t峄玭g tab.
  const [draftDepartment, setDraftDepartment] = useState('all');
  const [draftProcess, setDraftProcess] = useState('all');
  const [draftAlert, setDraftAlert] = useState('all');
  const [draftSearch, setDraftSearch] = useState('');
  const [draftDate, setDraftDate] = useState('all');
  const [filters, setFilters] = useState<Record<ViewMode, ToolbarFilters>>({
    process: { department: 'all', process: 'all', search: '', alert: 'all', date: 'all' },
    processRollup: { department: 'all', process: 'all', search: '', alert: 'all', date: 'all' },
    worker: { department: 'all', process: 'all', search: '', alert: 'all', date: 'all' },
  });
  const activeFilters = filters[mode];

  // 31/10/2026: đánh dấu ô lọc ĐANG ĐƯỢC ÁP DỤNG (giá trị khác mặc định) bằng
  // viền nổi (border-primary + ring) để user nhận biết bộ lọc đang bật ở đâu.
  const filterActive = {
    date: activeFilters.date !== 'all',
    // 31/10/2026: ô "Bộ phận" sáng khi dropdown lọc HOẶC nút phân loại
    // (CUT/SEW/EMB...) đang chọn nhóm (selected ≠ 'all').
    department: activeFilters.department !== 'all' || selected !== 'all',
    process: activeFilters.process !== 'all',
    alert: activeFilters.alert !== 'all',
    search: activeFilters.search !== '',
  };

  // 31/10/2026: nhóm bộ phận đang thực sự tác động (nút CUT/SEW... dưới KPI có
  // quyền ưu tiên hơn dropdown). Dùng cho hiển thị label của dropdown "Bộ phận"
  // để ô không còn nhảy về "Tất cả bộ phận" khi nút nhóm đang được chọn.
  // Nút "Khác" dưới KPI dùng mã `other` còn dropdown dùng `OTHER` → phải
  // chuẩn hoá trước khi đưa vào Select (nếu không label hiển thị rỗng).
  const displayDepartment =
    selected !== 'all'
      ? selected === 'other'
        ? 'OTHER'
        : selected
      : draftDepartment;

  // Khi chuy峄僴 tab →n岷 draft t峄?b峄?l峄峜 c峄 tab 膽贸.
  useEffect(() => {
    const f = filters[mode];
    setDraftDepartment(f.department);
    setDraftProcess(f.process);
    setDraftAlert(f.alert);
    setDraftSearch(f.search);
    setDraftDate(f.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleApplyFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters((prev) => ({
      ...prev,
      [mode]: {
        department: draftDepartment,
        process: draftProcess,
        search: draftSearch.trim().toLowerCase(),
        alert: draftAlert,
        date: draftDate,
      },
    }));
    // M峄梚 tab l峄峜 膽峄檆 l岷璸 (29/10/2026): ch峄峮 c岷h b谩o "OT 膽峄檛 bi岷縩" KH脭NG
    // c貌n t峄?nh岷 sang tab c么ng nh芒n —l峄峜 ngay t岷 tab 膽ang m峄?
  };

  // Chart drill-down activates the per-worker view filtered by the clicked
  // department + pink/red absolute-OT status (cleared via the banner chip).
  useEffect(() => {
    if (drillDown) {
      setMode('worker');
      setWorkerPage(1);
    }
  }, [drillDown]);

  // Fetch trang c么ng nh芒n t峄?server khi tab worker active —l峄峜, s岷痯 x岷縫,
  // g峄檖 heavyOt v脿 ph芒n trang 膽峄乽 do server t铆nh; client ch峄?render.
  useEffect(() => {
    if (mode !== 'worker') return;
    let alive = true;
    setWorkerLoading(true);
    const alertFilter = activeFilters.alert;
    api
      .records(
        { from: dateFrom, to: dateTo },
        {
          // 31/10/2026: tab "Chi tiết từng công nhân" cũng lọc theo nút nhóm
          // CUT/SEW/... dưới card KPI (selected). Khi đang drill-down từ chart
          // thì giữ bộ lọc toolbar (drillDept kiểm soát nhóm được click).
          dept: drillDown
            ? activeFilters.department
            : selected !== 'all'
              ? selected
              : activeFilters.department,
          process: activeFilters.process,
          alert: alertFilter,
          search: activeFilters.search || undefined,
          date: activeFilters.date === 'all' ? undefined : activeFilters.date,
          heavyOt: alertFilter === 'heavyOt',
          status: drillDown?.status,
          drillDept: drillDown?.department,
          page: workerPage,
          pageSize: PAGE_SIZE,
          sortBy: detailSortKey,
          sortDir: detailSortDir,
        }
      )
      .then((res) => {
        if (!alive) return;
        // 31/10/2026: nếu trang đang mở vượt số trang của kết quả mới (vd lọc đổi
        // ở tab khác rồi quay lại), tự nhảy về trang cuối hợp lệ thay vì bảng rỗng.
        if (res.total > 0) {
          const maxPage = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
          if (workerPage > maxPage) {
            setWorkerPage(maxPage);
            return;
          }
        }
        setWorkerData({
          rows: res.rows,
          total: res.total,
          stats: res.stats ?? null,
          totals: res.totals ?? { plan: 0, actual: 0 },
        });
      })
      .catch(() => {
        if (alive) setWorkerData(null);
      })
      .finally(() => {
        if (alive) {
          setWorkerLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dateFrom, dateTo, activeFilters, drillDown, workerPage, detailSortKey, detailSortDir, selected]);

  // Fetch g峄檖 theo b峄?ph岷璶 chi ti岷縯 (process) khi tab t瓢啤ng 峄﹏g active.
  useEffect(() => {
    if (mode !== 'processRollup') return;
    let alive = true;
    setRollupLoading(true);
    api
      .processRollup(
        { from: dateFrom, to: dateTo },
        {
          dept: activeFilters.department,
          process: activeFilters.process,
          alert: activeFilters.alert,
          date: activeFilters.date,
        }
      )
      .then((res) => {
        if (alive) setRollupRows(res.rows as unknown as typeof rollupRows);
      })
      .catch(() => {
        if (alive) setRollupRows([]);
      })
      .finally(() => {
        if (alive) {
          setRollupLoading(false);
          setRollupLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dateFrom, dateTo, activeFilters]);

  // 31/10/2026: chỉ reset trang của TAB ĐANG MỞ khi BỘ LỌC của chính tab đó thực sự
  // đổi (so NỘI DUNG filters[mode], không so tham chiếu object → chuyển tab qua lại
  // KHÔNG reset trang, mỗi tab giữ trang riêng).
  const filterKeysRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const key = JSON.stringify(filters[mode]);
    if (filterKeysRef.current[mode] !== key) {
      filterKeysRef.current[mode] = key;
      if (mode === 'worker') setWorkerPage(1);
      else if (mode === 'processRollup') setRollupPage(1);
      else setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, filters]);

  // Toolbar predicate: department + process + free-text search
  // over department / process / worker.
  // Fixed illustrative dataset —filtered by the applied date-range search
  // (unified with the header picker) + department chips + toolbar.
  // Tab "Chi ti岷縯 b峄?ph岷璶" kh么ng c贸 c峄檛 c岷h b谩o →KH脭NG l峄峜 theo c岷h b谩o 峄?膽芒y (29/10/2026).
  // Tab "Chi tiết bộ phận" lọc theo: ngày + bộ phận + TRẠNG THÁI (31/10/2026 —
  // thêm lọc trạng thái theo yêu cầu; level 'normal' ứng với status 'green').
  const processRows = useMemo(
    () =>
      daily.filter(
        (row) =>
          isDateInRange(row.date, dateFrom, dateTo) &&
          filterDepartments(selected).includes(row.department) &&
          (activeFilters.department === 'all' || row.department === activeFilters.department) &&
          (activeFilters.date === 'all' || row.date === activeFilters.date) &&
          (activeFilters.alert === 'all' ||
            (activeFilters.alert === 'normal'
              ? row.status === 'green'
              : row.status === activeFilters.alert)) &&
          (!activeFilters.search ||
            row.department.toLowerCase().includes(activeFilters.search))
      ),
    [selected, activeFilters, dateFrom, dateTo, daily]
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
        case 'workers':
          cmp = a.workers - b.workers;
          break;
        case 'planHours':
          cmp = a.planHours - b.planHours;
          break;
        case 'otHours':
          cmp = a.actualOtHours - b.actualOtHours;
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

  // Trang c么ng nh芒n do SERVER tr岷?v峄?(膽茫 l峄峜 theo tab + g峄檖 heavyOt n岷縰 c贸).
  const workerViewRows = useMemo<IWorkerOtRecord[]>(
    () => (workerData?.rows ?? []),
    [workerData]
  );

  // Distinct process names cho dropdown (union t峄?daily summary).
  const processOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...daily.map((r) => r.process).filter(Boolean),
          ...(workerData?.rows ?? []).map((r) => r.process),
          ...(rollupRows ?? []).map((r) => r.process),
        ])
      ).sort(),
    [daily, workerData, rollupRows]
  );
  // Danh sách ngày cho bộ lọc "Ngày" (tab Chi tiết bộ phận + Chi tiết từng
  // công nhân, 30/10/2026): lấy từ cả 2 nguồn để tab công nhân không bị rỗng
  // khi bảng ngày×nhóm chưa có dòng.
  const dateOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...daily.map((r) => r.date),
          ...(workerData?.rows ?? []).map((r) => r.date),
          ...(rollupRows ?? []).map((r) => r.date),
        ])
      )
        .sort()
        .reverse(),
    [daily, workerData, rollupRows]
  );

  // Exports the currently visible rows of the active view as an
  // Excel-compatible UTF-8 CSV (with BOM so Vietnamese opens cleanly).
  const handleExport = async () => {
    let header: string[] = [];
    let data: (string | number)[][] = [];
    if (mode === 'process') {
      header = [
        t('table.date'),
        t('table.department'),
        t('table.workers'),
        t('table.otGe4'),
        t('table.overPlan'),
        t('table.planHours'),
        t('table.actualHours'),
        t('table.status'),
      ];
      data = sortedProcessRows.map((r) => [
        r.date,
        r.department,
        r.workers,
        r.otGe4 ?? 0,
        r.overCount ?? 0,
        Math.round(r.planHours * 10) / 10,
        Math.round(r.actualOtHours * 10) / 10,
        r.status === 'neutral' ? '' : r.status === 'green' ? t('otAlert.normal') : t('otAlert.' + r.status),
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
      ];
      // Exports the FULL filtered result (all pages) —b岷g ch峄?gi峄?trang
      // hi峄噉 t岷 n锚n export l岷 l岷 to脿n b峄?t峄?server b岷眓g request l峄沶.
      try {
        setExporting(true);
        const full = await api.records(
          { from: dateFrom, to: dateTo },
          {
            dept: activeFilters.department,
            process: activeFilters.process,
            alert: activeFilters.alert,
            search: activeFilters.search || undefined,
            heavyOt: activeFilters.alert === 'heavyOt',
            status: drillDown?.status,
            drillDept: drillDown?.department,
            page: 1,
            pageSize: 500000,
            sortBy: detailSortKey,
            sortDir: detailSortDir,
          }
        );
        data = full.rows.map((r) => [
          r.date,
          r.department,
          r.workerId,
          r.workerName,
          r.process,
          Math.round((r.planOtMinutes / 60) * 10) / 10,
          r.planIssueDate,
          Math.round((r.actualOtMinutes / 60) * 10) / 10,
        ]);
      } finally {
        setExporting(false);
      }
    } else {
      header = [
        t('table.date'),
        t('table.process'),
        t('table.workers'),
        t('table.otGe4'),
        t('table.planOT'),
        t('table.actualOT'),
        t('table.overPlan'),
        t('table.status'),
      ];
      data = sortedRollup.map((r) => [
        r.date,
        r.process,
        r.workers,
        r.otGe4 ?? 0,
        Math.round((r.plan / 60) * 10) / 10,
        Math.round((r.actual / 60) * 10) / 10,
        r.over,
        r.status === 'neutral' ? '' : r.status === 'green' ? t('otAlert.normal') : t('otAlert.' + r.status),
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

  // G峄檖 theo b峄?ph岷璶 chi ti岷縯 (process) —do SERVER t铆nh s岷祅 qua
  // /overtime/process-rollup (30/10/2026). S峄?d貌ng ≥s峄?ph貌ng ban n锚n
  // kh么ng ph芒n trang server; client ch峄?s岷痯 x岷縫 l岷.
  const processRollup = useMemo(
    () =>
      (rollupRows ?? []).map((row) => ({
        date: row.date,
        process: row.process,
        workers: row.workers,
        otGe4: row.otGe4,
        plan: row.plan,
        actual: row.actual,
        over: row.over,
        status: row.status,
      })),
    [rollupRows]
  );

  // Client-side sorting for the by-process table (default: actual OT desc).
  // 31/10/2026: loc theo NGAY (dropdown) truoc khi sap xep.
  const sortedRollup = useMemo(() => {
    const rows = [...processRollup].filter(
      (r) => activeFilters.date === 'all' || r.date === activeFilters.date
    );
    const dir = sortDir === 'asc' ? 1 : -1;
    const ratioOf = (r: (typeof processRollup)[number]) => (r.plan > 0 ? r.actual / r.plan : 0);
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortKey === 'process') cmp = a.process.localeCompare(b.process);
      else if (sortKey === 'workers') cmp = a.workers - b.workers;
      else if (sortKey === 'plan') cmp = a.plan - b.plan;
      else if (sortKey === 'actual') cmp = a.actual - b.actual;
      else if (sortKey === 'ratio') cmp = ratioOf(a) - ratioOf(b);
      else cmp = a.over - b.over;
      return cmp * dir;
    });
    return rows;
  }, [processRollup, activeFilters.date, sortKey, sortDir]);

  const handleSort = (key: string) => {
    const typedKey = key as SortKey;
    if (typedKey === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(typedKey);
      setSortDir(typedKey === 'process' || typedKey === 'date' ? 'asc' : 'desc');
    }
  };

  // Bấm "số công nhân" / "số lượt vượt kế hoạch" -> chuyển sang bảng công nhân,
  // lọc sẵn đúng bộ phận + bộ phận chi tiết (alert='overPlan' = chỉ dòng thực
  // tế > kế hoạch, do server lọc). date: truyền khi click từ bảng ngày×nhóm
  // ("Chi tiết bộ phận") để tab công nhân mở đúng NGÀY của dòng (30/10/2026),
  // không hiện tất cả bộ phận.
  const goWorkerView = (department: string, process: string, alert: string, date?: string) => {
    setMode('worker');
    setFilters((prev) => ({
      ...prev,
      worker: { department, process, search: '', alert, date: date ?? 'all' },
    }));
    setWorkerPage(1);
  };

  // Loading th岷璽 theo tab: b岷g c么ng nh芒n / g峄檖 process ch峄?fetch t峄?server.
  const loading =
    (mode === 'worker' && workerLoading) ||
    (mode === 'processRollup' && rollupLoading);

  const filteredCount =
    mode === 'process'
      ? processRows.length
      : mode === 'worker'
        ? (workerData?.total ?? 0)
        : sortedRollup.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  // Trang đang hiển thị theo tab đang mở (clamp theo số trang hiện có để không
  // bao giờ nằm ngoài phạm vi sau khi dữ liệu đổi).
  const activePage = Math.min(
    mode === 'worker' ? workerPage : mode === 'processRollup' ? rollupPage : page,
    totalPages
  );
  const changePage = (next: number) => {
    if (mode === 'worker') setWorkerPage(next);
    else if (mode === 'processRollup') setRollupPage(next);
    else setPage(next);
  };
  const pageProcessRows = sortedProcessRows.slice(
    (activePage - 1) * PAGE_SIZE,
    activePage * PAGE_SIZE
  );
  // B岷g c么ng nh芒n: server 膽茫 tr岷?膼脷NG trang (pageSize = PAGE_SIZE).
  const pageWorkerRows = workerViewRows;
  const pageProcessRollupRows = sortedRollup.slice(
    (activePage - 1) * PAGE_SIZE,
    activePage * PAGE_SIZE
  );
  const from = filteredCount === 0 ? 0 : (activePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(activePage * PAGE_SIZE, filteredCount);

  // Totals row: aggregated over the WHOLE filtered result (all pages),
  // never just the visible page —consistent with the pagination counts.
  const processTotals = useMemo(
    () => ({
      workers: processRows.reduce((sum, row) => sum + row.workers, 0),
      // otGe4 đã tính THEO NGÀY từng dòng nên tổng là cộng trực tiếp.
      otGe4: processRows.reduce((sum, row) => sum + (row.otGe4 ?? 0), 0),
      over: processRows.reduce((sum, row) => sum + (row.overCount ?? 0), 0),
      // 31/10/2026: cộng theo minutes CHÍNH XÁC từ server (planOtMinutes/
      // actualOtMinutes) — trước đây cộng planHours*60 của giá trị ĐÃ LÀM TRÒN
      // từng dòng → footer trội ~2.6h so với KPI.
      plan: processRows.reduce((sum, row) => sum + (row.planOtMinutes ?? Math.round(row.planHours * 60)), 0),
      actual: processRows.reduce((sum, row) => sum + (row.actualOtMinutes ?? Math.round(row.actualOtHours * 60)), 0),
    }),
    [processRows]
  );
  // T峄昻g c么ng nh芒n do SERVER t铆nh tr锚n to脿n b峄?k岷縯 qu岷?l峄峜 (kh么ng ch峄?trang).
  const workerTotals = useMemo(
    () => ({
      plan: workerData?.totals.plan ?? 0,
      actual: workerData?.totals.actual ?? 0,
    }),
    [workerData]
  );
  const rollupTotals = useMemo(
    () => ({
      workers: sortedRollup.reduce((sum, row) => sum + row.workers, 0),
      // otGe4 đã tính THEO NGÀY từng dòng nên tổng là cộng trực tiếp.
      otGe4: sortedRollup.reduce((sum, row) => sum + (row.otGe4 ?? 0), 0),
      plan: sortedRollup.reduce((sum, row) => sum + row.plan, 0),
      actual: sortedRollup.reduce((sum, row) => sum + row.actual, 0),
      over: sortedRollup.reduce((sum, row) => sum + row.over, 0),
    }),
    [sortedRollup]
  );

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
            <span className="text-muted-foreground">—</span>
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
      {/* Filter & actions toolbar: dropdowns + search + apply/export */}
      <div className="border-y border-border/60 bg-muted/30 px-4 py-2.5 md:px-6">
        <form
          onSubmit={handleApplyFilters}
          className="flex flex-wrap items-center gap-2"
        >
            {/* Department dropdown —CH峄?tab c贸 c峄檛 nh贸m CUT/SEW/EMB (Chi ti岷縯 b峄?ph岷璶 + Chi ti岷縯 t峄玭g c么ng nh芒n); tab "Theo b峄?ph岷璶 chi ti岷縯" kh么ng c贸 c峄檛 nh贸m n锚n kh么ng l峄峜 */}
            {/* 31/10/2026: dropdown Ngày đứng ĐẦU cho cả 3 tab (trước Bộ phận) */}
            <Select value={draftDate} onValueChange={setDraftDate}>
              <SelectTrigger
                aria-label={t('table.date')}
                className={`h-9 w-[calc(50%-4px)] rounded-lg bg-card text-sm sm:w-[150px] ${filterActive.date ? 'border-primary ring-1 ring-primary/40' : ''}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('table.allDates')}</SelectItem>
                {dateOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {mode !== 'processRollup' && (
              <Select
                value={displayDepartment}
                onValueChange={setDraftDepartment}
                // 31/10/2026: khi đang lọc bằng nút bộ phận dưới KPI (selected ≠
                // 'all'), dữ liệu 3 vùng đã tự lọc theo → dropdown Bộ phận trong
                // Chi tiết tăng ca bị khoá; chỉ mở lại khi chọn "Tất cả bộ phận".
                disabled={selected !== 'all'}
              >
                <SelectTrigger
                  aria-label={t('table.department')}
                  className={`h-9 w-[calc(50%-4px)] rounded-lg bg-card text-sm sm:w-[150px] disabled:cursor-not-allowed disabled:opacity-60 ${filterActive.department ? 'border-primary ring-1 ring-primary/40' : ''}`}
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
            )}

            {mode !== 'process' && (
            <Select value={draftProcess} onValueChange={setDraftProcess}>
              <SelectTrigger
                aria-label={t('table.process')}
                className={`h-9 w-[calc(50%-4px)] rounded-lg bg-card text-sm sm:w-[180px] xl:w-[200px] ${filterActive.process ? 'border-primary ring-1 ring-primary/40' : ''}`}
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
            )}

            {/* 31/10/2026: dropdown TRẠNG THÁI hiện ở cả 3 tab (tab "Chi tiết bộ
                phận" trước đây không có). Tab process chỉ có 4 mức lệch (không có
                mục OT ≥ 4h). */}
            <Select value={draftAlert} onValueChange={setDraftAlert}>
              <SelectTrigger
                aria-label={t('table.otAlert')}
                className={`h-9 w-[calc(50%-4px)] rounded-lg bg-card text-sm sm:w-[160px] ${filterActive.alert ? 'border-primary ring-1 ring-primary/40' : ''}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('table.allAlerts')}</SelectItem>
                {(mode === 'process' || mode === 'processRollup'
                  ? ALERT_FILTER_OPTIONS.filter((level) => level !== 'heavyOt')
                  : ALERT_FILTER_OPTIONS
                ).map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`otAlert.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Free-text search —CH峄?tab "Chi ti岷縯 t峄玭g c么ng nh芒n" (2 tab b峄?ph岷璶 l脿 s峄?li峄噓 g峄檖, kh么ng c贸 m茫/t锚n c么ng nh芒n 膽峄?l峄峜) */}
            {mode === 'worker' && (
              <div className="relative w-full sm:w-[260px] xl:w-[320px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  placeholder={t('table.searchPlaceholder')}
                  className={`h-9 w-full rounded-lg bg-card pl-8 pr-2 text-sm ${filterActive.search ? 'border-primary ring-1 ring-primary/40' : ''}`}
                />
              </div>
            )}

          {/* Actions —cùng hàng với toolbar trên màn hình rộng (xl+), tự canh
              phải; màn hình hẹp hơn xuống hàng cuối và vẫn canh phải (31/10/2026) */}
          <div className="flex gap-2 sm:ml-auto">
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
        <div
          className="w-full overflow-x-auto"
          style={{ minHeight: 524 }}
          // 31/10/2026: giữ vùng bảng ỔN ĐỊNH chiều cao (tiêu đề + 10 dòng + dòng Tổng).
          // Khi chuyển tab / lọc, dòng Tổng từng bị ẩn khi đang tải (điều kiện !loading)
          // → bảng cao hơn/thấp hơn minHeight → phân trang bên dưới bị đẩy lên/xuống (giật).
          // Giờ dòng Tổng luôn hiện (thật hoặc giả khi tải) + minHeight = 524 → đáy cố định.
        >
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
                    label={t('table.workers')}
                    column="workers"
                    sortKey={detailSortKey}
                    sortDir={detailSortDir}
                    onSort={handleDetailSort}
                    alignCenter
                  />
                  <TableHead
                    className="whitespace-nowrap text-center"
                    title={t('table.otGe4Hint')}
                  >
                    {t('table.otGe4')}
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.overPlan')}</TableHead>
                  <SortableHead
                    label={t('table.planHours')}
                    column="planHours"
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
                  <TableHead className="whitespace-nowrap text-center">{t('table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && pageProcessRows.length === 0 ? (
                  <SkeletonRows columns={9} />
                ) : (
                  pageProcessRows.map((row, idx) => (
                    <TableRow key={row.id} className="h-11 even:bg-muted/25">
                      <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                        {(activePage - 1) * PAGE_SIZE + idx + 1}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                        {row.date}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <DepartmentBadge departmentCode={row.department} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums">
                        <button
                          type="button"
                          onClick={() => goWorkerView(row.department, 'all', 'all', row.date)}
                          className="inline-flex cursor-pointer items-center justify-center rounded-md px-1.5 py-0.5 font-medium text-primary underline-offset-4 hover:underline"
                          title={t('table.drillToWorkers')}
                        >
                          {row.workers}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums">
                        {row.otGe4 ?? 0}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums">
                        {row.overCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => goWorkerView(row.department, 'all', 'overPlan', row.date)}
                            className="inline-flex cursor-pointer items-center justify-center rounded-md px-1.5 py-0.5 font-semibold text-warning underline-offset-4 hover:underline"
                            title={t('table.drillToOver')}
                          >
                            {row.overCount}
                          </button>
                        ) : (
                          row.overCount
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums">
                        {formatHoursFromMinutes(row.planHours * 60)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums font-medium">
                        {formatHoursFromMinutes(row.actualOtHours * 60)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
                            (RANGE_STATUS_META[row.status] ?? RANGE_STATUS_META.neutral).badge
                          )}
                        >
                          {(RANGE_STATUS_META[row.status] ?? RANGE_STATUS_META.neutral).labelKey
                            ? t((RANGE_STATUS_META[row.status] ?? RANGE_STATUS_META.neutral).labelKey)
                            : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {processRows.length > 0 ? (
                <TableFooter>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableCell
                      colSpan={3}
                      className="whitespace-nowrap text-left font-semibold text-foreground"
                    >
                      {t('table.totalRow')}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums">
                      {processTotals.workers}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums">
                      {processTotals.otGe4}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums">
                      {processTotals.over}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums">
                      {formatHoursFromMinutes(processTotals.plan)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums text-destructive">
                      {formatHoursFromMinutes(processTotals.actual)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center" />
                  </TableRow>
                </TableFooter>
              ) : loading ? (
                <TableFooter>
                  <TotalRowSkeleton columns={9} />
                </TableFooter>
              ) : null}
            </Table>
          ) : mode === 'worker' ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 whitespace-nowrap text-center">#</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.date')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.department')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.process')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.workerId')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.workerName')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.planHours')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.planIssueDate')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.actualHours')}</TableHead>
                  <TableHead className="whitespace-nowrap text-center">{t('table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* 31/10/2026: KHÔNG thay rows bằng skeleton khi đổi trang — worker phân
                    trang server nên chờ tải; giữ rows CŨ hiển thị (như tab process) để nội
                    dung không biến mất/nhấp nháy khi bấm Trước/Sau. Skeleton chỉ khi chưa
                    có dữ liệu lần đầu (rows rỗng). */}
                {loading && pageWorkerRows.length === 0 ? (
                  <SkeletonRows columns={10} />
                ) : (
                  pageWorkerRows.map((row, idx) => {
                    const level = getOtAlertLevel(row.planOtMinutes, row.actualOtMinutes);
                    return (
                      <TableRow key={row.id} className="h-11 even:bg-muted/25">
                        <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                          {(activePage - 1) * PAGE_SIZE + idx + 1}
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
                        <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                          {row.workerId}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center font-medium">
                          {row.workerName}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.planOtMinutes > 0 ? formatHoursFromMinutes(row.planOtMinutes) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                          {row.planIssueDate}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {formatHoursFromMinutes(row.actualOtMinutes)}
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
              {workerViewRows.length > 0 ? (
                <TableFooter>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableCell
                      colSpan={6}
                      className="whitespace-nowrap text-left font-semibold text-foreground"
                    >
                      {t('table.totalRow')}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums">
                      {formatHoursFromMinutes(workerTotals.plan)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center" />
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums text-destructive">
                      {formatHoursFromMinutes(workerTotals.actual)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center" />
                    <TableCell className="whitespace-nowrap text-center" />
                  </TableRow>
                </TableFooter>
              ) : loading ? (
                <TableFooter>
                  <TotalRowSkeleton columns={10} />
                </TableFooter>
              ) : null}
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 whitespace-nowrap text-center">#</TableHead>
                  <SortableHead
                    label={t('table.date')}
                    column="date"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    alignCenter
                  />
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
                  <TableHead
                    className="whitespace-nowrap text-center"
                    title={t('table.otGe4Hint')}
                  >
                    {t('table.otGe4')}
                  </TableHead>
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
                    label={t('table.overPlan')}
                    column="over"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    alignCenter
                  />
                  <TableHead className="whitespace-nowrap text-center">{t('table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && pageProcessRollupRows.length === 0 ? (
                  <SkeletonRows columns={9} />
                ) : (
                  pageProcessRollupRows.map((row, idx) => {
                    return (
                      <TableRow key={row.date + '::' + row.process} className="h-11 even:bg-muted/25">
                        <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                          {(activePage - 1) * PAGE_SIZE + idx + 1}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums text-muted-foreground">
                          {row.date}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <ProcessBadge processName={row.process} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          <button
                            type="button"
                            onClick={() => goWorkerView('all', row.process, 'all', row.date)}
                            className="inline-flex cursor-pointer items-center justify-center rounded-md px-1.5 py-0.5 font-medium text-primary underline-offset-4 hover:underline"
                            title={t('table.drillToWorkers')}
                          >
                            {row.workers}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.otGe4 ?? 0}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.plan > 0 ? formatHoursFromMinutes(row.plan) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {formatHoursFromMinutes(row.actual)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center tabular-nums">
                          {row.over > 0 ? (
                            <button
                              type="button"
                              onClick={() => goWorkerView('all', row.process, 'overPlan', row.date)}
                              className="inline-flex cursor-pointer items-center justify-center rounded-md px-1.5 py-0.5 font-semibold text-warning underline-offset-4 hover:underline"
                              title={t('table.drillToOver')}
                            >
                              {row.over}
                            </button>
                          ) : (
                            row.over
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
                              (RANGE_STATUS_META[row.status] ?? RANGE_STATUS_META.neutral).badge
                            )}
                          >
                            {(RANGE_STATUS_META[row.status] ?? RANGE_STATUS_META.neutral).labelKey
                              ? t((RANGE_STATUS_META[row.status] ?? RANGE_STATUS_META.neutral).labelKey)
                              : '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {sortedRollup.length > 0 ? (
                <TableFooter>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableCell
                      colSpan={2}
                      className="whitespace-nowrap text-left font-semibold text-foreground"
                    >
                      {t('table.totalRow')}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums">
                      {rollupTotals.workers}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums">
                      {rollupTotals.otGe4}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums">
                      {formatHoursFromMinutes(rollupTotals.plan)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums text-destructive">
                      {formatHoursFromMinutes(rollupTotals.actual)}
                    </TableCell>
                    {/* Tỷ lệ OT is a per-process rate, never summed. */}
                    <TableCell className="whitespace-nowrap text-center" />
                    <TableCell className="whitespace-nowrap text-center font-semibold tabular-nums">
                      {rollupTotals.over}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center" />
                  </TableRow>
                </TableFooter>
              ) : loading ? (
                <TableFooter>
                  <TotalRowSkeleton columns={9} />
                </TableFooter>
              ) : null}
            </Table>
          )}
        </div>
        <div style={{ minHeight: 52 }}>
          {loading && filteredCount === 0 ? (
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
                disabled={activePage <= 1}
                onClick={() => {
                  changePage(Math.max(1, activePage - 1));
                }}
              >
                <ChevronLeft className="size-4" />
                {t('table.prev')}
              </Button>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {t('table.pageOf', { page: activePage, totalPages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={activePage >= totalPages}
                onClick={() => {
                  changePage(Math.min(totalPages, activePage + 1));
                }}
              >
                {t('table.next')}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  );
});
