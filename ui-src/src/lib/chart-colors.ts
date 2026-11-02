// Chart palette derived from the navy/blue/teal design language.
// Hex literals are required for chart libraries (they do not parse CSS vars).
export const CHART_COLORS = [
  '#2563EB', // chart-1 blue (CUT)
  '#10B981', // chart-2 green (SEW)
  '#F59E0B', // chart-3 amber (EMB)
  '#8B5CF6', // chart-4 violet (PRI)
  '#EF4444', // chart-5 red (FIN)
  '#06B6D4', // cyan (Other)
  '#A855F7', // purple (PAC)
];

// 01/11/2026: rà soát màu phân biệt bộ phận — KHÔNG dùng xanh lá / vàng /
// cam / đỏ (màu cảnh báo). Nút "Tất cả bộ phận" active dùng màu xanh dương
// primary (#2563EB) → CUT KHÁC xanh dương. CUT trải qua blue-700 → violet
// (giống PRI tím) → nay: xanh ngọc ĐẬM (cyan-800) — khác hẳn PRI tím, SEW
// sky sáng, FIN teal, PAC cyan. SEW: xanh da trời; EMB: indigo; SOC: nâu
// đất; FIN: teal.
export const DEPARTMENT_COLORS: Record<string, string> = {
  CUT: '#155E75',
  SEW: '#0EA5E9',
  EMB: '#6366F1',
  PRI: '#9333EA',
  PRN: '#9333EA',
  FIN: '#14B8A6',
  SOC: '#B45309',
  OTHER: '#475569',
  PAK: '#06B6D4',
  PAC: '#06B6D4',
};

// 31/10/2026: đồng bộ với màu KPI — Plan = xanh dương (như card
// "Total OT (Plan)"), Actual = xanh lá (như card "Actual OT" ở trạng thái
// bình thường). Trước đây chart dùng teal/blue nên lệch màu với KPI.
export const PLAN_COLOR = '#2563EB'; // royal blue, khớp KPI Total OT (Plan)
export const ACTUAL_COLOR = '#10B981'; // emerald, khớp KPI Actual OT (status green)

// ECharts draws text on <canvas>, which does NOT inherit the page font stack —
// without an explicit family, Vietnamese diacritics fall back to an ugly
// default canvas font. All chart text must use this stack (matches the UI).
export const CHART_FONT_FAMILY =
  "'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
