// EXPORTS: IWorkerOtRecord, MOCK_OT_RECORDS
import { shiftSampleDate } from '@/lib/sample-period';

// Illustrative sample data — per worker / per day overtime records,
// pending attendance & OT-registration API integration.
// planOtMinutes / actualOtMinutes are overtime minutes on the same working day;
// workers = headcount of the process on that day; planIssueDate = date the OT
// plan was issued (before the working date).
export interface IWorkerOtRecord {
  id: string;
  date: string;
  workerId: string;
  workerName: string;
  department: 'CUT' | 'SEW' | 'EMB' | 'PRI' | 'FIN' | 'PAC' | 'SOC' | 'OTHER';
  process: string;
  workers: number;
  planOtMinutes: number;
  planIssueDate: string;
  actualOtMinutes: number;
}

const RAW_OT_RECORDS: IWorkerOtRecord[] = [
  // 2025-10-29
  { id: '1', date: '2025-10-29', workerId: 'W-101', workerName: 'Tran Van Binh', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 60 },
  { id: '2', date: '2025-10-29', workerId: 'W-205', workerName: 'Le Thi Hoa', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 90 },
  { id: '3', date: '2025-10-29', workerId: 'W-312', workerName: 'Pham Minh Duc', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 120 },
  { id: '4', date: '2025-10-29', workerId: 'W-408', workerName: 'Vo Thi Lan', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 180 },
  { id: '5', date: '2025-10-29', workerId: 'W-509', workerName: 'Do Anh Tuan', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 180, planIssueDate: '2025-10-28', actualOtMinutes: 80 },
  { id: '6', date: '2025-10-29', workerId: 'W-313', workerName: 'Nguyen Thi Mai', department: 'OTHER', process: 'Inspection', workers: 40, planOtMinutes: 0, planIssueDate: '2025-10-28', actualOtMinutes: 45 },
  { id: '7', date: '2025-10-29', workerId: 'W-601', workerName: 'Bui Van Nam', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 110 },
  // 2025-10-30
  { id: '8', date: '2025-10-30', workerId: 'W-102', workerName: 'Hoang Van Long', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 150 },
  { id: '9', date: '2025-10-30', workerId: 'W-206', workerName: 'Dang Thi Thu', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 240, planIssueDate: '2025-10-29', actualOtMinutes: 120 },
  { id: '10', date: '2025-10-30', workerId: 'W-301', workerName: 'Ly Thanh Son', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 90, planIssueDate: '2025-10-29', actualOtMinutes: 150 },
  { id: '11', date: '2025-10-30', workerId: 'W-409', workerName: 'Trinh Thi Ngoc', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 75 },
  { id: '12', date: '2025-10-30', workerId: 'W-510', workerName: 'Ngo Van Hai', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 60 },
  { id: '13', date: '2025-10-30', workerId: 'W-314', workerName: 'Duong Thi Kim', department: 'OTHER', process: 'Inspection', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 100 },
  { id: '14', date: '2025-10-30', workerId: 'W-602', workerName: 'Vu Dinh Quan', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 0, planIssueDate: '2025-10-29', actualOtMinutes: 90 },
  // 2025-10-31
  { id: '15', date: '2025-10-31', workerId: 'W-103', workerName: 'Phan Van Thanh', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 200 },
  { id: '16', date: '2025-10-31', workerId: 'W-207', workerName: 'Mai Thi Xuan', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 140 },
  { id: '17', date: '2025-10-31', workerId: 'W-302', workerName: 'Ta Quang Huy', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 55 },
  { id: '18', date: '2025-10-31', workerId: 'W-410', workerName: 'Cao Thi Diep', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 90, planIssueDate: '2025-10-30', actualOtMinutes: 45 },
  { id: '19', date: '2025-10-31', workerId: 'W-511', workerName: 'Luu Van Phong', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 180, planIssueDate: '2025-10-30', actualOtMinutes: 120 },
  { id: '20', date: '2025-10-31', workerId: 'W-315', workerName: 'Ha Thi Yen', department: 'OTHER', process: 'Inspection', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 60 },
  { id: '21', date: '2025-10-31', workerId: 'W-603', workerName: 'Dinh Cong Thang', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 95 },
  // Additional illustrative records covering the abnormal-OT bands of the
  // department alert chart: pink = 2h < actual OT < 4h, red = actual OT >= 4h.
  // 2025-10-29
  { id: '22', date: '2025-10-29', workerId: 'W-104', workerName: 'Nguyen Van Hung', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 270, planIssueDate: '2025-10-28', actualOtMinutes: 250 },
  { id: '23', date: '2025-10-29', workerId: 'W-208', workerName: 'Pham Thi Thuy', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 260, planIssueDate: '2025-10-28', actualOtMinutes: 240 },
  { id: '24', date: '2025-10-29', workerId: 'W-512', workerName: 'Dang Van Luc', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 250, planIssueDate: '2025-10-28', actualOtMinutes: 200 },
  { id: '25', date: '2025-10-29', workerId: 'W-316', workerName: 'Hoang Thi Nga', department: 'OTHER', process: 'Inspection', workers: 40, planOtMinutes: 90, planIssueDate: '2025-10-28', actualOtMinutes: 130 },
  // 2025-10-30
  { id: '26', date: '2025-10-30', workerId: 'W-105', workerName: 'Le Van Tuan', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 300, planIssueDate: '2025-10-29', actualOtMinutes: 260 },
  { id: '27', date: '2025-10-30', workerId: 'W-209', workerName: 'Nguyen Thi Bich', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 240, planIssueDate: '2025-10-29', actualOtMinutes: 190 },
  { id: '28', date: '2025-10-30', workerId: 'W-411', workerName: 'Tran Van Phuc', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 255, planIssueDate: '2025-10-29', actualOtMinutes: 245 },
  { id: '29', date: '2025-10-30', workerId: 'W-604', workerName: 'Bui Thi Hong', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 150 },
  { id: '30', date: '2025-10-30', workerId: 'W-303', workerName: 'Ngo Thi Thanh', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 90, planIssueDate: '2025-10-29', actualOtMinutes: 135 },
  // 2025-10-31
  { id: '31', date: '2025-10-31', workerId: 'W-106', workerName: 'Vu Van Duc', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 260, planIssueDate: '2025-10-30', actualOtMinutes: 210 },
  { id: '32', date: '2025-10-31', workerId: 'W-210', workerName: 'Dinh Thi Lan', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 250, planIssueDate: '2025-10-30', actualOtMinutes: 255 },
  { id: '33', date: '2025-10-31', workerId: 'W-513', workerName: 'Ta Van Hung', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 240, planIssueDate: '2025-10-30', actualOtMinutes: 240 },
  { id: '34', date: '2025-10-31', workerId: 'W-605', workerName: 'Ly Thi Thu', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 170 },
  // Spike-OT records (actual OT >= 4h in one working day) feeding the
  // per-worker spike chart. All statuses below are RED.
  // 2025-10-29
  { id: '35', date: '2025-10-29', workerId: 'W-107', workerName: 'Dinh Van Truong', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 290, planIssueDate: '2025-10-28', actualOtMinutes: 300 },
  { id: '36', date: '2025-10-29', workerId: 'W-310', workerName: 'Ho Thi Cam', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 260, planIssueDate: '2025-10-28', actualOtMinutes: 270 },
  { id: '37', date: '2025-10-29', workerId: 'W-606', workerName: 'Ngo Van Kha', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 250, planIssueDate: '2025-10-28', actualOtMinutes: 285 },
  // 2025-10-30
  { id: '38', date: '2025-10-30', workerId: 'W-211', workerName: 'Dang Thi Tuyet', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 280, planIssueDate: '2025-10-29', actualOtMinutes: 350 },
  { id: '39', date: '2025-10-30', workerId: 'W-505', workerName: 'Ly Van Khanh', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 265, planIssueDate: '2025-10-29', actualOtMinutes: 270 },
  // 2025-10-31
  { id: '40', date: '2025-10-31', workerId: 'W-108', workerName: 'Tran Thi Nhung', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 275, planIssueDate: '2025-10-30', actualOtMinutes: 290 },
  { id: '41', date: '2025-10-31', workerId: 'W-412', workerName: 'Pham Van Tai', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 245, planIssueDate: '2025-10-30', actualOtMinutes: 260 },
];

// Re-anchored to today on every load (see lib/sample-period) so the rolling
// 3-month default search window always contains the illustrative records.
export const MOCK_OT_RECORDS: IWorkerOtRecord[] = RAW_OT_RECORDS.map(
  (record) => ({
    ...record,
    date: shiftSampleDate(record.date),
    planIssueDate: shiftSampleDate(record.planIssueDate),
  })
);
