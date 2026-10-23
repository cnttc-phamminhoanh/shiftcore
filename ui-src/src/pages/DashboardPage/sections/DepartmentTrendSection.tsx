import { memo, useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { CalendarX, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  filterDepartments,
  type DepartmentFilter,
} from '@/data/deptseries';
import type { IDepartmentTrendData } from '@/data/departmenttrenddata';
import { CHART_FONT_FAMILY, DEPARTMENT_COLORS } from '@/lib/chart-colors';
import { monthsInRange } from '@/lib/date-range';

interface DepartmentTrendSectionProps {
  selected: DepartmentFilter;
  dateFrom: string;
  dateTo: string;
  deptTrend: IDepartmentTrendData[];
}

// Tooltip entry delivered by ECharts item-trigger (shape is ours to declare).
interface TooltipParam {
  seriesId: string;
  seriesName: string;
  value: number;
  marker: string;
  name?: string;
  dataIndex?: number;
}

// Plan hours demo: suy ra từ actual API (tỉ lệ mock, làm tròn chục).
const PLAN_RATIO: Record<string, number> = {
  CUT: 0.93, SEW: 0.92, EMB: 0.9, PRI: 0.9, FIN: 0.92, OTHER: 0.95, PAC: 0.94,
};

export default memo(function DepartmentTrendSection({
  selected,
  dateFrom,
  dateTo,
  deptTrend,
}: DepartmentTrendSectionProps) {
  const planHoursFor = (dept: string, month: string) => {
    const actual =
      deptTrend.find((row) => row.department === dept && row.month === month)
        ?.hours ?? 0;
    const ratio = PLAN_RATIO[dept] ?? 0.9;
    return Math.round((actual * ratio) / 10) * 10;
  };
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const isMobile = useIsMobile();
  const hoursUnit = t('common.hours');

  // "Month 8" (data label) → localized "Tháng 8" / "8月".
  const monthLabel = (month: string) =>
    t('common.month', { n: Number(month.replace(/\D/g, '')) });

  const departments = filterDepartments(selected);

  // Chart display names: department codes stay as-is, the aggregated
  // OTHER bucket is localized to match the filter chip / table badge.
  const deptLabel = (dept: string) => (dept === 'OTHER' ? t('filter.other') : dept);
  const displayNames = departments.map(deptLabel);

  // Unified with the header date-range search: only months whose calendar
  // period intersects the applied [dateFrom, dateTo] window are shown.
  const visibleMonths = useMemo(
    () => monthsInRange(dateFrom, dateTo),
    [dateFrom, dateTo]
  );

  const option = useMemo<EChartsOption>(() => {
    const series = [
      // Actual series first (stacked areas, solid lines, filled symbols).
      ...departments.map((dept) => ({
        id: `${dept}-actual`,
        name: deptLabel(dept),
        type: 'line' as const,
        stack: 'actual',
        data: visibleMonths.map(
          (month) =>
            deptTrend.find(
              (row) => row.department === dept && row.month === month
            )?.hours ?? 0
        ),
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: DEPARTMENT_COLORS[dept] },
        itemStyle: { color: DEPARTMENT_COLORS[dept] },
        // No area fill below the lines (per user request) — lines only.
        emphasis: { focus: 'series' as const },
        z: 2,
      })),
      // Plan series second (own stack, dashed lines, hollow symbols, no fill).
      ...departments.map((dept) => ({
        id: `${dept}-plan`,
        name: deptLabel(dept),
        type: 'line' as const,
        stack: 'plan',
        data: visibleMonths.map((month) => planHoursFor(dept, month)),
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 1.5, type: 'dashed' as const, color: DEPARTMENT_COLORS[dept] },
        itemStyle: {
          color: '#FFFFFF',
          borderColor: DEPARTMENT_COLORS[dept],
          borderWidth: 1.5,
        },
        emphasis: { focus: 'series' as const },
        z: 3,
      })),
    ];

    return {
      tooltip: {
        // Item-triggered: the tooltip follows the pointer and only shows the
        // hovered series' department — not the full stacked list at once.
        trigger: 'item',
        textStyle: { fontFamily: CHART_FONT_FAMILY },
        formatter: (params: unknown) => {
          const p = params as TooltipParam;
          const dept = p.seriesId.replace(/-(actual|plan)$/, '');
          const isPlan = p.seriesId.endsWith('-plan');
          const month = visibleMonths[p.dataIndex ?? 0];
          const actual =
            deptTrend.find(
              (row) => row.department === dept && row.month === month
            )?.hours ?? 0;
          const plan = planHoursFor(dept, month);
          const color =
            DEPARTMENT_COLORS[dept as keyof typeof DEPARTMENT_COLORS] ?? '#64748B';
          const row = (label: string, value: number, strong: boolean) =>
            `<div style="color:#334155;font-size:12px;">${label}: ` +
            `${strong ? `<b>${value}</b>` : value} ${hoursUnit}` +
            `</div>`;
          return (
            `<div style="font-family:${CHART_FONT_FAMILY};">` +
            `<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">` +
            `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>` +
            `<span style="font-weight:600;color:#0F172A;">${deptLabel(dept)}</span>` +
            `<span style="color:#64748B;font-size:11px;">${monthLabel(month)}</span>` +
            `</div>` +
            row(t('common.actual'), actual, !isPlan) +
            row(t('common.plan'), plan, isPlan) +
            `</div>`
          );
        },
      },
      // Legend is a horizontal scrollable row above the plot (all viewports)
      // so the plot area keeps the full card width and its month ticks line
      // up with the MonthlyPlanSection chart beside it.
      // Desktop: vertical process legend on the right side (per the reference
      // design). Mobile: horizontal scrollable legend above the chart so the
      // plot keeps its full width. Only dept names are listed (plan series
      // share the same name and toggle together with their actual counterpart).
      legend: isMobile
        ? {
            type: 'scroll',
            orient: 'horizontal',
            top: 0,
            left: 0,
            right: 8,
            icon: 'circle',
            itemWidth: 8,
            itemHeight: 8,
            textStyle: {
              color: '#475569',
              fontSize: 12,
              fontWeight: 500,
              fontFamily: CHART_FONT_FAMILY,
            },
            data: displayNames,
          }
        : {
            orient: 'vertical',
            right: 0,
            top: 'middle',
            icon: 'circle',
            itemWidth: 8,
            itemHeight: 8,
            itemGap: 12,
            textStyle: {
              color: '#475569',
              fontSize: 12,
              fontWeight: 500,
              fontFamily: CHART_FONT_FAMILY,
            },
            data: displayNames,
          },
      // Fixed margins (containLabel off) mirror MonthlyPlanSection exactly,
      // keeping both cards' month labels and 0 baselines on the same lines.
      // Desktop reserves 84px on the right for the vertical legend; the left
      // chart reserves the same space so the plot areas stay identical.
      grid: isMobile
        ? { left: 48, right: 16, top: 60, bottom: 40 }
        : { left: 48, right: 84, top: 24, bottom: 40 },
      xAxis: {
        type: 'category',
        // Default boundaryGap (true) matches the bar chart so the month
        // category centers land on identical x positions in both cards.
        data: visibleMonths.map((month) => monthLabel(month)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: { color: '#64748B', fontFamily: CHART_FONT_FAMILY },
      },
      yAxis: {
        type: 'value',
        name: t('chart.timeHoursLabel'),
        nameTextStyle: {
          color: '#64748B',
          fontFamily: CHART_FONT_FAMILY,
          padding: [0, 0, 4, 0],
        },
        axisLabel: {
          color: '#64748B',
          fontFamily: CHART_FONT_FAMILY,
          formatter: (value: number) => value.toLocaleString(locale),
        },
        splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } },
      },
      series,
    };
  }, [departments, displayNames, visibleMonths, t, locale, hoursUnit, isMobile, deptTrend]);

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Clock className="size-5 text-primary" />
              {t('chart.processTimeTrend')}
          </CardTitle>
          {/* Line-style legend: solid = actual, dashed = plan */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-5 border-t-2 border-solid border-foreground/60" />
              <span className="inline-block size-2 rounded-full bg-foreground/60" />
              {t('chart.actualTimeSeries')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0 w-5 border-t-2 border-dashed border-foreground/60" />
              <span className="inline-block size-2 rounded-full border-[1.5px] border-foreground/60 bg-white" />
              {t('chart.planTimeSeries')}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visibleMonths.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 px-6 text-center"
            style={{ height: isMobile ? 280 : 320 }}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <CalendarX className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {t('chart.emptyRangeTitle')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('chart.emptyRangeHint')}
            </p>
          </div>
        ) : (
          <ReactECharts
            option={option}
            notMerge
            style={{ height: isMobile ? 280 : 320 }}
          />
        )}
      </CardContent>
    </Card>
  );
});
