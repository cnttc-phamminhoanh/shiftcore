// EXPORTS: IDailySummary, MOCK_DAILY_SUMMARY
import { shiftSampleDate } from '@/lib/sample-period';
export interface IDailySummary {
  id: string;
  date: string;
  department: 'CUT' | 'SEW' | 'EMB' | 'PRI' | 'FIN' | 'PAC' | 'SOC' | 'OTHER';
  // Bảng "Chi tiết bộ phận" gộp theo NGÀY + BỘ PHẬN (quyết định 30/10/2026):
  // không hiển thị cột "Bộ phận chi tiết" / "Ngày cấp plan" — server không trả
  // process/planIssueDate; 2 trường này chỉ còn trong dữ liệu mẫu (demo).
  process?: string;
  workers: number;
  // 31/10/2026 — cột "OT >= 4h": số công nhân TỔNG OT trong khoảng >= 4h theo
  // bộ phận (server trả; demo không có).
  otGe4?: number;
  planHours: number;
  planIssueDate?: string;
  actualOtHours: number;
  overCount: number;

  // Công thức trạng thái tổng (30/10/2026):
  //   green  — trong kế hoạch
  //   yellow — chênh lệch nhỏ (P+0.5WD ≤ A < P+0.75WD)
  //   orange — chênh lệch lớn
  //   red    — bất thường (vượt ngưỡng hoặc thực tế < kế hoạch)
  //   neutral— dữ liệu thiếu/không hợp lệ
  status: 'green' | 'yellow' | 'orange' | 'red' | 'neutral';
}

// Illustrative sample data — not real production data.
// planHours/actualOtHours: decimal hours;
// planIssueDate: date the OT plan was issued (before the working date).
const RAW_DAILY_SUMMARY: IDailySummary[] = [
  {
    id: '1',
    date: '2025-10-31',
    department: 'SEW',
    process: 'Sewing Mainline',
    workers: 120,
    planHours: 180,
    planIssueDate: '2025-10-30',
    actualOtHours: 85.5,
    overCount: 0,
    status: 'green',
  },
  {
    id: '2',
    date: '2025-10-31',
    department: 'CUT',
    process: 'Cutting',
    workers: 40,
    planHours: 112,
    planIssueDate: '2025-10-30',
    actualOtHours: 52.0,
    overCount: 0,
    status: 'yellow',
  },
  {
    id: '3',
    date: '2025-10-31',
    department: 'EMB',
    process: 'Embroidery',
    workers: 35,
    planHours: 60,
    planIssueDate: '2025-10-29',
    actualOtHours: 28.5,
    overCount: 0,
    status: 'green',
  },
  {
    id: '4',
    date: '2025-10-31',
    department: 'PRI',
    process: 'Printing',
    workers: 60,
    planHours: 90,
    planIssueDate: '2025-10-30',
    actualOtHours: 41.0,
    overCount: 0,
    status: 'green',
  },
  {
    id: '5',
    date: '2025-10-31',
    department: 'PAC',
    process: 'Packing',
    workers: 80,
    planHours: 80,
    planIssueDate: '2025-10-29',
    actualOtHours: 36.0,
    overCount: 0,
    status: 'orange',
  },
  {
    id: '6',
    date: '2025-10-31',
    department: 'FIN',
    process: 'Finishing',
    workers: 50,
    planHours: 40,
    planIssueDate: '2025-10-28',
    actualOtHours: 18.5,
    overCount: 0,
    status: 'orange',
  },
  {
    id: '7',
    date: '2025-10-31',
    department: 'OTHER',
    process: 'Inspection',
    workers: 40,
    planHours: 28,
    planIssueDate: '2025-10-30',
    actualOtHours: 12.0,
    overCount: 0,
    status: 'red',
  },
];

// Re-anchored to today on every load (see lib/sample-period) so the rolling
// 3-month default search window always contains the illustrative rows.
export const MOCK_DAILY_SUMMARY: IDailySummary[] = RAW_DAILY_SUMMARY.map(
  (row) => ({
    ...row,
    date: shiftSampleDate(row.date),
    planIssueDate: shiftSampleDate(row.planIssueDate),
  })
);
