import { memo, useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { AlertTriangle, RefreshCw, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getDepartmentBadgeMeta } from '@/components/DepartmentBadge';
import { useIsMobile } from '@/hooks/use-mobile';
import { filterDepartments, type DepartmentFilter } from '@/data/deptseries';
import type { IWorkerOtRecord } from '@/data/otrecords';
import { CHART_FONT_FAMILY, DEPARTMENT_COLORS } from '@/lib/chart-colors';
import {
  countWorkerOtSpikesByDepartment,
  OT_WORKER_ALERT_COLORS,
  SPIKE_DEPARTMENT_GROUPS,
  type IDepartmentSpikeStats,
  type WorkerOtAlertStatus,
} from '@/lib/worker-ot-status';

interface WorkerOTByDepartmentSectionProps {
  selected: DepartmentFilter;
  dateFrom: string;
  dateTo: string;
  onDrillDown?: (department: string, status: WorkerOtAlertStatus) => void;
  records: IWorkerOtRecord[];
}

// Item-triggered tooltip payload (carries the hovered department bar).
interface TooltipParam {
  dataIndex: number;
}

// Click payload delivered by ECharts on a department bar.
interface ClickParam {
  componentType?: string;
  seriesId?: string;
  dataIndex?: number;
}

// Fixed height inside the 300–350px band — the chart never stretches with the
// number of workers, it always shows exactly the seven department groups.
const CHART_HEIGHT_DESKTOP = 330;
const CHART_HEIGHT_MOBILE = 300;

// Fixed grid margins (containLabel off) so the HTML icon strip below the
// canvas lines up slot-for-slot with the seven category bands.
const GRID_LEFT = 46;
const GRID_RIGHT = 12;

// Very light top-to-bottom fade of the threshold color (solid at the top,
// ~90% alpha at the base) — subtle, never glaring.
const thresholdBarColor = (color: string) => ({
  type: 'linear' as const,
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color },
    { offset: 1, color: `${color}E6` },
  ],
});

// Small threshold legend under the chart — the ranges are per working day,
// mirroring getOTWorkerAlert in the (simulated backend) lib module.
const THRESHOLD_LEGEND: { range: string; level: 'normal' | 'watch' | 'high' | 'critical' }[] = [
  { range: '<5', level: 'normal' },
  { range: '5–7', level: 'watch' },
  { range: '8–10', level: 'high' },
  { range: '>10', level: 'critical' },
];

