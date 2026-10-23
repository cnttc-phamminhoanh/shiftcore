import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlarmClock,
  BarChart3,
  Braces,
  CalendarCheck,
  CircleCheck,
  Clock,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Image } from '@/components/ui/image';
import type { IKpiData } from '@/data/kpidata';
import {
  getActualOTStatus,
  getOTDifferencePercent,
  type ActualOtStatus,
} from '@/lib/actual-ot-status';
import { cn } from '@/lib/utils';

const KPI_ICONS: Record<string, LucideIcon> = {
  'Worker Count': Users,
  'Total OT (Plan)': Clock,
  'Actual OT': AlarmClock,
  'IGM OT': CalendarCheck,
};

// Per-KPI pastel visual identity: card gradient, matching border,
// icon tile gradient and decorative circle tint. Data stays untouched.
interface KpiVisual {
  gradient: string;
  border: string;
  iconGradient: string;
  circle: string;
  valueColor: string;
  // Optional overrides for filled (dark) card variants, e.g. the red state.
  titleColor?: string;
  subtitleColor?: string;
  // Optional warm halo around the icon tile (per mockup glow).
  iconGlow?: string;
  // Optional soft themed shadow under the card (per mockup).
  shadow?: string;
  // Optional subtle drop shadow behind the big value number (glossy look).
  valueShadow?: string;
}

const KPI_VISUALS: Record<string, KpiVisual> = {
  'Worker Count': {
    // Glassy white → soft pink gradient, rose border/glow shadow,
    // layered wave decoration (per the pink mockup).
    gradient: 'linear-gradient(135deg, #FFFFFF 0%, #FFF5F8 55%, #FFE3EC 100%)',
    border: '#F9C6D9',
    iconGradient: 'linear-gradient(135deg, #F8A8C4 0%, #EC6F9E 100%)',
    circle: 'rgba(236, 111, 158, 0.15)',
    valueColor: '#1F3A5C',
    shadow: '0 8px 24px rgb(236 111 158 / 0.18)',
  },
  'Total OT (Plan)': {
    // Glassy white → soft sky gradient, blue border/shadow,
    // layered wave decoration (per mockup).
    gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F3F8FF 55%, #DCEBFD 100%)',
    border: '#93C5FD',
    iconGradient: 'linear-gradient(135deg, #60A5FA 0%, #2563EB 100%)',
    circle: 'rgba(37, 99, 235, 0.14)',
    valueColor: 'hsl(222 47% 11%)',
    shadow: '0 8px 24px rgb(37 99 235 / 0.16)',
  },
  // 'Actual OT' visuals are driven by ACTUAL_OT_STATUS_VISUALS below,
  // based on the actual-vs-plan ratio — not a fixed palette.
  'IGM OT': {
    gradient: 'linear-gradient(135deg, #FAF5FF 0%, #F3E8FF 100%)',
    border: '#E9D5FF',
    iconGradient: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
    circle: 'rgba(124, 58, 237, 0.08)',
    valueColor: 'hsl(222 47% 11%)',
  },
};

const FALLBACK_VISUAL: KpiVisual = KPI_VISUALS['Total OT (Plan)']!;

// Extended visual with a status glow for the alert highlight card.
interface KpiStatusVisual extends KpiVisual {
  glow: string;
}

