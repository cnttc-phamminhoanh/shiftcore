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

export const DEPARTMENT_COLORS: Record<string, string> = {
  CUT: '#2563EB',
  SEW: '#16A34A',
  EMB: '#F97316',
  PRI: '#9333EA',
  PRN: '#9333EA',
  // 31/10/2026: FIN đổi từ hồng-đỏ (#F43F5E) sang teal (#14B8A6) — màu đỏ
  // dễ bị hiểu nhầm là cảnh báo/nguy hiểm; teal không trùng màu nào khác.
  FIN: '#14B8A6',
  SOC: '#D97706',
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