// Loading placeholder — seven pulsing columns echoing the fixed layout.
function ChartSkeleton({ isMobile }: { isMobile: boolean }) {
  const heights = [72, 56, 88, 44, 62, 38, 50];
  return (
    <div
      className="flex items-end gap-2 px-2 pt-6 sm:gap-4"
      style={{ height: isMobile ? CHART_HEIGHT_MOBILE : CHART_HEIGHT_DESKTOP }}
    >
      {heights.map((height, index) => (
        <div key={index} className="flex h-full flex-1 flex-col justify-end">
          <div className="mx-auto mb-2 h-3 w-6 animate-pulse rounded bg-muted" />
          <div
            className="w-full animate-pulse rounded-t-md"
            style={{
              height: `${height}%`,
              backgroundColor: 'rgba(220, 53, 69, 0.25)',
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default memo(function WorkerOTByDepartmentSection({
  selected,
  dateFrom,
  dateTo,
  onDrillDown,
  records,
}: WorkerOTByDepartmentSectionProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Simulates the async cadence of the future by-department spike endpoint —
  // a filter change or a retry re-runs the "fetch" and shows the skeleton.
  // The card follows the shared date-range + department-chip filters only;
  // no in-card filters are duplicated here.
  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(timer);
  }, [selected, dateFrom, dateTo, reloadKey]);
  const { inRange, hasError } = useMemo(() => {
    try {
      if (!Array.isArray(records)) {
        throw new Error('Worker OT source is unavailable');
      }
      const departments = filterDepartments(selected);
      return {
        inRange: records.filter(
          (record) =>
            departments.includes(record.department) &&
            (!dateFrom || record.date >= dateFrom) &&
            (!dateTo || record.date <= dateTo)
        ),
        hasError: false,
      };
    } catch {
      return { inRange: [], hasError: true };
    }
  }, [selected, dateFrom, dateTo, records]);

  const stats = useMemo<IDepartmentSpikeStats | null>(
    () => (hasError ? null : countWorkerOtSpikesByDepartment(inRange)),
    [hasError, inRange]
  );

  const option = useMemo<EChartsOption>(() => {
    return {
      tooltip: {
        // Item trigger: hovering a bar shows the department's worst day
        // (the number the bar/color are judged against), the range total
        // and the threshold alert level — so multi-day totals can never be
        // misread as a single-day count.
        trigger: 'item',
        backgroundColor: '#FFFFFF',
        borderWidth: 0,
        borderRadius: 12,
        padding: [10, 14],
        textStyle: { color: '#334155', fontFamily: CHART_FONT_FAMILY },
        extraCssText: 'box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);',
        formatter: (params: unknown) => {
          const p = params as TooltipParam;
          const bucket = stats?.buckets[p.dataIndex];
          if (!bucket) return '';
          const name =
            bucket.department === 'OTHER'
              ? t('filter.other')
              : bucket.department;
          const line = (text: string) =>
            `<div style="display:flex;align-items:center;gap:6px;color:#334155;font-size:12px;">${text}</div>`;
          const statusLabel = t(`chart.spikeAlert.${bucket.alert.level}`);
          return (
            `<div style="font-family:${CHART_FONT_FAMILY};min-width:200px;">` +
            `<div style="font-weight:600;color:#172B4D;margin-bottom:4px;">${name}</div>` +
            (bucket.peakDate
              ? line(
                  `${t('chart.spikeDeptPeakDateLabel')}: <b>${bucket.peakDate}</b>`
                )
              : '') +
            line(
              `<b>${bucket.maxDailyWorkers}</b>&nbsp;${t('chart.spikeDeptTooltipWorkers')}`
            ) +
            line(
              `${t('chart.spikeDeptTotalLabel')}: <b>${bucket.workerDays}</b>&nbsp;${t('chart.spikeDeptWorkerDaysUnit')}`
            ) +
            line(
              `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${bucket.alert.color};"></span>` +
                `${t('chart.spikeDeptAlertLabel')}: <b>${statusLabel}</b>`
            ) +
            `</div>`
          );
        },
      },
      // Fixed margins (no containLabel) so the icon strip below aligns with
      // the seven category bands; x-axis labels are rendered as HTML.
      grid: {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: 34,
        bottom: 6,
      },
      xAxis: {
        type: 'category',
        data: [...SPIKE_DEPARTMENT_GROUPS],
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { show: false },
      },
      yAxis: {
        type: 'value',
        // Worker counts are whole numbers — no fractional ticks.
        minInterval: 1,
        name: t('chart.spikeDeptWorkersAxis'),
        nameTextStyle: {
          color: '#64748B',
          fontSize: 11,
          fontFamily: CHART_FONT_FAMILY,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#64748B', fontFamily: CHART_FONT_FAMILY },
        splitLine: { lineStyle: { color: '#E8EDF5', type: 'dashed' } },
      },
      series: [
        {
          id: 'deptSpike',
          type: 'bar',
          // Bar height AND color are both driven by maxDailyWorkers — the
          // department's worst single day in the range — via the threshold
          // bands (<=5 green, 6-8 yellow, 9-10 orange, >=11 red). Department
          // identity stays on the axis icons/names only, never the bars.
          data: (stats?.buckets ?? []).map((bucket) => ({
            value: bucket.maxDailyWorkers,
            itemStyle: {
              color: thresholdBarColor(bucket.alert.color),
              borderRadius: [10, 10, 0, 0],
            },
          })),
          barMaxWidth: 56,
          barCategoryGap: '35%',
          // Worker-day count on top of every bar.
          label: {
            show: true,
            position: 'top',
            color: '#172B4D',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: CHART_FONT_FAMILY,
          },
          z: 3,
        },
      ],
    };
  }, [stats, t]);

  // Clicking a bar drills the per-worker detail table down to that
  // department with the RED (spike, actual OT >= 4h) status, wired through
  // the dashboard page exactly like the per-worker spike chart.
  const handleChartClick = (params: unknown) => {
    if (!onDrillDown) return;
    const p = params as ClickParam;
    if (p.componentType !== 'series' || p.seriesId !== 'deptSpike') return;
    const bucket = stats?.buckets[p.dataIndex ?? -1];
    if (!bucket || bucket.maxDailyWorkers <= 0) return;
    onDrillDown(bucket.department, 'red');
  };

  const onEvents = useMemo(
    () => ({ click: handleChartClick }),
    [stats, onDrillDown]
  );

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-[#172B4D]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#DC3545]/10">
              <Users className="size-4 text-[#DC3545]" />
            </span>
            {t('chart.spikeDeptTitle')}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ChartSkeleton isMobile={isMobile} />
        ) : hasError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {t('chart.workerOtError')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('chart.workerOtErrorHint')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw className="size-4" />
              {t('common.retry')}
            </Button>
          </div>
        ) : !stats || stats.totalWorkerDays === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Users className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {t('chart.workerOtEmpty')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('chart.workerOtEmptyHint')}
            </p>
          </div>
        ) : (
          <>
            {/* Fixed height regardless of the worker count — always exactly
                the seven department groups. */}
            <ReactECharts
              option={option}
              notMerge
              onEvents={onEvents}
              style={{
                height: isMobile
                  ? CHART_HEIGHT_MOBILE
                  : CHART_HEIGHT_DESKTOP,
              }}
            />
            {/* Department axis rendered as HTML so each group gets its badge
                icon + code + localized full name; margins mirror the ECharts
                grid so the seven slots line up exactly. */}
            <div
              className="mt-1 grid grid-cols-7 gap-1"
              style={{ paddingLeft: GRID_LEFT, paddingRight: GRID_RIGHT }}
            >
              {SPIKE_DEPARTMENT_GROUPS.map((code) => {
                const meta = getDepartmentBadgeMeta(code);
                const Icon = meta.icon;
                return (
                  <div
                    key={code}
                    className="flex min-w-0 flex-col items-center gap-0.5 text-center"
                  >
                    <Icon
                      className="size-4 shrink-0"
                      style={{ color: DEPARTMENT_COLORS[code] }}
                      aria-hidden
                    />
                    <span className="text-[11px] font-semibold leading-tight text-[#172B4D]">
                      {code === 'OTHER' ? t('filter.other') : code}
                    </span>
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {t(`chart.spikeDeptName.${code}`)}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Threshold legend — the ranges count workers per working day,
                mirroring getOTWorkerAlert in the lib module. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
              <span className="font-medium text-[#172B4D]">
                {t('chart.spikeLegendTitle')}
              </span>
              {THRESHOLD_LEGEND.map((item) => (
                <span key={item.level} className="flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: OT_WORKER_ALERT_COLORS[item.level],
                    }}
                    aria-hidden
                  />
                  <span className="font-medium tabular-nums">{item.range}</span>
                  <span>{t(`chart.spikeAlert.${item.level}`)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});
