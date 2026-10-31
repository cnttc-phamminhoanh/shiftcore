import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlarmClock,
  Clock,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Image } from '@/components/ui/image';
import type { IKpiData } from '@/data/kpidata';
import { getActualOTStatus, type ActualOtStatus } from '@/lib/actual-ot-status';
import { cn } from '@/lib/utils';

const KPI_ICONS: Record<string, LucideIcon> = {
  'Worker Count': Users,
  'Total OT (Plan)': Clock,
  'Actual OT': AlarmClock,
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

// Maps KPI data titles to translation keys (business data stays untouched).
const KPI_TITLE_KEYS: Record<string, string> = {
  'Worker Count': 'kpi.workerCount',
  'Total OT (Plan)': 'kpi.totalOTPlan',
  'Actual OT': 'kpi.actualOT',
};

interface KpiCardsSectionProps {
  // Inclusive day count of the applied search range; drives the warning
  // thresholds (plan OT + workers × factor × searchDays).
  searchDays: number;
  // Cards du lieu tu API (3 the: Worker Count, Plan OT, Actual OT).
  cards: IKpiData[];
}

export default memo(function KpiCardsSection({
  searchDays,
  cards,
}: KpiCardsSectionProps) {
  const { t } = useTranslation();

  const KPI_CARDS = cards;
  const PLAN_OT_VALUE = KPI_CARDS.find(
    (kpi) => kpi.title === 'Total OT (Plan)'
  )?.value;
  const ACTUAL_OT_VALUE = KPI_CARDS.find(
    (kpi) => kpi.title === 'Actual OT'
  )?.value;
  const WORKER_COUNT_VALUE = KPI_CARDS.find(
    (kpi) => kpi.title === 'Worker Count'
  )?.value;

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
    [searchDays, ACTUAL_OT_VALUE, PLAN_OT_VALUE, WORKER_COUNT_VALUE]
  );
  // Deviation % vs plan — no longer displayed (banners removed).
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {KPI_CARDS.map((kpi) => {
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
              </div>
              {/* Flexible spacer: absorbs leftover height so cards in the
                  equal-height grid row stay aligned. */}
              <div className="min-h-3 flex-1" aria-hidden />
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
});
