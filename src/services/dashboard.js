// ============================================================
// TỔNG HỢP DASHBOARD — gộp 2 nguồn thành 1 khung dữ liệu:
//   HR (chấm công thực) + T8 (đơn tăng ca) = NGUỒN TÍNH CHÍNH
// Khóa liên kết: HR.code = T8.emp_no
// ============================================================
import { demoEnabled } from '../config.js';
import * as rules from '../rules/ot-alert.js';
import { mapDeptToGroup, SPIKE_DEPARTMENT_GROUPS } from '../rules/dept-groups.js';
import { getEmployees, getDepartments, getAttendanceRange, addDay } from './hr.js';
import { getOtLinesRange } from './t8.js';
import { getSnapshotDb } from './hr-snapshot.js';
import * as demo from './demo.js';

// ---------- helpers ----------
const round1 = (n) => Math.round(n * 10) / 10;

// Số ngày của khoảng from..to (bao gồm cả 2 đầu) — dùng cho công thức trạng thái tổng.
function searchDaysOf(fromIso, toIso) {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  return Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

function isoDate(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function monthPeriod(monthsAgo) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const last = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
  return { start: isoDate(first), end: isoDate(last) };
}

// Sinh danh sách tháng dựa trên khoảng from..to (động).
function _monthsInRange(from, to) {
  const out = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const label = `Month ${m}`;
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    out.push({ label, period: { start: isoDate(first), end: isoDate(last) } });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const MONTHS = [
  { label: 'Month 8', ago: 2 },
  { label: 'Month 9', ago: 1 },
  { label: 'Month 10', ago: 0 },
];

function intersects(from, to, period) {
  return !(period.end < from || period.start > to);
}

// ---------- cache kết quả gộp (5 phút) — tránh query DB lặp cho cùng khoảng ngày ----------
const recordsCache = new Map();
const recordsPending = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function loadRecordsFresh(from, to) {
  if (demoEnabled()) return demo.getRecords();
  const [emps, depts, att, lines] = await Promise.all([
    getEmployees(),
    getDepartments(),
    getAttendanceRange(from, to),
    getOtLinesRange(from, to),
  ]);

  const deptByUid = new Map(depts.map((d) => [d.uID, d]));
  const empByCode = new Map(emps.map((e) => [e.code, e]));
  const empByUid = new Map(emps.map((e) => [e.uID, e]));
  const headcountByDept = new Map();
  for (const e of emps) {
    if (e.status !== 1) continue; // chỉ đếm người ĐANG làm việc (view mới trả cả người nghỉ)
    headcountByDept.set(e.departID, (headcountByDept.get(e.departID) || 0) + 1);
  }

  // OT đăng ký (T8, chỉ sheet_sta đã duyệt) theo công nhân-ngày
  const plan = new Map();
  for (const ln of lines) {
    const key = `${ln.emp_no}::${ln.dateFr}`;
    const e = plan.get(key) || { min: 0, issue: null };
    e.min += Number(ln.sheet_hour || 0) * 60;
    if (!e.issue || ln.sheetDate < e.issue) e.issue = ln.sheetDate;
    plan.set(key, e);
  }

  // OT thực tế (HR) theo công nhân-ngày — otHours/overtimeMinutes đến từ view
  const actual = new Map();
  for (const a of att) {
    let emp = empByUid.get(a.empID);
    if (!emp) {
      // Nhân viên không còn trong danh sách hiện hành (đã nghỉ / status ≠ 1):
      // VẪN GIỮ bản ghi — nếu không, giờ OT của tháng đó bị mất khỏi tổng hợp.
      // Không có code/name → hiển thị bằng chính empID (GUID); nhóm phòng ban
      // lấy theo departID còn lưu trong dòng chấm công.
      emp = { uID: a.empID, code: a.empID, name: '', departID: a.departID };
      empByUid.set(a.empID, emp);
      empByCode.set(a.empID, emp);
    }
    const otHours = Number(a.otHours) || 0;
    const minutes = otHours > 0 ? otHours * 60 : Number(a.overtimeMinutes) || 0;
    const key = `${emp.code}::${a.fdate}`;
    // Chỉ tạo bản ghi khi có OT thực > 0 — người có mặt nhưng không tăng ca
    // (otHours=0, overtime=0) KHÔNG xuất hiện trong bảng. Người chỉ có đơn
    // kế hoạch T8 vẫn hiển thị qua vòng plan bên dưới (plan>0, actual=0).
    if (minutes > 0) {
      actual.set(key, (actual.get(key) || 0) + minutes);
    }
  }

  // Gộp thành bản ghi công nhân-ngày: hợp giữa người có chấm công và người có đăng ký
  const records = [];
  const seen = new Set();
  const push = (code, date) => {
    const key = `${code}::${date}`;
    if (seen.has(key)) return;
    seen.add(key);
    let emp = empByCode.get(code);
    if (!emp) {
      // Plan-only (T8) từ người không còn trong danh sách hiện hành — không có departID
      emp = { uID: code, code, name: '', departID: null };
    }
    const dept = deptByUid.get(emp.departID);
    const p = plan.get(key);
    records.push({
      id: key,
      date,
      workerId: code,
      workerName: emp.name || code,
      department: mapDeptToGroup(dept?.name, dept?.engName),
      process: dept?.name || '',
      workers: headcountByDept.get(emp.departID) || 0,
      planOtMinutes: p ? Math.round(p.min) : 0,
      planIssueDate: p?.issue || '',
      actualOtMinutes: Math.round(actual.get(key) || 0),
    });
  };
  for (const key of actual.keys()) {
    const [code, date] = key.split('::');
    push(code, date);
  }
  for (const key of plan.keys()) {
    const [code, date] = key.split('::');
    // Chỉ giữ đơn kế hoạch có giờ > 0 — đơn đã duyệt (sheet_sta=1) nhưng
    // sheet_hour=0 không phải kế hoạch tăng ca thực, không tạo bản ghi.
    const p = plan.get(key);
    if (!p || p.min <= 0) continue;
    push(code, date);
  }
  return records;
}

export async function loadRecords(from, to) {
  const cacheKey = `${from}::${to}`;
  const hit = recordsCache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.rows;
  // Giữ promise đang chạy để các endpoint gọi đồng thời cùng khoảng ngày
  // không build trùng (tránh 5 request song song cùng xử lý 122k dòng).
  if (recordsPending.has(cacheKey)) return recordsPending.get(cacheKey);
  const p = (async () => {
    const rows = await loadRecordsFresh(from, to);
    recordsCache.set(cacheKey, { t: Date.now(), rows });
    recordsPending.delete(cacheKey);
    return rows;
  })();
  recordsPending.set(cacheKey, p);
  return p;
}

// ---------- bộ lọc giống toolbar UI ----------
export function expandDeptParam(deptParam) {
  if (!deptParam || deptParam === 'all') return new Set(SPIKE_DEPARTMENT_GROUPS);
  return new Set(
    String(deptParam)
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  );
}

function filterRecords(records, { deptSet, process, alert, search }) {
  let rows = records;
  if (deptSet && deptSet.size < SPIKE_DEPARTMENT_GROUPS.length) {
    rows = rows.filter((r) => deptSet.has(r.department));
  }
  if (process) {
    const p = String(process).trim();
    rows = rows.filter((r) => r.process === p);
  }
  if (alert && alert !== 'all') {
    if (alert === 'overPlan') {
      rows = rows.filter((r) => r.actualOtMinutes > r.planOtMinutes);
    } else if (alert !== 'heavyOt') {
      rows = rows.filter((r) => rules.getOtAlertLevel(r.planOtMinutes, r.actualOtMinutes) === alert);
    }
  }
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter((r) =>
      `${r.department} ${r.process} ${r.workerId} ${r.workerName}`.toLowerCase().includes(q)
    );
  }
  return rows;
}

const GROUP_ORDER = Object.fromEntries(SPIKE_DEPARTMENT_GROUPS.map((g, i) => [g, i]));

// ---------- TỔNG HỢP NHANH TRỰC TIẾP TỪ SQLITE (không loop 330k bản ghi) ----------
const aggCache = new Map();
const AGG_TTL = 5 * 60 * 1000;

async function getAggregated(from, to) {
  const key = `${from}::${to}`;
  if (aggCache.has(key)) {
    const c = aggCache.get(key);
    if (Date.now() - c.t < AGG_TTL) return c.out;
  }
  // 30/10/2026 tối ưu: dùng CHUNG nguồn loadRecords (cache 5 phút) — trước đây
  // kpi/monthly/dept-trend mỗi endpoint query GROUP BY riêng, cùng mở trang = 7
  // lần quét toàn bộ dữ liệu (lạnh ~50s cho 9 tháng). Giờ mọi endpoint dùng chung
  // 1 lần đọc; chỉ giữ 1 query nhẹ đếm worker distinct (chạy nhanh nhờ index).
  const db = getSnapshotDb();
  const [records, wRow] = await Promise.all([
    loadRecords(from, to),
    db.prepare(`SELECT COUNT(DISTINCT empID) c FROM hr_ot WHERE fdate BETWEEN ? AND ?`).get(from, to),
  ]);
  // month+group -> {actualH, planH}
  const bucket = new Map();
  const get = (ym, grp) => {
    const k = `${ym}::${grp}`;
    if (!bucket.has(k)) bucket.set(k, { ym, group: grp, actualH: 0, planH: 0 });
    return bucket.get(k);
  };
  let totalActual = 0, totalPlan = 0;
  const workersByMonth = new Map(); // ym -> Set(workerId) cho sparkline Worker Count
  for (const r of records) {
    const ym = r.date.slice(0, 7);
    const b = get(ym, r.department);
    b.actualH += r.actualOtMinutes / 60;
    b.planH += r.planOtMinutes / 60;
    totalActual += r.actualOtMinutes / 60;
    totalPlan += r.planOtMinutes / 60;
    if (!workersByMonth.has(ym)) workersByMonth.set(ym, new Set());
    workersByMonth.get(ym).add(r.workerId);
  }
  const rows = Array.from(bucket.values());
  const out = { rows, totalActualH: totalActual, totalPlanH: totalPlan, totalWorkers: wRow.c, workersByMonth };
  aggCache.set(key, { t: Date.now(), out });
  return out;
}

// ---------- /api/overtime/records + process-rollup ----------
// 30/10/2026: mọi endpoint (records/process-rollup/daily/kpi/monthly/dept-trend/
// spike-stats/summary) dùng CHUNG nguồn loadRecords (cache 5 phút) — trước đây
// loadRawOtRows là 1 lần đọc riêng thứ 2 (chỉ SUM(otHours), không có fallback
// overtimeMinutes) gây lệch số liệu; đã bỏ. Lọc/trang đều chạy SAU cache.
const MAX_PAGE_SIZE = 200000;
const HEAVY_OT_MINUTES = 240;
function applyAlertFilter(rows, alert) {
  if (!alert || alert === 'all') return rows;
  if (alert === 'heavyOt') return rows;
  // "lượt vượt kế hoạch" (click từ bảng tổng): chỉ giữ dòng thực tế > kế hoạch.
  if (alert === 'overPlan') {
    return rows.filter((r) => r.actualOtMinutes > r.planOtMinutes);
  }
  return rows.filter(
    (r) =>
      r.actualOtMinutes < HEAVY_OT_MINUTES &&
      rules.getOtAlertLevel(r.planOtMinutes, r.actualOtMinutes) === alert
  );
}

// Gộp OT theo (công nhân, ngày) khi lọc heavyOt — các phân đoạn cùng ngày
// cộng lại TRƯỚC khi so ngưỡng 240 phút (khớp tab "chi tiết từng công nhân").
function aggregateHeavyOt(rows) {
  const acc = new Map();
  for (const record of rows) {
    const key = `${record.date}::${record.workerId}`;
    const existing = acc.get(key);
    if (existing) {
      existing.planOtMinutes += record.planOtMinutes;
      existing.actualOtMinutes += record.actualOtMinutes;
    } else {
      acc.set(key, { ...record });
    }
  }
  return Array.from(acc.values())
    .filter((row) => row.actualOtMinutes >= HEAVY_OT_MINUTES)
    .sort(
      (a, b) =>
        b.actualOtMinutes - a.actualOtMinutes ||
        b.date.localeCompare(a.date) ||
        a.workerId.localeCompare(b.workerId)
    );
}

// Sắp xếp trang công nhân theo cột (khớp DetailSortKey của UI).
function sortWorkerRows(rows, sortBy, sortDir) {
  const key =
    {
      date: 'date',
      department: 'department',
      process: 'process',
      workers: 'workers',
      planHours: 'planOtMinutes',
      planIssueDate: 'planIssueDate',
      otHours: 'actualOtMinutes',
    }[sortBy] || 'date';
  const dir = sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

export async function buildRecords(from, to, filters = {}) {
  const deptSet = filters.deptSet || expandDeptParam(filters.dept);
  if (demoEnabled()) {
    const records = await loadRecords(from, to);
    let rows = filterRecords(records, { ...filters, deptSet });
    rows = [...rows].sort((a, b) => b.actualOtMinutes - a.actualOtMinutes);
    const total = rows.length;
    const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 500;
    if (rows.length > limit) rows = rows.slice(0, limit);
    return { rows, total };
  }

  // 30/10/2026 tối ưu: dùng CHUNG nguồn loadRecords (cache 5 phút) — lọc nhóm
  // bộ phận thêm ở đây (loadRecords trả toàn bộ nhóm).
  let rows = (await loadRecords(from, to)).filter((r) => deptSet.has(r.department));

  // Lọc theo NGÀY cụ thể (tab "Chi tiết từng công nhân" + "Chi tiết bộ phận",
  // 30/10/2026): chọn 1 ngày thì chỉ giữ dòng đúng ngày đó.
  if (filters.date && filters.date !== 'all') {
    rows = rows.filter((r) => r.date === filters.date);
  }

  // Lọc chuỗi: mã công nhân / tên công nhân (không phân biệt hoa thường).
  const q = String(filters.search || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      `${r.workerName} ${r.workerId}`.toLowerCase().includes(q)
    );
  }
  // Lọc theo bộ phận chi tiết (process).
  if (filters.process && filters.process !== 'all') {
    rows = rows.filter((r) => r.process === filters.process);
  }
  // Drill-down từ chart: lọc thêm nhóm bộ phận của ô được click (AND).
  if (filters.drillDept && filters.drillDept !== 'all') {
    rows = rows.filter((r) => r.department === filters.drillDept);
  }
  // Drill-down từ biểu đồ spike (pink = 120 < actual < 240; red = >= 240).
  const status = filters.status;
  if (status === 'red') {
    rows = rows.filter((r) => r.actualOtMinutes >= HEAVY_OT_MINUTES);
  } else if (status === 'pink') {
    rows = rows.filter((r) => r.actualOtMinutes > 120 && r.actualOtMinutes < HEAVY_OT_MINUTES);
  }

  // heavyOt → gộp theo (công nhân, ngày) rồi mới đếm/trang; các mức khác lọc
  // theo tỷ lệ từng dòng. Thống kê + tổng luôn tính trên TOÀN BỘ kết quả lọc
  // (không chỉ trang hiện tại), để strip/totals khớp với phân trang.
  const heavy = filters.heavyOt === '1' || filters.heavyOt === true || filters.alert === 'heavyOt';
  let stats = null;
  if (heavy) {
    rows = aggregateHeavyOt(rows);
    stats = {
      cases: rows.length,
      unique: new Set(rows.map((r) => r.workerId)).size,
    };
  } else {
    rows = applyAlertFilter(rows, filters.alert);
  }
  const totals = {
    plan: rows.reduce((s, r) => s + r.planOtMinutes, 0),
    actual: rows.reduce((s, r) => s + r.actualOtMinutes, 0),
  };

  const sorted = sortWorkerRows(rows, filters.sortBy, filters.sortDir);
  const total = sorted.length;
  const pageSize = Math.min(Math.max(1, Number(filters.pageSize) || 10), MAX_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(filters.page) || 1), totalPages);
  const start = (page - 1) * pageSize;
  return { rows: sorted.slice(start, start + pageSize), total, stats, totals };
}

