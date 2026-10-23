import '@/i18n';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { DepartmentFilter } from '@/data/deptseries';
import type { WorkerOtAlertStatus } from '@/lib/worker-ot-status';
import {
  SAMPLE_FROM,
  SAMPLE_TO,
  computeSearchDays,
} from '@/lib/sample-period';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import DashboardHeaderSection from './sections/DashboardHeaderSection';
import KpiCardsSection from './sections/KpiCardsSection';
import DepartmentFilterSection from './sections/DepartmentFilterSection';
import MonthlyPlanSection from './sections/MonthlyPlanSection';
import DepartmentTrendSection from './sections/DepartmentTrendSection';
import WorkerOTByDepartmentSection from './sections/WorkerOTByDepartmentSection';
import DailySummarySection from './sections/DailySummarySection';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [department, setDepartment] = useState<DepartmentFilter>('all');
  // Applied search window, committed from the header's draft date inputs.
  // Its day count feeds the Actual OT warning thresholds, so applying a new
  // range recomputes the card colour automatically.
  const [dateFrom, setDateFrom] = useState(SAMPLE_FROM);
  const [dateTo, setDateTo] = useState(SAMPLE_TO);
  const searchDays = useMemo(
    () => computeSearchDays(dateFrom, dateTo),
    [dateFrom, dateTo]
  );

  // Dữ liệu từ backend /api (DEMO=1 → số mẫu; DEMO=0 → số DB thật).
  const { cards, monthly, deptTrend, daily, records, error } =
    useDashboardData({ from: dateFrom, to: dateTo });
  // Drill-down from the by-department spike-OT chart into the per-worker
  // detail table (department + red absolute-OT status), cleared via the
  // banner chip.
  const [otDrillDown, setOtDrillDown] = useState<{
    department: string;
    status: WorkerOtAlertStatus;
  } | null>(null);

  const handleDrillDown = (department: string, status: WorkerOtAlertStatus) => {
    setOtDrillDown((prev) =>
      prev?.department === department && prev.status === status
        ? prev
        : { department, status }
    );
    // Bring the filtered per-worker table into view.
    window.setTimeout(() => {
      document
        .getElementById('ot-worker-detail')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  // Applying a range updates the shared search window (warning thresholds
  // recompute) and reminds the user that row-level figures are illustrative
  // sample data until the production API is connected.
  const handleApplyRange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    toast.info(t('common.sampleDataToast'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/40">
      <DashboardHeaderSection
        dateFrom={dateFrom}
        dateTo={dateTo}
        onApplyRange={handleApplyRange}
      />
      <main className="w-full space-y-5 px-4 py-5 md:space-y-8 md:px-6 md:py-8 lg:px-8">
        <KpiCardsSection searchDays={searchDays} cards={cards} />
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Lỗi tải dữ liệu: {error}
          </div>
        )}
        <DepartmentFilterSection selected={department} onChange={setDepartment} />
        {/* Charts share one row on everything above mobile; stack only <md */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <MonthlyPlanSection
            selected={department}
            dateFrom={dateFrom}
            dateTo={dateTo}
            monthly={monthly}
            deptTrend={deptTrend}
          />
          <DepartmentTrendSection
            selected={department}
            dateFrom={dateFrom}
            dateTo={dateTo}
            deptTrend={deptTrend}
          />
        </div>
        {/* Worker-days with actual OT >= 4h per department — always the 7
            fixed groups (CUT..PAC + Other), bar colors synced with the
            department badges, bar click drills the per-worker detail table */}
        <WorkerOTByDepartmentSection
          selected={department}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDrillDown={handleDrillDown}
          records={records}
        />
        <div id="ot-worker-detail" className="scroll-mt-4">
          <DailySummarySection
            selected={department}
            dateFrom={dateFrom}
            dateTo={dateTo}
            drillDown={otDrillDown}
            onClearDrillDown={() => setOtDrillDown(null)}
            daily={daily}
            records={records}
          />
        </div>
        <p className="pb-2 text-center text-xs text-muted-foreground">
          {t('common.sampleDataFooter')}
        </p>
      </main>
    </div>
  );
}
