import { memo, useEffect, useMemo, useState } from 'react';
import {
  endOfMonth,
  endOfYear,
  format,
  getMonth,
  getYear,
  parseISO,
  startOfMonth,
  startOfYear,
  type Locale,
} from 'date-fns';
import { enUS, vi as viLocale, zhCN as zhLocale } from 'date-fns/locale';
import {
  CalendarDays,
  Check,
  ChevronDown,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import { cn } from '@/lib/utils';

// Dates always render day-first (dd/MM/yyyy) — the Vietnamese convention
// the user asked for, regardless of the app language.
const fmtDate = (date: Date) => format(date, 'dd/MM/yyyy');

type RangeMode = 'year' | 'month' | 'day';

// Day → Month → Year, matching the dd/MM/yyyy reading order.
const MODES: readonly RangeMode[] = ['day', 'month', 'year'];

interface DateRangePickerProps {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  // Ngày thấp nhất được phép chọn (yyyy-MM-dd). Ngày/tháng/năm trước mốc
  // này bị vô hiệu hóa ngay trong popover (03/11/2026).
  minDate?: string;
}

interface MonthOption {
  key: string; // yyyy-MM
  year: number;
  month: number; // 0-based
  label: string;
}

interface MonthSelectProps {
  label: string;
  valueKey: string;
  options: MonthOption[];
  searchPlaceholder: string;
  onSelect: (year: number, month: number) => void;
}

interface DayFieldProps {
  label: string;
  value: string;
  calendarLocale: Locale;
  minDate: Date;
  onChange: (iso: string) => void;
}

interface YearSelectProps {
  label: string;
  value: number;
  years: number[];
  searchPlaceholder: string;
  onSelect: (year: number) => void;
}

// Exact calendar period covered by `date` in the given granularity.
function boundsOf(mode: RangeMode, date: Date): { start: Date; end: Date } {
  switch (mode) {
    case 'month':
      return { start: startOfMonth(date), end: endOfMonth(date) };
    case 'year':
      return { start: startOfYear(date), end: endOfYear(date) };
    default:
      return { start: date, end: date };
  }
}

// "Từ tháng / Đến tháng" dropdown: searchable, ascending month list.
function MonthSelect({
  label,
  valueKey,
  options,
  searchPlaceholder,
  onSelect,
}: MonthSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.key === valueKey);

  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-medium text-muted-foreground">{label}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-lg border border-input bg-muted/60 px-2 py-1.5 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted"
          >
            <CalendarDays className="size-3 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-left">
              {selected?.label ?? valueKey}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[172px] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl"
        >
          <Command
            defaultValue={valueKey}
            className="bg-transparent text-foreground"
          >
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-7 py-0 text-xs"
            />
            <CommandList className="max-h-40">
              <CommandEmpty className="py-3 text-[11px]">—</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.key}
                  value={option.key}
                  keywords={[option.label, String(option.year)]}
                  onSelect={() => {
                    onSelect(option.year, option.month);
                    setOpen(false);
                  }}
                  className="gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium tabular-nums data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.key === valueKey && (
                    <Check className="size-3 shrink-0 text-foreground" />
                  )}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// "Từ ngày / Đến ngày" dropdown: the date box itself opens a calendar.
