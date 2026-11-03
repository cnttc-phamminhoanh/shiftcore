import { memo } from 'react';
import { Search, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import DateRangePicker from '@/components/DateRangePicker';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';

interface DashboardHeaderSectionProps {
  dateFrom: string;
  dateTo: string;
  onApplyRange: (from: string, to: string) => void;
}

// Ngày thấp nhất có dữ liệu chấm công (bảng T_HR_Time_result) — UI không cho
// chọn sớm hơn, và clamp khi người dùng tự gõ ngày sớm hơn.
const MIN_DATE = '2025-12-01';

export default memo(function DashboardHeaderSection({
  dateFrom,
  dateTo,
  onApplyRange,
}: DashboardHeaderSectionProps) {
  const { t } = useTranslation();

  // Committed range from the picker: clamp to MIN_DATE before applying.
  const handleApplyRange = (from: string, to: string) => {
    const clampedFrom = from < MIN_DATE ? MIN_DATE : from;
    const clampedTo = to < MIN_DATE ? MIN_DATE : to;
    onApplyRange(clampedFrom, clampedTo);
  };

  return (
    <header className="z-50 w-full bg-background/80 backdrop-blur-md md:sticky md:top-0">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
        {/* Row 1 on mobile: identity + language switcher */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm ring-1 ring-primary/10">
              <Timer className="size-6" />
            </div>
            <div className="min-w-0">
              <h1 className="break-words text-xl font-bold leading-snug tracking-tight text-foreground md:text-2xl">
                {t('dashboard.title')}
              </h1>
              <p className="break-words text-xs leading-snug text-muted-foreground md:text-sm">
                {t('dashboard.subtitleWorkers')}
              </p>
            </div>
          </div>
          <div className="shrink-0 md:hidden">
            <LanguageSwitcher />
          </div>
        </div>

        {/* Controls: date-range picker (Ngày / Tháng / Năm) next to the
            search button, then the language switcher */}
        <div className="flex w-full flex-col gap-2 md:w-auto">
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-start md:gap-3">
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-2">
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                minDate={MIN_DATE}
                onApply={handleApplyRange}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => handleApplyRange(dateFrom, dateTo)}
                className="w-full gap-1.5 rounded-lg md:w-auto"
              >
                <Search className="size-4" />
                {t('common.search')}
              </Button>
            </div>
            <div className="hidden shrink-0 md:block">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
});
