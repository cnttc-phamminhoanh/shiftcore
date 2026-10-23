import { memo, useEffect, useState, type FormEvent } from 'react';
import { Clock, Factory, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useVietnamClock } from '@/hooks/use-vietnam-clock';

interface DashboardHeaderSectionProps {
  dateFrom: string;
  dateTo: string;
  onApplyRange: (from: string, to: string) => void;
}

export default memo(function DashboardHeaderSection({
  dateFrom,
  dateTo,
  onApplyRange,
}: DashboardHeaderSectionProps) {
  const { t } = useTranslation();
  // Draft values are only committed to the dashboard when Apply is pressed.
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);
  // Live dashboard clock — Vietnam time (UTC+7), ticks every second.
  const modifiedAt = useVietnamClock();

  useEffect(() => {
    setDraftFrom(dateFrom);
  }, [dateFrom]);

  useEffect(() => {
    setDraftTo(dateTo);
  }, [dateTo]);

  const handleApply = (event: FormEvent) => {
    event.preventDefault();
    onApplyRange(draftFrom, draftTo);
  };

  return (
    <header className="z-50 w-full bg-background/80 backdrop-blur-md md:sticky md:top-0">
      <div className="flex w-full flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
        {/* Row 1 on mobile: identity + language switcher */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm ring-1 ring-primary/10">
              <Factory className="size-6" />
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
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
            <form
              onSubmit={handleApply}
              className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-2"
            >
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 md:flex md:w-auto">
                <Input
                  type="date"
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
            </form>
            <div className="hidden shrink-0 md:block">
              <LanguageSwitcher />
            </div>
          </div>
          {/* Dashboard clock below the search row — Vietnam time (UTC+7) */}
          <p
            className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground md:text-xs"
            title="Asia/Ho_Chi_Minh (UTC+7)"
          >
            <Clock className="size-3 shrink-0" />
            <span>
              {t('common.modifiedAt')}:{' '}
              <span className="font-medium tabular-nums">{modifiedAt}</span>
            </span>
          </p>
        </div>
      </div>
    </header>
  );
});