// Days before `minDate` are disabled so the user cannot pick earlier.
function DayField({
  label,
  value,
  calendarLocale,
  minDate,
  onChange,
}: DayFieldProps) {
  const [open, setOpen] = useState(false);
  const date = parseISO(value);

  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-medium text-muted-foreground">{label}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-lg border border-input bg-muted/60 px-2 py-1.5 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted"
          >
            <CalendarDays className="size-3 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-left">{fmtDate(date)}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto rounded-xl border border-border bg-card p-0 shadow-xl"
        >
          <Calendar
            mode="single"
            numberOfMonths={1}
            locale={calendarLocale}
            disabled={{ before: minDate }}
            startMonth={minDate}
            defaultMonth={date}
            selected={date}
            className="[--cell-size:--spacing(7)]"
            onSelect={(next) => {
              if (!next) return;
              onChange(format(next, 'yyyy-MM-dd'));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// "Từ năm / Đến năm" dropdown: a combobox with a search input over a
// scrollable year list, styled to match the user's light reference design.
function YearSelect({
  label,
  value,
  years,
  searchPlaceholder,
  onSelect,
}: YearSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-medium text-muted-foreground">{label}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-lg border border-input bg-muted/60 px-2 py-1.5 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted"
          >
            <CalendarDays className="size-3 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-left">{value}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[124px] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl"
        >
          <Command className="bg-transparent text-foreground">
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-7 py-0 text-xs"
            />
            <CommandList className="max-h-40">
              <CommandEmpty className="py-3 text-[11px]" />
              {years.map((year) => (
                <CommandItem
                  key={year}
                  value={String(year)}
                  onSelect={() => {
                    onSelect(year);
                    setOpen(false);
                  }}
                  className="gap-1.5 rounded-md px-2 py-1 text-xs font-medium tabular-nums data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                >
                  <span className="flex-1">{year}</span>
                  {year === value && (
                    <Check className="size-3.5 shrink-0 text-foreground" />
                  )}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Date-range search control modeled after the user's reference design: a
// light trigger button opening a white popover where the granularity is
// picked from Ngày / Tháng / Năm tabs (month by default), the range is
// chosen via from/to panels, previewed live, then committed with Áp dụng
// (or the Hôm nay shortcut). Applied bounds always cover whole periods of
// the active granularity. Layout is kept compact so it fits phones.
export default memo(function DateRangePicker({
  from,
  to,
  onApply,
  minDate = '2025-12-01',
}: DateRangePickerProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RangeMode>('month');
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  // Applied range coming from the parent (initial mount, external updates).
  useEffect(() => {
    setDraftFrom(from);
  }, [from]);

  useEffect(() => {
    setDraftTo(to);
  }, [to]);

  const minDateDate = useMemo(() => parseISO(minDate), [minDate]);
  const minMonthKey = minDate.slice(0, 7);
  const minYear = getYear(minDateDate);

  const years = useMemo(() => {
    const current = getYear(new Date());
    // 10 years back .. 2 years ahead: enough for the searchable dropdown.
    // Months before `minDate` are blocked, so years before the min year are
    // dropped entirely (03/11/2026).
    return Array.from({ length: 13 }, (_, index) => current - 10 + index).filter(
      (year) => year >= minYear
    );
  }, [minYear]);

  // Ascending month list: 23 months back .. 3 months ahead, but only from
  // the `minDate` month onward (03/11/2026).
  const monthOptions = useMemo<MonthOption[]>(() => {
    const now = startOfMonth(new Date());
    const monthWord = t('dateRange.monthWord');
    return Array.from({ length: 27 }, (_, index) => {
      const date = new Date(getYear(now), getMonth(now) - 23 + index, 1);
      return {
        key: format(date, 'yyyy-MM'),
        year: getYear(date),
        month: getMonth(date),
        label: `${monthWord} ${format(date, 'MM/yyyy')}`,
      };
    }).filter((option) => option.key >= minMonthKey);
  }, [t, minMonthKey]);

  // Day calendar month/weekday names follow the active app language.
  const calendarLocale = useMemo(() => {
    if (locale === 'vi') return viLocale;
    if (locale === 'zh-CN') return zhLocale;
    return enUS;
  }, [locale]);

  // Ordered whole-period bounds of the current draft in the active mode.
  const draft = useMemo(() => {
    const a = boundsOf(mode, parseISO(draftFrom));
    const b = boundsOf(mode, parseISO(draftTo));
    return a.start <= b.start
      ? { start: a.start, end: b.end }
      : { start: b.start, end: a.end };
  }, [mode, draftFrom, draftTo]);

  const triggerLabel = useMemo(() => {
    const start = parseISO(from);
    const end = parseISO(to);
    if (mode === 'month') {
      return `${format(start, 'MM/yyyy')} – ${format(end, 'MM/yyyy')}`;
    }
    if (mode === 'year') {
      return `${format(start, 'yyyy')} – ${format(end, 'yyyy')}`;
    }
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  }, [from, to, mode]);

  const switchMode = (next: RangeMode) => {
    if (next === mode) return;
    setDraftFrom(format(boundsOf(next, parseISO(draftFrom)).start, 'yyyy-MM-dd'));
    setDraftTo(format(boundsOf(next, parseISO(draftTo)).end, 'yyyy-MM-dd'));
    setMode(next);
  };

  const applyDraft = () => {
    onApply(format(draft.start, 'yyyy-MM-dd'), format(draft.end, 'yyyy-MM-dd'));
    setOpen(false);
  };

  // Quick shortcut: the whole current period (day / month / year) of today.
  const applyToday = () => {
    const bounds = boundsOf(mode, new Date());
    const startIso = format(bounds.start, 'yyyy-MM-dd');
    const endIso = format(bounds.end, 'yyyy-MM-dd');
    setDraftFrom(startIso);
    setDraftTo(endIso);
    onApply(startIso, endIso);
    setOpen(false);
  };

  const selectStartMonth = (year: number, month: number) => {
    const date = new Date(year, month, 1);
    const iso = format(date, 'yyyy-MM-dd');
    setDraftFrom(iso);
    if (parseISO(draftTo) < date) {
      setDraftTo(format(endOfMonth(date), 'yyyy-MM-dd'));
    }
  };

  const selectEndMonth = (year: number, month: number) => {
    const date = new Date(year, month, 1);
    if (parseISO(draftFrom) > date) {
      setDraftFrom(format(startOfMonth(date), 'yyyy-MM-dd'));
    }
    setDraftTo(format(endOfMonth(date), 'yyyy-MM-dd'));
  };

  const selectStartYear = (year: number) => {
    const date = new Date(year, 0, 1);
    const iso = format(date, 'yyyy-MM-dd');
    setDraftFrom(iso);
    if (parseISO(draftTo) < date) {
      setDraftTo(format(endOfYear(date), 'yyyy-MM-dd'));
    }
  };

  const selectEndYear = (year: number) => {
    const date = new Date(year, 0, 1);
    if (parseISO(draftFrom) > endOfYear(date)) {
      setDraftFrom(format(startOfYear(date), 'yyyy-MM-dd'));
    }
    setDraftTo(format(endOfYear(date), 'yyyy-MM-dd'));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-auto max-w-full gap-2 rounded-lg bg-card px-3 font-medium tabular-nums"
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
          className="w-[300px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-card p-0 text-foreground shadow-xl"
      >
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">
              {t('dateRange.title')}
            </h3>
            <button
              type="button"
              aria-label={t('common.clear')}
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Granularity tabs: Ngày / Tháng / Năm */}
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {MODES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => switchMode(item)}
                className={cn(
                  'flex-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition-colors',
                  mode === item
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(`dateRange.${item}`)}
              </button>
            ))}
          </div>

          {mode === 'day' && (
            <div className="space-y-2">
              <DayField
                label={t('dateRange.from')}
                value={draftFrom}
                calendarLocale={calendarLocale}
                minDate={minDateDate}
                onChange={(iso) => {
                  setDraftFrom(iso);
                  if (parseISO(draftTo) < parseISO(iso)) setDraftTo(iso);
                }}
              />
              <DayField
                label={t('dateRange.to')}
                value={draftTo}
                calendarLocale={calendarLocale}
                minDate={minDateDate}
                onChange={(iso) => {
                  setDraftTo(iso);
                  if (parseISO(draftFrom) > parseISO(iso)) setDraftFrom(iso);
                }}
              />
            </div>
          )}

          {mode === 'month' && (
            <div className="space-y-2">
              <MonthSelect
                label={t('dateRange.fromMonth')}
                valueKey={format(parseISO(draftFrom), 'yyyy-MM')}
                options={monthOptions}
                searchPlaceholder={t('dateRange.searchMonth')}
                onSelect={selectStartMonth}
              />
              <MonthSelect
                label={t('dateRange.toMonth')}
                valueKey={format(parseISO(draftTo), 'yyyy-MM')}
                options={monthOptions}
                searchPlaceholder={t('dateRange.searchMonth')}
                onSelect={selectEndMonth}
              />
            </div>
          )}

          {mode === 'year' && (
            <div className="grid grid-cols-2 gap-2">
              <YearSelect
                label={t('dateRange.fromYear')}
                value={getYear(parseISO(draftFrom))}
                years={years}
                searchPlaceholder={t('dateRange.searchYear')}
                onSelect={selectStartYear}
              />
              <YearSelect
                label={t('dateRange.toYear')}
                value={getYear(parseISO(draftTo))}
                years={years}
                searchPlaceholder={t('dateRange.searchYear')}
                onSelect={selectEndYear}
              />
            </div>
          )}

          {/* Live preview of the whole-period draft range */}
          <div className="rounded-xl bg-muted px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground">
              {t('dateRange.previewLabel')}
            </p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums">
              {fmtDate(draft.start)} → {fmtDate(draft.end)}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={applyToday}
              className="text-[11px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t('dateRange.today')}
            </button>
            <Button
              type="button"
              size="sm"
              onClick={applyDraft}
              className="h-8 gap-1 rounded-lg bg-primary px-2.5 text-[11px] text-primary-foreground hover:bg-primary/90"
            >
              <Check className="size-3.5" />
              {t('dateRange.apply')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});
