import { memo, useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { CalendarX, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  filterDepartments,
  type DepartmentFilter,
} from '@/data/deptseries';
import type { IDepartmentTrendData } from '@/data/departmenttrenddata';
import type { IMonthlyData } from '@/data/monthlydata';
import { ACTUAL_COLOR, CHART_FONT_FAMILY, PLAN_COLOR } from '@/lib/chart-colors';
import { formatNumber } from '@/lib/format-number';
import { monthsInRange } from '@/lib/date-range';

interface MonthlyPlanSectionProps {
  selected: DepartmentFilter;
  dateFrom: string;
  dateTo: string;
  monthly: IMonthlyData[];
  deptTrend: IDepartmentTrendData[];
}

// "Month 8" (data label) → localized "Tháng 8" / "8月" / "Month 8".
function useMonthLabel() {
  const { t } = useTranslation();
  return (month: string) =>
    t('common.month', { n: Number(month.replace(/\D/g, '')) });
}

export default memo(function MonthlyPlanSection({
  selected,
  dateFrom,
  dateTo,
  monthly,
  deptTrend,
}: MonthlyPlanSectionProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const isMobile = useIsMobile();
  const monthLabel = useMonthLabel();

  // Unified with the header date-range search: only months whose calendar
  // period intersects the applied [dateFrom, dateTo] window are rendered.
  // "All" shows the monthly OT totals; a department selection shows the REAL
  // plan/actual of those departments from department-trend (03/11/2026: bỏ
  // cách ước "share theo tỷ lệ actual" cũ — plan của bộ phận lấy trực tiếp
  // planHours = Σ sheet_hour sheet_sta=1, khớp dòng Tổng tab chi tiết).
  const rows = useMemo(() => {
    const months = monthsInRange(dateFrom, dateTo);
    if (selected === 'all') {
      return monthly
        .filter((d) => months.includes(d.month))
        .map((d) => ({
          month: d.month,
          plan: d.planOtHours,
          actual: d.actualOtHours,
        }));
    }
    const departments = filterDepartments(selected);
    return months.map((month) => {
      const monthRows = deptTrend.filter(
        (row) => row.month === month && departments.includes(row.department)
      );
      const plan = monthRows.reduce((sum, row) => sum + (row.planHours ?? 0), 0);
      const actual = monthRows.reduce((sum, row) => sum + row.hours, 0);
      return {
        month,
        plan,
        actual,
      };
    });
  }, [selected, dateFrom, dateTo, monthly, deptTrend]);

  const planName = t('common.plan');
  const actualName = t('common.actual');
  const hoursUnit = t('common.hours');

  // 03/11/2026: định dạng số cho người xem — phân cách hàng nghìn bằng dấu
  // phẩy + 2 chữ số thập phân (51,125,77 ; 59,614,00).
  const format2 = (v: number) => formatNumber(v, 2);

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        textStyle: { fontFamily: CHART_FONT_FAMILY },
        valueFormatter: (value) => `${format2(Number(value))} ${hoursUnit}`,
      },
      // Fixed margins (containLabel off) keep the plot area identical to the
      // DepartmentTrendSection chart beside it (which reserves 84px on the
      // right for its vertical legend), so the month labels of both cards
      // line up vertically.
      grid: isMobile
        ? { left: 48, right: 16, top: 24, bottom: 40 }
        : { left: 48, right: 84, top: 24, bottom: 40 },
      xAxis: {
        type: 'category',
        data: rows.map((r) => monthLabel(r.month)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: { color: '#64748B', fontFamily: CHART_FONT_FAMILY },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#64748B',
          fontFamily: CHART_FONT_FAMILY,
          formatter: (value: number) => formatNumber(value, 0),
        },
        splitLine: { lineStyle: { color: '#E2E8F0' } },
      },
      series: [
        {
          name: planName,
          type: 'bar',
          data: rows.map((r) => r.plan),
          barWidth: 36,
          itemStyle: { color: PLAN_COLOR, borderRadius: [6, 6, 0, 0] },
          label: {
            show: true,
            position: 'top',
            color: '#475569',
            fontSize: 11,
            fontFamily: CHART_FONT_FAMILY,
            formatter: (params) => format2(Number(params.value)),
          },
        },
        {
          name: actualName,
          type: 'bar',
          data: rows.map((r) => r.actual),
          barWidth: 36,
          itemStyle: { color: ACTUAL_COLOR, borderRadius: [6, 6, 0, 0] },
          label: {
            show: true,
            position: 'top',
            color: '#475569',
            fontSize: 11,
            fontFamily: CHART_FONT_FAMILY,
            formatter: (params) => format2(Number(params.value)),
          },
        },
      ],
    }),
    [rows, planName, actualName, hoursUnit, monthLabel, locale]
  );

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="size-5 text-primary" />
            {t('chart.monthlyOtTrend')}
          </CardTitle>
          {/* Bar-style legend under the title — same layout classes as the
              neighboring chart header so both headers stay the same height */}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-3 rounded-[2px]"
                style={{ backgroundColor: PLAN_COLOR }}
              />
              {planName}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-3 rounded-[2px]"
                style={{ backgroundColor: ACTUAL_COLOR }}
              />
              {actualName}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
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