// Actual OT card visuals per warning tier (workers W, search days D,
// plan OT P, actual OT A):
//   green  — A <  W * 0.5  * D + P (within the expected OT envelope)
//   yellow — A >= W * 0.5  * D + P (small deviation)
//   orange — A >= W * 0.75 * D + P (large deviation)
//   red    — A >  W * 1    * D + P (abnormally high)
//   neutral — invalid/missing inputs (slate, no assessment)
const ACTUAL_OT_STATUS_VISUALS: Record<ActualOtStatus, KpiStatusVisual> = {
  green: {
    // Glassy white → soft mint gradient, emerald border/shadow, layered
    // wave decoration — same light-card language as the other KPI cards
    // (per the green mockup: mint translucent card + wave pattern).
    gradient: 'linear-gradient(135deg, #FFFFFF 0%, #F2FDFA 55%, #D3F5E8 100%)',
    border: '#86EFAC',
    iconGradient: 'linear-gradient(135deg, #34D399 0%, #10B981 100%)',
    circle: 'rgba(16, 185, 129, 0.16)',
    valueColor: 'hsl(222 47% 11%)',
    glow: '0 8px 24px rgb(16 185 129 / 0.18)',
  },
  yellow: {
    // Filled glossy pure-yellow glassmorphism card (per mockup): light →
    // golden yellow gradient (no orange tint), golden border + glow,
    // white title/number, translucent white decorative circles.
    gradient: 'linear-gradient(135deg, #FFF9C4 0%, #FFE24D 50%, #FFC800 100%)',
    border: '#E3B400',
    iconGradient: 'linear-gradient(135deg, #FFD84D 0%, #E6A800 100%)',
    circle: 'rgba(255, 255, 255, 0.18)',
    // Deep amber-brown text pops against the bright yellow card (white
    // washed out on the lighter gradient).
    valueColor: '#713F0B',
    titleColor: '#713F0B',
    subtitleColor: 'rgba(113, 63, 11, 0.72)',
    // Bright white halo around the alarm-clock icon tile.
    iconGlow:
      '0 0 0 3px rgb(255 255 255 / 0.45), 0 0 16px rgb(255 255 255 / 0.65), 0 0 34px rgb(255 255 255 / 0.40)',
    // Soft light halo behind the dark number for a glossy depth.
    valueShadow: '0 1px 3px rgb(255 251 219 / 0.65)',
    glow: '0 12px 34px rgb(255 200 0 / 0.45), 0 0 60px rgb(255 216 0 / 0.35)',
  },
  orange: {
    // Filled glassmorphism orange card (per mockup): vivid orange → deep
    // orange-red gradient, orange border + glow, white title/number,
    // translucent white decorative circles.
    gradient: 'linear-gradient(135deg, #FF9A3C 0%, #FF6A00 55%, #F04E00 100%)',
    border: '#E04A00',
    iconGradient: 'linear-gradient(135deg, #FF8C1A 0%, #E65C00 100%)',
    circle: 'rgba(255, 255, 255, 0.16)',
    valueColor: '#FFFFFF',
    titleColor: '#FFFFFF',
    subtitleColor: 'rgba(255, 255, 255, 0.80)',
    // Bright white halo around the alarm-clock icon tile.
    iconGlow:
      '0 0 0 3px rgb(255 255 255 / 0.45), 0 0 16px rgb(255 255 255 / 0.65), 0 0 34px rgb(255 255 255 / 0.40)',
    glow: '0 12px 34px rgb(240 78 0 / 0.45), 0 0 60px rgb(255 122 0 / 0.35)',
  },
  red: {
    // Filled glassmorphism red card (per mockup): pure deep red → bright
    // red gradient (no pink tint), darker red border + glow, white
    // title/number, translucent white decorative circles.
    gradient: 'linear-gradient(135deg, #B91C1C 0%, #EF4444 100%)',
    border: '#991B1B',
    iconGradient: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
    // Bright white halo around the alarm-clock icon tile, so the clock
    // emits white light on the red card.
    iconGlow:
      '0 0 0 3px rgb(255 255 255 / 0.45), 0 0 16px rgb(255 255 255 / 0.65), 0 0 34px rgb(255 255 255 / 0.40)',
    circle: 'rgba(255, 255, 255, 0.14)',
    valueColor: '#FFFFFF',
    titleColor: '#FFFFFF',
    subtitleColor: 'rgba(255, 255, 255, 0.75)',
    glow: '0 10px 32px rgb(185 28 28 / 0.45), 0 0 56px rgb(220 38 38 / 0.38)',
  },
  neutral: {
    gradient: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
    border: '#CBD5E1',
    iconGradient: 'linear-gradient(135deg, #94A3B8 0%, #64748B 100%)',
    circle: 'rgba(100, 116, 139, 0.08)',
    valueColor: 'hsl(222 47% 11%)',
    glow: '0 1px 3px rgb(0 0 0 / 0.06)',
  },
};

