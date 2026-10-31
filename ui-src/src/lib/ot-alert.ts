// EXPORTS: OtAlertLevel, getOtAlertLevel, formatMinutes, formatRatio, OT_LEVEL_META

export type OtAlertLevel = 'normal' | 'yellow' | 'orange' | 'red';

// OT Ratio = Actual OT / Plan OT, evaluated per worker per working day.
// - normal: Actual OT does not exceed Plan OT (or no OT plan is registered)
// - yellow: Plan < Actual < 2x Plan
// - orange: 2x Plan <= Actual < 3x Plan
// - red:    Actual >= 3x Plan
export function getOtAlertLevel(planOtMinutes: number, actualOtMinutes: number): OtAlertLevel {
  if (planOtMinutes <= 0) return 'normal';
  if (actualOtMinutes <= planOtMinutes) return 'normal';
  const ratio = actualOtMinutes / planOtMinutes;
  if (ratio < 2) return 'yellow';
  if (ratio < 3) return 'orange';
  return 'red';
}

export function formatMinutes(totalMinutes: number): string {
  // Clock-style duration (e.g. 60 → "1:00", 90 → "1:30", 180 → "3:00").
  const rounded = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// 31/10/2026: hiển thị TỔNG giờ dạng giờ thập phân (giống KPI) — dạng "H:MM"
// với số lớn (vd 256769:00) khó theo dõi với người không chuyên.
// 90 → "1.5", 206793.8 → "206793.8". Làm tròn 2 chữ số thập phân để giữ được
// phút lẻ (vd 217 phút = 3.6166... → "3.62").
export function formatHoursFromMinutes(totalMinutes: number): string {
  const hours = Math.max(0, totalMinutes) / 60;
  return hours.toFixed(2);
}

export function formatRatio(planOtMinutes: number, actualOtMinutes: number): string {
  if (planOtMinutes <= 0) return '—';
  return `${(actualOtMinutes / planOtMinutes).toFixed(2)}×`;
}

export const OT_LEVEL_META: Record<OtAlertLevel, { label: string; badge: string }> = {
  normal: { label: 'Normal', badge: 'bg-success/15 text-success' },
  yellow: { label: 'Yellow', badge: 'bg-yellow-100 text-yellow-800' },
  orange: { label: 'Orange', badge: 'bg-orange-100 text-orange-800' },
  red: { label: 'Red', badge: 'bg-red-100 text-red-700' },
};
