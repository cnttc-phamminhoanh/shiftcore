// ============================================================
// Các quy tắc nghiệp vụ — port NGUYÊN XI từ logic đã encode trong UI
// (src/lib/ot-alert.ts, worker-ot-status.ts, actual-ot-status.ts)
// để backend và giao diện không bao giờ lệch nhau.
// ============================================================

// ---------- Cấp cảnh báo theo tỷ lệ: Actual OT / Plan OT (theo ngày, theo công nhân) ----------
// normal: không vượt đăng ký (hoặc không có đăng ký)
// yellow: Plan < Actual < 2x Plan
// orange: 2x Plan <= Actual < 3x Plan
// red:    Actual >= 3x Plan
export function getOtAlertLevel(planOtMinutes, actualOtMinutes) {
  if (planOtMinutes <= 0) return 'normal';
  if (actualOtMinutes <= planOtMinutes) return 'normal';
  const ratio = actualOtMinutes / planOtMinutes;
  if (ratio < 2) return 'yellow';
  if (ratio < 3) return 'orange';
  return 'red';
}

// ---------- Cảnh báo theo GIỜ OT TUYỆT ĐỐI của công nhân (theo ngày) ----------
// normal: Actual OT <= 2h ; pink: 2h < Actual < 4h ; red: Actual >= 4h
// Thiếu dữ liệu / không hợp lệ KHÔNG coi là 0h — trả về normal (bỏ qua).
export function getWorkerOtAlertStatus(actualOtMinutes) {
  if (actualOtMinutes == null || !Number.isFinite(actualOtMinutes) || actualOtMinutes < 0) {
    return 'normal';
  }
  if (actualOtMinutes >= 240) return 'red';
  if (actualOtMinutes > 120) return 'pink';
  return 'normal';
}

// ---------- Ngưỡng spike: OT thực tế >= 4h trong MỘT ngày làm việc ----------
export const SPIKE_OT_THRESHOLD_MINUTES = 240;

// Gộp OT thực tế theo (công nhân, ngày làm việc): các phân đoạn cùng ngày
// được CỘNG trước khi so ngưỡng; KHÔNG bao giờ cộng dồn nhiều ngày.
export function aggregateWorkerOtSpikes(records) {
  const acc = new Map();
  for (const record of records || []) {
    if (!record || typeof record.workerId !== 'string' || typeof record.date !== 'string') continue;
    const minutes = typeof record.actualOtMinutes === 'number' && record.actualOtMinutes > 0
      ? record.actualOtMinutes
      : 0;
    if (minutes <= 0) continue;
    const key = `${record.date}::${record.workerId}`;
    const existing = acc.get(key);
    if (existing) {
      existing.actualOtMinutes += minutes;
      continue;
    }
    acc.set(key, {
      workerNo: record.workerId,
      name: typeof record.workerName === 'string' ? record.workerName : '',
      department: record.department,
      workDate: record.date,
      actualOtMinutes: minutes,
    });
  }
  return Array.from(acc.values())
    .filter((row) => row.actualOtMinutes >= SPIKE_OT_THRESHOLD_MINUTES)
    .sort(
      (a, b) =>
        b.actualOtMinutes - a.actualOtMinutes ||
        b.workDate.localeCompare(a.workDate) ||
        a.workerNo.localeCompare(b.workerNo)
    );
}

// ---------- Cấp cảnh báo theo số công nhân spike trong 1 ngày (theo phòng ban) ----------
// <5 green normal · 5-7 yellow watch · 8-10 orange high · >10 red critical
export function getOTWorkerAlert(count) {
  if (count == null || !Number.isFinite(count) || count < 0) {
    return { level: 'noData', color: '#94A3B8' };
  }
  if (count < 5) return { level: 'normal', color: '#22C55E' };
  if (count < 8) return { level: 'watch', color: '#FACC15' };
  if (count <= 10) return { level: 'high', color: '#F97316' };
  return { level: 'critical', color: '#EF4444' };
}

