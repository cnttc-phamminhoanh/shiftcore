// ============================================================
// DỮ LIỆU DEMO — port NGUYÊN VĂN bộ dữ liệu mẫu của UI (src/data/*.ts)
// để dashboard chạy end-to-end ngay cả khi chưa cấu hình DB thật (DEMO=1).
// Ngày được neo lại theo ngày hôm nay (giống lib/sample-period.ts của UI),
// nên cửa sổ tìm kiếm 3 tháng mặc định luôn chứa dữ liệu mẫu.
// ============================================================
function shiftSampleDate(iso) {
  if (!iso) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const anchor = new Date(2025, 9, 31); // 2025-10-31
  const date = new Date(y, m - 1, d);
  const offset = Math.round((date - anchor) / 86400000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  today.setDate(today.getDate() + offset);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

const RAW_OT_RECORDS = [
  { id: '1', date: '2025-10-29', workerId: 'W-101', workerName: 'Tran Van Binh', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 60 },
  { id: '2', date: '2025-10-29', workerId: 'W-205', workerName: 'Le Thi Hoa', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 90 },
  { id: '3', date: '2025-10-29', workerId: 'W-312', workerName: 'Pham Minh Duc', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 120 },
  { id: '4', date: '2025-10-29', workerId: 'W-408', workerName: 'Vo Thi Lan', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 180 },
  { id: '5', date: '2025-10-29', workerId: 'W-509', workerName: 'Do Anh Tuan', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 180, planIssueDate: '2025-10-28', actualOtMinutes: 80 },
  { id: '6', date: '2025-10-29', workerId: 'W-313', workerName: 'Nguyen Thi Mai', department: 'OTHER', process: 'Inspection', workers: 40, planOtMinutes: 0, planIssueDate: '2025-10-28', actualOtMinutes: 45 },
  { id: '7', date: '2025-10-29', workerId: 'W-601', workerName: 'Bui Van Nam', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 110 },
  { id: '8', date: '2025-10-30', workerId: 'W-102', workerName: 'Hoang Van Long', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 150 },
  { id: '9', date: '2025-10-30', workerId: 'W-206', workerName: 'Dang Thi Thu', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 240, planIssueDate: '2025-10-29', actualOtMinutes: 120 },
  { id: '10', date: '2025-10-30', workerId: 'W-301', workerName: 'Ly Thanh Son', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 90, planIssueDate: '2025-10-29', actualOtMinutes: 150 },
  { id: '11', date: '2025-10-30', workerId: 'W-409', workerName: 'Trinh Thi Ngoc', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 75 },
  { id: '12', date: '2025-10-30', workerId: 'W-510', workerName: 'Ngo Van Hai', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 60 },
  { id: '13', date: '2025-10-30', workerId: 'W-314', workerName: 'Duong Thi Kim', department: 'OTHER', process: 'Inspection', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 100 },
  { id: '14', date: '2025-10-30', workerId: 'W-602', workerName: 'Vu Dinh Quan', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 0, planIssueDate: '2025-10-29', actualOtMinutes: 90 },
  { id: '15', date: '2025-10-31', workerId: 'W-103', workerName: 'Phan Van Thanh', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 200 },
  { id: '16', date: '2025-10-31', workerId: 'W-207', workerName: 'Mai Thi Xuan', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 140 },
  { id: '17', date: '2025-10-31', workerId: 'W-302', workerName: 'Ta Quang Huy', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 55 },
  { id: '18', date: '2025-10-31', workerId: 'W-410', workerName: 'Cao Thi Diep', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 90, planIssueDate: '2025-10-30', actualOtMinutes: 45 },
  { id: '19', date: '2025-10-31', workerId: 'W-511', workerName: 'Luu Van Phong', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 180, planIssueDate: '2025-10-30', actualOtMinutes: 120 },
  { id: '20', date: '2025-10-31', workerId: 'W-315', workerName: 'Ha Thi Yen', department: 'OTHER', process: 'Inspection', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 60 },
  { id: '21', date: '2025-10-31', workerId: 'W-603', workerName: 'Dinh Cong Thang', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 95 },
  { id: '22', date: '2025-10-29', workerId: 'W-104', workerName: 'Nguyen Van Hung', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 180, planIssueDate: '2025-10-28', actualOtMinutes: 250 },
  { id: '23', date: '2025-10-29', workerId: 'W-208', workerName: 'Pham Thi Thuy', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 240 },
  { id: '24', date: '2025-10-29', workerId: 'W-512', workerName: 'Dang Van Luc', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 120, planIssueDate: '2025-10-28', actualOtMinutes: 200 },
  { id: '25', date: '2025-10-29', workerId: 'W-316', workerName: 'Hoang Thi Nga', department: 'OTHER', process: 'Inspection', workers: 40, planOtMinutes: 90, planIssueDate: '2025-10-28', actualOtMinutes: 130 },
  { id: '26', date: '2025-10-30', workerId: 'W-105', workerName: 'Le Van Tuan', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 180, planIssueDate: '2025-10-29', actualOtMinutes: 260 },
  { id: '27', date: '2025-10-30', workerId: 'W-209', workerName: 'Nguyen Thi Bich', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 190 },
  { id: '28', date: '2025-10-30', workerId: 'W-411', workerName: 'Tran Van Phuc', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 245 },
  { id: '29', date: '2025-10-30', workerId: 'W-604', workerName: 'Bui Thi Hong', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 120, planIssueDate: '2025-10-29', actualOtMinutes: 150 },
  { id: '30', date: '2025-10-30', workerId: 'W-303', workerName: 'Ngo Thi Thanh', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 90, planIssueDate: '2025-10-29', actualOtMinutes: 135 },
  { id: '31', date: '2025-10-31', workerId: 'W-106', workerName: 'Vu Van Duc', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 210 },
  { id: '32', date: '2025-10-31', workerId: 'W-210', workerName: 'Dinh Thi Lan', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 180, planIssueDate: '2025-10-30', actualOtMinutes: 255 },
  { id: '33', date: '2025-10-31', workerId: 'W-513', workerName: 'Ta Van Hung', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 180, planIssueDate: '2025-10-30', actualOtMinutes: 240 },
  { id: '34', date: '2025-10-31', workerId: 'W-605', workerName: 'Ly Thi Thu', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 120, planIssueDate: '2025-10-30', actualOtMinutes: 170 },
  { id: '35', date: '2025-10-29', workerId: 'W-107', workerName: 'Dinh Van Truong', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 180, planIssueDate: '2025-10-28', actualOtMinutes: 300 },
  { id: '36', date: '2025-10-29', workerId: 'W-310', workerName: 'Ho Thi Cam', department: 'EMB', process: 'Embroidery', workers: 35, planOtMinutes: 180, planIssueDate: '2025-10-28', actualOtMinutes: 270 },
  { id: '37', date: '2025-10-29', workerId: 'W-606', workerName: 'Ngo Van Kha', department: 'PAC', process: 'Packing', workers: 80, planOtMinutes: 180, planIssueDate: '2025-10-28', actualOtMinutes: 285 },
  { id: '38', date: '2025-10-30', workerId: 'W-211', workerName: 'Dang Thi Tuyet', department: 'SEW', process: 'Sewing', workers: 120, planOtMinutes: 180, planIssueDate: '2025-10-29', actualOtMinutes: 350 },
  { id: '39', date: '2025-10-30', workerId: 'W-505', workerName: 'Ly Van Khanh', department: 'FIN', process: 'Finishing', workers: 50, planOtMinutes: 180, planIssueDate: '2025-10-29', actualOtMinutes: 270 },
  { id: '40', date: '2025-10-31', workerId: 'W-108', workerName: 'Tran Thi Nhung', department: 'CUT', process: 'Cutting', workers: 40, planOtMinutes: 180, planIssueDate: '2025-10-30', actualOtMinutes: 290 },
  { id: '41', date: '2025-10-31', workerId: 'W-412', workerName: 'Pham Van Tai', department: 'PRI', process: 'Printing', workers: 60, planOtMinutes: 180, planIssueDate: '2025-10-30', actualOtMinutes: 260 },
];

const RAW_DAILY_SUMMARY = [
  { id: '1', date: '2025-10-31', department: 'SEW', process: 'Sewing Mainline', workers: 120, planHours: 180, planIssueDate: '2025-10-30', actualOtHours: 85.5, status: 'Normal' },
  { id: '2', date: '2025-10-31', department: 'CUT', process: 'Cutting', workers: 40, planHours: 112, planIssueDate: '2025-10-30', actualOtHours: 52.0, status: 'On Track' },
  { id: '3', date: '2025-10-31', department: 'EMB', process: 'Embroidery', workers: 35, planHours: 60, planIssueDate: '2025-10-29', actualOtHours: 28.5, status: 'Normal' },
  { id: '4', date: '2025-10-31', department: 'PRI', process: 'Printing', workers: 60, planHours: 90, planIssueDate: '2025-10-30', actualOtHours: 41.0, status: 'Normal' },
  { id: '5', date: '2025-10-31', department: 'PAC', process: 'Packing', workers: 80, planHours: 80, planIssueDate: '2025-10-29', actualOtHours: 36.0, status: 'Delay' },
  { id: '6', date: '2025-10-31', department: 'FIN', process: 'Finishing', workers: 50, planHours: 40, planIssueDate: '2025-10-28', actualOtHours: 18.5, status: 'Delay' },
  { id: '7', date: '2025-10-31', department: 'OTHER', process: 'Inspection', workers: 40, planHours: 28, planIssueDate: '2025-10-30', actualOtHours: 12.0, status: 'Critical' },
];

// KPI demo (khớp mock team UI): Plan 60,000h vs Actual 185,000h → thẻ ĐỎ
// (ngưỡng đỏ ~60,000 + 1,250 × ~93 ngày ≈ 176,250h). Khi nối DB thật, backend tính lại.
const RAW_KPI = [
  { id: '1', title: 'Worker Count', value: 1250, unit: 'people', trend: 4.2, sparkline: [1180, 1200, 1195, 1220, 1240, 1250] },
  { id: '2', title: 'Total OT (Plan)', value: 60000, unit: 'hours', trend: 8.7, sparkline: [52000, 54000, 56000, 58000, 59000, 60000] },
  { id: '3', title: 'Actual OT', value: 185000, unit: 'hours', trend: 22.5, sparkline: [150000, 158000, 166000, 174000, 180000, 185000] },
];

// 3 tháng gần nhất (Month 8/9/10) — khớp MONTH_LABELS + MONTH_PERIODS của UI.
const RAW_MONTHLY = [
  { id: '1', month: 'Month 8', planOtHours: 2080, actualOtHours: 2880 },
  { id: '2', month: 'Month 9', planOtHours: 2160, actualOtHours: 3240 },
  { id: '3', month: 'Month 10', planOtHours: 2240, actualOtHours: 3600 },
];

// Xu hướng theo tháng x phòng ban (đủ 7 nhóm, 3 tháng) — giống UI.
const RAW_DEPT_TREND = [
  { id: '1', month: 'Month 8', department: 'CUT', hours: 560 }, { id: '2', month: 'Month 9', department: 'CUT', hours: 620 }, { id: '3', month: 'Month 10', department: 'CUT', hours: 690 },
  { id: '4', month: 'Month 8', department: 'SEW', hours: 820 }, { id: '5', month: 'Month 9', department: 'SEW', hours: 930 }, { id: '6', month: 'Month 10', department: 'SEW', hours: 1040 },
  { id: '7', month: 'Month 8', department: 'EMB', hours: 380 }, { id: '8', month: 'Month 9', department: 'EMB', hours: 430 }, { id: '9', month: 'Month 10', department: 'EMB', hours: 480 },
  { id: '10', month: 'Month 8', department: 'PRI', hours: 350 }, { id: '11', month: 'Month 9', department: 'PRI', hours: 390 }, { id: '12', month: 'Month 10', department: 'PRI', hours: 430 },
  { id: '13', month: 'Month 8', department: 'FIN', hours: 320 }, { id: '14', month: 'Month 9', department: 'FIN', hours: 360 }, { id: '15', month: 'Month 10', department: 'FIN', hours: 400 },
  { id: '16', month: 'Month 8', department: 'OTHER', hours: 270 }, { id: '17', month: 'Month 9', department: 'OTHER', hours: 300 }, { id: '18', month: 'Month 10', department: 'OTHER', hours: 330 },
  { id: '19', month: 'Month 8', department: 'PAC', hours: 180 }, { id: '20', month: 'Month 9', department: 'PAC', hours: 210 }, { id: '21', month: 'Month 10', department: 'PAC', hours: 230 },
];

export function getRecords() {
  return RAW_OT_RECORDS.map((r) => ({
    ...r,
    date: shiftSampleDate(r.date),
    planIssueDate: shiftSampleDate(r.planIssueDate),
  }));
}

export function getDailySummary() {
  return RAW_DAILY_SUMMARY.map((r) => ({
    ...r,
    date: shiftSampleDate(r.date),
    planIssueDate: shiftSampleDate(r.planIssueDate),
  }));
}

export function getKpi() {
  return RAW_KPI.map((k) => ({ ...k }));
}

export function getMonthly() {
  return RAW_MONTHLY.map((m) => ({ ...m }));
}

export function getDepartmentTrend() {
  return RAW_DEPT_TREND.map((d) => ({ ...d }));
}
