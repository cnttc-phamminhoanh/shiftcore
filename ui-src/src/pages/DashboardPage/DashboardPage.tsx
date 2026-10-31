import '@/i18n';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { DepartmentFilter } from '@/data/deptseries';
import type { WorkerOtAlertStatus } from '@/lib/worker-ot-status';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import {
  SAMPLE_FROM,
  SAMPLE_TO,
  computeSearchDays,
} from '@/lib/sample-period';
import DashboardHeaderSection from './sections/DashboardHeaderSection';
import KpiCardsSection from './sections/KpiCardsSection';
import DepartmentFilterSection from './sections/DepartmentFilterSection';
import MonthlyPlanSection from './sections/MonthlyPlanSection';
import DepartmentTrendSection from './sections/DepartmentTrendSection';
import DailySummarySection from './sections/DailySummarySection';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [department, setDepartment] = useState<DepartmentFilter>('all');
  const [dateFrom, setDateFrom] = useState(SAMPLE_FROM);
  const [dateTo, setDateTo] = useState(SAMPLE_TO);
  const searchDays = useMemo(
    () => computeSearchDays(dateFrom, dateTo),
    [dateFrom, dateTo]
  );
  const [otDrillDown, setOtDrillDown] = useState<{
    department: string;
    status: WorkerOtAlertStatus;
  } | null>(null);

  // Du lieu dashboard tu API Node.js (hoac DEMO mock khi .env DEMO=1)
  const { cards, monthly, deptTrend, daily, loading, error } = useDashboardData({
    from: dateFrom,
    to: dateTo,
  });

  const handleDrillDown = (department: string, status: WorkerOtAlertStatus) => {
    setOtDrillDown((prev) =>
      prev?.department === department && prev.status === status
        ? prev
        : { department, status }
    );
    window.setTimeout(() => {
      document
        .getElementById('ot-worker-detail')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

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
      <main className="mx-auto w-full max-w-[90rem] space-y-5 px-4 py-5 md:space-y-8 md:px-6 md:py-8 lg:px-8">
        {error ? (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {t('common.apiError')}
          </div>
        ) : null}
        {loading ? (
          // Overlay loading cố định GIỮA màn hình — spinner to, rõ; không chặn click/scroll
          <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-lg">
              <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
              <span className="text-base font-semibold text-slate-800">{t('common.loading')}</span>
            </div>
          </div>
        ) : null}
        <KpiCardsSection searchDays={searchDays} cards={cards} />
        <DepartmentFilterSection selected={department} onChange={setDepartment} />
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
        <div id="ot-worker-detail" className="scroll-mt-4">
          <DailySummarySection
            selected={department}
            dateFrom={dateFrom}
            dateTo={dateTo}
            drillDown={otDrillDown}
            onClearDrillDown={() => setOtDrillDown(null)}
            daily={daily}
          />
        </div>
      </main>
    </div>
  );
}