// ---------- Thống kê spike theo 7 nhóm phòng ban cố định ----------
// workerDays: số lượt công nhân-ngày (1 công nhân đếm tối đa 1 lần/ngày)
// uniqueWorkers: số công nhân khác nhau
// maxDailyWorkers: số công nhân spike vào NGÀY CAO NHẤT của phòng ban
//   (chiều cao cột VÀ màu cảnh báo đều dựa trên con số theo-ngày này)
export function buildDepartmentSpikeStats(records) {
  const SPIKE_DEPARTMENT_GROUPS = ['CUT', 'SEW', 'EMB', 'PRI', 'FIN', 'PAC', 'OTHER'];
  const rows = aggregateWorkerOtSpikes(records);
  const acc = new Map();
  for (const group of SPIKE_DEPARTMENT_GROUPS) {
    acc.set(group, { workerDays: 0, workers: new Set(), daily: new Map() });
  }
  const allWorkers = new Set();
  for (const row of rows) {
    const group = SPIKE_DEPARTMENT_GROUPS.includes(row.department)
      ? row.department
      : 'OTHER';
    const bucket = acc.get(group);
    bucket.workerDays += 1;
    bucket.workers.add(row.workerNo);
    bucket.daily.set(row.workDate, (bucket.daily.get(row.workDate) || 0) + 1);
    allWorkers.add(row.workerNo);
  }
  const buckets = SPIKE_DEPARTMENT_GROUPS.map((department) => {
    const b = acc.get(department);
    let maxDailyWorkers = 0;
    let peakDate = '';
    for (const [date, count] of Array.from(b.daily.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (count > maxDailyWorkers) {
        maxDailyWorkers = count;
        peakDate = date;
      }
    }
    return {
      department,
      workerDays: b.workerDays,
      uniqueWorkers: b.workers.size,
      maxDailyWorkers,
      peakDate,
      alert: getOTWorkerAlert(maxDailyWorkers),
    };
  });
  return {
    buckets,
    totalWorkerDays: rows.length,
    uniqueWorkers: allWorkers.size,
    activeDepartments: buckets.filter((b) => b.workerDays > 0).length,
  };
}

// ---------- Trạng thái thẻ KPI "Actual OT" ----------
// green  : A <  P + W * 0.5  * D
// yellow : A >= P + W * 0.5  * D và A < P + W * 0.75 * D
// orange : A >= P + W * 0.75 * D và A <= P + W * 1    * D
// red    : A >  P + W * 1    * D
// neutral: dữ liệu thiếu/không hợp lệ
export function getActualOTStatus(actualOT, planOT, totalWorkers, searchDays) {
  if (
    !Number.isFinite(actualOT) || !Number.isFinite(planOT) ||
    !Number.isFinite(totalWorkers) || !Number.isFinite(searchDays) ||
    actualOT < 0 || planOT < 0 || totalWorkers < 0 || searchDays <= 0
  ) {
    return 'neutral';
  }
  const yellowThreshold = planOT + totalWorkers * 0.5 * searchDays;
  const orangeThreshold = planOT + totalWorkers * 0.75 * searchDays;
  const redThreshold = planOT + totalWorkers * 1 * searchDays;
  if (actualOT > redThreshold) return 'red';
  if (actualOT >= orangeThreshold) return 'orange';
  if (actualOT >= yellowThreshold) return 'yellow';
  return 'green';
}

// ---------- Trạng thái dòng summary (Normal / On Track / Delay / Critical) ----------
// Đây là quy ước PHỤ cho bảng process (UI không hiển thị cột status):
//   ratio = actual / plan (plan > 0): <=1 Normal · <=1.2 On Track · <=2 Delay · >2 Critical
//   plan == 0: actual == 0 → Normal, ngược lại → Critical
export function getDailySummaryStatus(planHours, actualOtHours) {
  if (planHours <= 0) return actualOtHours > 0 ? 'Critical' : 'Normal';
  const ratio = actualOtHours / planHours;
  if (ratio <= 1) return 'Normal';
  if (ratio <= 1.2) return 'On Track';
  if (ratio <= 2) return 'Delay';
  return 'Critical';
}
