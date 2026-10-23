// EXPORTS: IDailySummary, MOCK_DAILY_SUMMARY
import { shiftSampleDate } from '@/lib/sample-period';
export interface IDailySummary {
  id: string;
  date: string;
  department: 'CUT' | 'SEW' | 'EMB' | 'PRI' | 'FIN' | 'OTHER' | 'PAC';
  process: string;
  workers: number;
  planHours: number;
  planIssueDate: string;
  actualOtHours: number;
  scanTimeMinutes: number;
  status: 'Normal' | 'On Track' | 'Delay' | 'Critical';
}

// Illustrative sample data — not real production data.
// planHours/actualOtHours: decimal hours; scanTimeMinutes: total scanned minutes;
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
    scanTimeMinutes: 450,
    status: 'Normal',
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
    scanTimeMinutes: 320,
    status: 'On Track',
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
    scanTimeMinutes: 280,
    status: 'Normal',
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
    scanTimeMinutes: 305,
    status: 'Normal',
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
    scanTimeMinutes: 260,
    status: 'Delay',
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
    scanTimeMinutes: 220,
    status: 'Delay',
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
    scanTimeMinutes: 220,
    status: 'Critical',
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