// Alert banner styling + copy per status (mockups): red — solid white strip
// with dark text; orange — translucent strip with a divider, "large
// deviation" copy; yellow — lighter translucent strip, "small deviation".
interface AlertBannerStyle {
  strip: string;
  icon: string;
  divider?: string;
  title: string;
  desc: string;
  titleKey: string;
  // Description key; the orange/yellow variants interpolate over-plan
  // hours, red uses its fixed copy.
  descKey: string;
}
const ALERT_BANNER_STYLES: Record<ActualOtStatus, AlertBannerStyle | null> = {
  red: {
    strip: 'bg-white shadow-sm',
    icon: 'bg-destructive',
    title: 'text-foreground',
    desc: 'text-muted-foreground',
    titleKey: 'kpi.alertHighTitle',
    descKey: 'kpi.alertHighDesc',
  },
  orange: {
    strip: 'bg-white shadow-sm',
    icon: 'bg-orange-500',
    divider: 'bg-foreground/10',
    title: 'text-foreground',
    desc: 'text-muted-foreground',
    titleKey: 'kpi.deviationLargeTitle',
    descKey: 'kpi.deviationDesc',
  },
  yellow: {
    strip: 'bg-white shadow-sm',
    icon: 'bg-amber-500',
    divider: 'bg-foreground/10',
    title: 'text-foreground',
    desc: 'text-muted-foreground',
    titleKey: 'kpi.deviationSmallTitle',
    descKey: 'kpi.deviationDesc',
  },
  green: {
    // Within-plan banner (per the green mockup): translucent mint strip,
    // green check-circle icon, green bold title + muted description.
    strip: 'border border-success/15 bg-success/10',
    icon: 'bg-success',
    title: 'text-success',
    desc: 'text-muted-foreground',
    titleKey: 'kpi.withinPlanTitle',
    descKey: 'kpi.withinPlanDesc',
  },
  neutral: null,
};
// Maps KPI data titles to translation keys (business data stays untouched).
const KPI_TITLE_KEYS: Record<string, string> = {
  'Worker Count': 'kpi.workerCount',
  'Total OT (Plan)': 'kpi.totalOTPlan',
  'Actual OT': 'kpi.actualOT',
  'IGM OT': 'kpi.igmOT',
};

interface KpiCardsSectionProps {
  // Inclusive day count of the applied search range; drives the warning
  // thresholds (plan OT + workers × factor × searchDays).
  searchDays: number;
  cards: IKpiData[];
}