// Gộp theo bộ phận chi tiết (process) — tab "Theo bộ phận chi tiết". Số dòng
// ≤ số phòng ban nên KHÔNG phân trang; client chỉ sắp xếp lại.
export async function buildProcessRollup(from, to, filters = {}) {
  const deptSet = filters.deptSet || expandDeptParam(filters.dept);
  if (demoEnabled()) {
    const records = await loadRecords(from, to);
    const rows = filterRecords(records, { ...filters, deptSet });
    return { rows: rollupProcessRows(rows, filters) };
  }
  // 30/10/2026 tối ưu: dùng CHUNG nguồn loadRecords (cache 5 phút).
  let rows = (await loadRecords(from, to)).filter((r) => deptSet.has(r.department));

  if (filters.process && filters.process !== 'all') {
    rows = rows.filter((r) => r.process === filters.process);
  }
  if (filters.date && filters.date !== 'all') {
    rows = rows.filter((r) => r.date === filters.date);
  }
  rows = applyAlertFilter(rows, filters.alert);
  const days = filters.date && filters.date !== 'all' ? 1 : searchDaysOf(from, to);
  return { rows: rollupProcessRows(rows, filters, days) };
}

function rollupProcessRows(rows, filters, searchDays) {
  // 31/10/2026: gộp theo NGÀY + BỘ PHẬN CHI TIẾT (user yêu cầu tab "Theo bộ
  // phận chi tiết" thống kê theo ngày+bộ phận chi tiết, có cột Ngày + lọc ngày).
  // Cột "OT >= 4h": đếm THEO NGÀY của dòng — số công nhân trong NGÀY ĐÓ có tổng
  // OT thực tế >= 240 phút (mỗi record là 1 công nhân-1 ngày).
  const acc = new Map();
  for (const row of rows) {
    const key = row.date + '::' + row.process;
    const entry = acc.get(key) ?? {
      date: row.date,
      process: row.process,
      workers: new Set(),
      ge4Set: new Set(),
      plan: 0,
      actual: 0,
      over: 0,
    };
    entry.workers.add(row.workerId);
    if (row.actualOtMinutes >= HEAVY_OT_MINUTES) entry.ge4Set.add(row.workerId);
    entry.plan += row.planOtMinutes;
    entry.actual += row.actualOtMinutes;
    if (row.actualOtMinutes > row.planOtMinutes) entry.over += 1;
    acc.set(key, entry);
  }
  const alert = filters.alert;
  return Array.from(acc.values())
    .map((e) => ({
      date: e.date,
      process: e.process,
      workers: e.workers.size,
      otGe4: e.ge4Set.size,
      plan: e.plan,
      actual: e.actual,
      over: e.over,
      status: rules.getDeptRangeAlertStatus(e.plan / 60, e.actual / 60, e.workers.size, searchDays),
    }))
    .filter((row) => !alert || alert === 'all' || alert === 'overPlan' || rules.getOtAlertLevel(row.plan, row.actual) === alert)
    .sort((a, b) => a.date.localeCompare(b.date) || b.actual - a.actual);
}
export async function buildDailySummary(from, to, deptSet, filters = {}) {
  if (demoEnabled()) {
    const rows = demo.getDailySummary();
    return rows.filter((r) => deptSet.has(r.department));
  }
  // 30/10/2026 tối ưu + sửa sai: actual/plan/issue lấy từ CHUNG nguồn loadRecords
  // (cache 5 phút). "Công nhân" = số nhân viên RIÊNG BIỆT có OT thực tế > 0
  // HOẶC có đơn kế hoạch > 0 trong ngày+nhóm (đếm từ chính records) — KHÔNG
  // đếm dòng chấm công 0 giờ (ngày nghỉ như Chủ Nhật vẫn có dòng chấm công
  // 0/null, đếm vào là sai theo yêu cầu user). Bỏ luôn query COUNT DISTINCT cũ
  // (trước đây gán bằng Math.max trên từng phòng → chỉ ra số của 1 phòng lớn
  // nhất, không phải tổng).
  const db = getSnapshotDb();
  const [records] = await Promise.all([
    loadRecords(from, to),
  ]);

  // day+group -> aggregated (gộp theo NGÀY + BỘ PHẬN — không gộp theo bộ phận
  // chi tiết, đúng yêu cầu user 30/10/2026: bảng không có cột "Bộ phận chi
  // tiết" và "Ngày cấp plan").
  // Cột "OT >= 4h" (31/10/2026): đếm THEO NGÀY của dòng — số công nhân trong
  // NGÀY ĐÓ có tổng OT thực tế >= 240 phút (record đã là 1 công nhân-1 ngày,
  // actualOtMinutes là tổng ngày). Không tính theo cả khoảng (gây mâu thuẫn
  // với cột "Công nhân" của từng ngày).
  const groups = new Map();
  const getG = (date, grp) => {
    const k = `${date}::${grp}`;
    if (!groups.has(k)) groups.set(k, {
      date, department: grp, empSet: new Set(), ge4Set: new Set(),
      planHours: 0, actualOtHours: 0, planOtMinutes: 0, actualOtMinutes: 0, overCount: 0,
    });
    return groups.get(k);
  };
  for (const r of records) {
    if (!deptSet.has(r.department)) continue;
    if (filters.date && filters.date !== 'all' && r.date !== filters.date) continue;
    const g = getG(r.date, r.department);
    g.empSet.add(r.workerId);
    g.actualOtHours += r.actualOtMinutes / 60;
    g.planHours += r.planOtMinutes / 60;
    g.actualOtMinutes += r.actualOtMinutes;
    g.planOtMinutes += r.planOtMinutes;
    if (r.actualOtMinutes >= HEAVY_OT_MINUTES) g.ge4Set.add(r.workerId);
    if (r.actualOtMinutes > r.planOtMinutes) g.overCount += 1;
  }
  // "Số ngày tìm kiếm": khi lọc đúng 1 ngày thì = 1 (31/10/2026); ngược lại
  // = số ngày trong khoảng from..to.
  const days = filters.date && filters.date !== 'all' ? 1 : searchDaysOf(from, to);
  return Array.from(groups.values())
    .map((g) => ({
      date: g.date,
      department: g.department,
      workers: g.empSet.size,
      otGe4: g.ge4Set.size,
      planHours: round1(g.planHours),
      actualOtHours: round1(g.actualOtHours),
      // 31/10/2026: trả kèm minutes CHÍNH XÁC (không làm tròn từng dòng) để
      // footer bên client cộng theo phút thật → hết lệch so với KPI.
      planOtMinutes: g.planOtMinutes,
      actualOtMinutes: g.actualOtMinutes,
      overCount: g.overCount,
      status: rules.getDeptRangeAlertStatus(g.planHours, g.actualOtHours, g.empSet.size, days),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || GROUP_ORDER[a.department] - GROUP_ORDER[b.department]);
}

// ---------- /api/kpi ----------
export async function buildKpi(from, to) {
  if (demoEnabled()) return demo.getKpi();
  const agg = await getAggregated(from, to);
  // Gom theo tháng để sparkline
  const byMonth = new Map();
  for (const r of agg.rows) {
    const m = byMonth.get(r.ym) || { actual: 0, plan: 0, workers: 0 };
    m.actual += r.actualH;
    m.plan += r.planH;
    byMonth.set(r.ym, m);
  }
  const months = Array.from(byMonth.keys()).sort();
  const planSpark = months.map((m) => round1(byMonth.get(m).plan));
  const actualSpark = months.map((m) => round1(byMonth.get(m).actual));
  // Sparkline Worker Count: số công nhân THẬT (distinct) mỗi tháng — trước đây
  // cộng số COUNT theo phòng ban (sai), giờ lấy từ workersByMonth của getAggregated.
  const workerSpark = months.map((m) => agg.workersByMonth?.get(m)?.size || 0);
  const trend = (vals) => {
    if (vals.length < 2 || vals[vals.length - 2] === 0) return 0;
    return round1(((vals[vals.length - 1] - vals[vals.length - 2]) / vals[vals.length - 2]) * 100);
  };
  return [
    { id: '1', title: 'Worker Count', value: agg.totalWorkers, unit: 'people', trend: trend(workerSpark), sparkline: workerSpark },
    { id: '2', title: 'Total OT (Plan)', value: round1(agg.totalPlanH), unit: 'hours', trend: trend(planSpark), sparkline: planSpark },
    { id: '3', title: 'Actual OT', value: round1(agg.totalActualH), unit: 'hours', trend: trend(actualSpark), sparkline: actualSpark },
  ];
}

function totalsFromRecords(records) {
  const workerSet = new Set(records.map((r) => r.workerId));
  let planMin = 0;
  let actualMin = 0;
  for (const r of records) {
    planMin += r.planOtMinutes;
    actualMin += r.actualOtMinutes;
  }
  return {
    workerCount: workerSet.size,
    planHours: planMin / 60,
    actualHours: actualMin / 60,
  };
}

// ---------- /api/overtime/summary ----------
export async function buildTotals(from, to) {
  if (demoEnabled()) {
    const records = demo.getRecords();
    return totalsFromRecords(records);
  }
  // 30/10/2026 tối ưu: dùng CHUNG nguồn loadRecords (cache 5 phút).
  const records = await loadRecords(from, to);
  return totalsFromRecords(records);
}

// ---------- /api/overtime/monthly ----------
export async function buildMonthly(from, to) {
  if (demoEnabled()) {
    return demo.getMonthly().filter((m) => {
      const period = MONTHS.find((x) => x.label === m.month);
      return period ? intersects(from, to, monthPeriod(period.ago)) : true;
    });
  }
  const agg = await getAggregated(from, to);
  const byMonth = new Map();
  for (const r of agg.rows) {
    const m = byMonth.get(r.ym) || { actual: 0, plan: 0 };
    m.actual += r.actualH;
    m.plan += r.planH;
    byMonth.set(r.ym, m);
  }
  return Array.from(byMonth.entries()).sort().map(([ym, v]) => ({
    id: `Month ${Number(ym.split('-')[1])}`,
    month: `Month ${Number(ym.split('-')[1])}`,
    planOtHours: round1(v.plan),
    actualOtHours: round1(v.actual),
    workerCount: 0,
  }));
}

// ---------- /api/overtime/department-trend ----------
export async function buildDepartmentTrend(from, to) {
  if (demoEnabled()) return demo.getDepartmentTrend();
  const agg = await getAggregated(from, to);
  const rows = [];
  for (const r of agg.rows) {
    const monthNum = Number(r.ym.split('-')[1]);
    rows.push({
      id: `${r.ym}-${r.group}`,
      month: `Month ${monthNum}`,
      department: r.group,
      hours: round1(r.actualH),
      planHours: round1(r.planH),
    });
  }
  return rows;
}

// ---------- /api/ot/spike-stats ----------
export async function buildSpikeStats(from, to, deptSet) {
  // 31/10/2026: metric — tổng OT từng công nhân >= 4h THEO TỪNG KHỐI 31 NGÀY
  // (chia đều từ ngày bắt đầu khoảng user chọn), vẫn chia 8 bộ phận.
  // Vẫn tối ưu: dùng CHUNG nguồn loadRecords (cache 5 phút).
  const records = await loadRecords(from, to);
  const chunks = rules.chunkByMonth31(from, to);
  const months = chunks.map((chunk) => {
    const chunkRecords = records.filter(
      (r) => r.date >= chunk.start && r.date <= chunk.end
    );
    const filtered = chunkRecords.filter((r) => deptSet.has(r.department));
    return {
      label: chunk.label,
      ...rules.buildDepartmentMonthlySpikeStats(filtered),
    };
  });
  return { months };
}

export { addDay };
