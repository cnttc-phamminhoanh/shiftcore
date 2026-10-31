import { memo, useEffect, useState, type FormEvent } from 'react';
import { Search, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  // Draft values are only committed to the dashboard when Apply is pressed.
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);

  useEffect(() => {
    setDraftFrom(dateFrom);
  }, [dateFrom]);

  useEffect(() => {
    setDraftTo(dateTo);
  }, [dateTo]);

  const handleApply = (event: FormEvent) => {
    event.preventDefault();
    const from = draftFrom < MIN_DATE ? MIN_DATE : draftFrom;
    const to = draftTo < MIN_DATE ? MIN_DATE : draftTo;
    onApplyRange(from, to);
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
                {t('dashboard.subtitleFactory')}{' '}
                <span className="mx-1">•</span>{' '}
                {t('dashboard.subtitleMonitoring')}
              </p>
            </div>
          </div>
          <div className="shrink-0 md:hidden">
            <LanguageSwitcher />
          </div>
        </div>

        {/* Controls: search row first, then the update clock below it */}
        <div className="flex w-full flex-col gap-2 md:w-auto">
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-start md:gap-3">
            <form
              onSubmit={handleApply}
              className="flex w-full flex-col gap-2 md:w-auto"
            >
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-2">
                <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 md:flex md:w-auto">
                  <Input
                    type="date"
                    min={MIN_DATE}
                    aria-label={t('common.startDate')}
                    value={draftFrom}
                    onChange={(event) => setDraftFrom(event.target.value)}
                    className="h-9 w-full rounded-lg bg-card px-3 text-sm tabular-nums md:w-[136px]"
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('common.to')}
                  </span>
                  <Input
                    type="date"
                    min={MIN_DATE}
                    aria-label={t('common.endDate')}
                    value={draftTo}
                    onChange={(event) => setDraftTo(event.target.value)}
                    className="h-9 w-full rounded-lg bg-card text-sm tabular-nums md:w-[136px]"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full gap-1.5 rounded-lg md:w-auto"
                >
                  <Search className="size-4" />
                  {t('common.search')}
                </Button>
              </div>
              {/* Ghi chú ngay phía dưới date picker */}
              <p className="max-w-[420px] text-[11px] leading-snug text-muted-foreground">
                {t('dashboard.minDateNote', { date: MIN_DATE })}
              </p>
            </form>
            <div className="hidden shrink-0 md:block">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
});