export default memo(function KpiCardsSection({
  searchDays,
  cards,
}: KpiCardsSectionProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const PLAN_OT_VALUE = cards.find((k) => k.title === 'Total OT (Plan)')?.value;
  const ACTUAL_OT_VALUE = cards.find((k) => k.title === 'Actual OT')?.value;
  const WORKER_COUNT_VALUE = cards.find((k) => k.title === 'Worker Count')?.value;

  // Warning tier of the Actual OT card, recomputed automatically whenever
  // the applied search range (searchDays) or the KPI data changes.
  const actualOtStatus = useMemo(
    () =>
      getActualOTStatus(
        ACTUAL_OT_VALUE,
        PLAN_OT_VALUE,
        WORKER_COUNT_VALUE,
        searchDays
      ),
    [searchDays]
  );
  // Deviation % vs plan — display only (null when plan OT is 0/missing so
  // the card never shows Infinity/NaN).
  const otDifferencePercent = useMemo(
    () => getOTDifferencePercent(ACTUAL_OT_VALUE, PLAN_OT_VALUE),
    []
  );
  // Alert states (yellow/orange/red) show the deviation pill + banner.
  const isActualOtAlert = ['yellow', 'orange', 'red'].includes(actualOtStatus);
  // Absolute over-plan hours, used by the deviation banner description.
  const otOverHours =
    ACTUAL_OT_VALUE != null && PLAN_OT_VALUE != null
      ? ACTUAL_OT_VALUE - PLAN_OT_VALUE
      : 0;
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((kpi) => {
        const Icon = KPI_ICONS[kpi.title] ?? Clock;
        // The Actual OT card is the status card: its palette follows the
        // actual-vs-plan ratio (green/yellow/orange/red), per business rule.
        const isActualOt = kpi.title === 'Actual OT';
        const visual: KpiVisual = isActualOt
          ? ACTUAL_OT_STATUS_VISUALS[actualOtStatus]
          : (KPI_VISUALS[kpi.title] ?? FALLBACK_VISUAL);
        return (
          <Card
            key={kpi.id}
            className={cn(
              'relative flex flex-col overflow-hidden rounded-2xl border shadow-sm transition-all duration-[250ms] ease-out',
              'hover:-translate-y-1 hover:shadow-md'
            )}
            style={{
              background: visual.gradient,
              borderColor: visual.border,
              ...(isActualOt
                ? {
                    boxShadow: ACTUAL_OT_STATUS_VISUALS[actualOtStatus].glow,
                  }
                : visual.shadow && { boxShadow: visual.shadow }),
            }}
          >
            {/* Themed corner decoration, clipped inside the card, never
                interactive: two overlapping translucent circles for the filled
                status card, layered waves for the light cards (per mockup). */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              {isActualOt && actualOtStatus !== 'green' ? (
                <>
                  <span
                    className="absolute -right-5 -bottom-9 size-32 rounded-full"
                    style={{ backgroundColor: visual.circle }}
                  />
                  <span
                    className="absolute right-10 -bottom-5 size-18 rounded-full"
                    style={{ backgroundColor: visual.circle }}
                  />

                </>
              ) : (
                <svg
                  className="absolute right-0 bottom-0 h-20 w-44"
                  viewBox="0 0 176 80"
                  fill="none"
                >
                  <path
                    d="M176 4 C150 2 138 24 112 31 C86 38 72 22 52 32 C32 42 16 64 0 60 L0 80 L176 80 Z"
                    fill={visual.circle}
                  />
                  <path
                    d="M176 38 C154 36 140 51 118 55 C96 59 82 48 62 56 C42 64 20 76 0 72 L0 80 L176 80 Z"
                    fill={visual.circle}
                  />
                </svg>
              )}
            </div>
            <CardContent className="relative flex flex-1 flex-col p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl shadow-sm"
                  style={{
                    background: visual.iconGradient,
                    ...(visual.iconGlow && { boxShadow: visual.iconGlow }),
                  }}
                >
                  <Icon className="size-5 text-white" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div
                    className="break-words text-sm font-semibold leading-snug text-foreground"
                    style={
                      visual.titleColor ? { color: visual.titleColor } : undefined
                    }
                  >
                    {KPI_TITLE_KEYS[kpi.title]
                      ? t(KPI_TITLE_KEYS[kpi.title])
                      : kpi.title}
                  </div>
                  <div
                    className="text-xs font-normal leading-snug text-muted-foreground"
                    style={
                      visual.subtitleColor
                        ? { color: visual.subtitleColor }
                        : undefined
                    }
                  >
                    ({t(`common.${kpi.unit}`, kpi.unit)})
                  </div>
                </div>
                {/* Rocket badge (user-provided image): sits at the right
                    end of the title row on the red alert card. Its pure-red
                    background blends into the red gradient. */}
                {kpi.title === 'Actual OT' && actualOtStatus === 'red' && (
                  <Image
                    aria-hidden
                    src="https://miaoda.feishu.cn/aily/api/v1/feisuda/attachments/2f13e4da-3aa8-4bff-bfed-6642dae8ff5d/raw"
                    alt=""
                    className="ml-auto h-11 w-11 shrink-0 rounded-xl shadow-lg"
                  />
                )}
              </div>
              <div className="mt-5 flex items-center gap-3">
                <div
                  className="text-3xl font-black tabular-nums tracking-tight"
                  style={{
                    color: visual.valueColor,
                    ...(visual.valueShadow && {
                      textShadow: visual.valueShadow,
                    }),
                  }}
                >
                  {kpi.value}
                </div>
                {/* Deviation pill (per confirmed formula): white capsule with
                    an arrow + bold percent vs plan, caption below. Shown on
                    alert states (red when over plan) and on the green
                    within-plan state (green text, per the mint mockup). */}
                {isActualOt && (isActualOtAlert || actualOtStatus === 'green') && (
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 shadow-sm">
                      {otDifferencePercent === null ? (
                        // planOT = 0 → skip the division; show a neutral
                        // label instead of Infinity/NaN (per spec).
                        <span className="text-sm font-bold text-muted-foreground">
                          {t('kpi.noPlanOt')}
                        </span>
                      ) : (
                        <>
                          {isActualOtAlert && otDifferencePercent >= 0 ? (
                            <TrendingUp
                              className="size-3.5 text-destructive"
                              aria-hidden
                            />
                          ) : otDifferencePercent < 0 ? (
                            <TrendingDown
                              className="size-3.5 text-success"
                              aria-hidden
                            />
                          ) : null}
                          <span
                            className={cn(
                              'text-sm font-bold tabular-nums',
                              isActualOtAlert && otDifferencePercent >= 0
                                ? 'text-destructive'
                                : 'text-success'
                            )}
                          >
                            {otDifferencePercent > 0
                              ? `+${otDifferencePercent}%`
                              : `${otDifferencePercent}%`}
                          </span>
                        </>
                      )}
                    </span>
                    <span
                      className="text-[11px] leading-snug"
                      style={{ color: visual.subtitleColor ?? '#64748B' }}
                    >
                      {t('kpi.vsPlan')}
                    </span>
                  </div>
                )}
              </div>
              {/* Flexible spacer: absorbs leftover height so the bottom
                  banner of every card sits on the same baseline across the
                  equal-height grid row (banners align horizontally). */}
              <div className="min-h-3 flex-1" aria-hidden />
              {/* Worker-count sub-banner (per pink mockup): translucent
                  glassy strip with a pink users circle icon, thin pink divider
                  and muted gray text. Shared min-height keeps all 4 strips
                  equally tall. */}
              {kpi.title === 'Worker Count' && (
                <div
                  className="mt-3 flex min-h-[46px] items-center gap-2.5 rounded-lg px-3 py-2"
                  style={{ backgroundColor: 'rgba(249, 198, 217, 0.35)' }}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full shadow-sm"
                    style={{ backgroundColor: '#EC6F9E' }}
                  >
                    <Users className="size-3.5 text-white" aria-hidden />
                  </span>
                  <span
                    className="h-4 w-px shrink-0"
                    style={{ backgroundColor: 'rgba(236, 111, 158, 0.35)' }}
                    aria-hidden
                  />
                  <div className="text-[11px] font-medium leading-snug text-muted-foreground">
                    {t('kpi.workerScope')}
                  </div>
                </div>
              )}
              {/* IGM OT sub-banner (per mockup): soft lavender strip with a
                  purple circle icon holding a white code-braces symbol and
                  deep purple text ("recorded from IGM" scope note). */}
              {kpi.title === 'IGM OT' && (
                <div
                  className="mt-3 flex min-h-[46px] items-center gap-2.5 rounded-lg border px-3 py-2"
                  style={{
                    backgroundColor: '#F9EFFF',
                    borderColor: '#F3D9FF',
                  }}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full shadow-sm"
                    style={{ backgroundColor: '#C774E0' }}
                  >
                    <Braces className="size-3.5 text-white" aria-hidden />
                  </span>
                  <div
                    className="text-[11px] font-medium leading-snug"
                    style={{ color: '#9D4EDD' }}
                  >
                    {t('kpi.igmScope')}
                  </div>
                </div>
              )}
              {/* Plan-card sub-banner (per mockup): soft blue nested strip
                  with a bar-chart circle icon, bold "per plan" title and an
                  "approved" description. */}
              {kpi.title === 'Total OT (Plan)' && (
                <div className="mt-3 flex min-h-[46px] items-center gap-2.5 rounded-lg border border-info/15 bg-white/60 px-3 py-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-info shadow-sm">
                    <BarChart3 className="size-3.5 text-info-foreground" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold leading-snug text-foreground">
                      {t('kpi.planBadgeTitle')}
                    </div>
                    <div className="text-[11px] leading-snug text-muted-foreground">
                      {t('kpi.planBadgeDesc')}
                    </div>
                  </div>
                </div>
              )}
              {/* Status deviation banner (per mockups): red — "abnormally
                  high"; orange — large deviation; yellow — small deviation.
                  Orange/yellow interpolate the over-plan hours and the
                  plan multiple into the description. */}
              {(() => {
                const banner = ALERT_BANNER_STYLES[actualOtStatus];
                if (!isActualOt || !banner) return null;
                const overHours = new Intl.NumberFormat(locale).format(
                  otOverHours
                );
                // Green (within plan) uses a check icon instead of a warning
                // triangle, per the mint mockup.
                const BannerIcon =
                  actualOtStatus === 'green' ? CircleCheck : TriangleAlert;
                const descText =
                  banner.descKey === 'kpi.deviationDesc'
                    ? t(banner.descKey, { over: overHours })
                      : banner.descKey === 'kpi.withinPlanDesc'
                        ? otOverHours > 0
                          ? t('kpi.deviationDesc', { over: overHours })
                          : otOverHours < 0
                            ? t('kpi.withinPlanUnderDesc', {
                                under: new Intl.NumberFormat(locale).format(
                                  Math.abs(otOverHours)
                                ),
                              })
                            : t('kpi.withinPlanEqualDesc')
                      : t(banner.descKey);
                return (
                  <div
                    className={cn(
                      'mt-3 flex min-h-[46px] items-center gap-2.5 rounded-lg px-3 py-2',
                      banner.strip
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full shadow-sm',
                        banner.icon
                      )}
                    >
                      <BannerIcon
                        className="size-3.5 text-white"
                        aria-hidden
                      />
                    </span>
                    {banner.divider && (
                      <span
                        aria-hidden
                        className={cn('h-6 w-px shrink-0', banner.divider)}
                      />
                    )}
                    <div className="min-w-0">
                      <div
                        className={cn(
                          'text-xs font-bold leading-snug',
                          banner.title
                        )}
                      >
                        {t(banner.titleKey)}
                      </div>
                      <div
                        className={cn('text-[11px] leading-snug', banner.desc)}
                      >
                        {descText}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
});
