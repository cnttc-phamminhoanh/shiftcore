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
// 02/11/2026: 2 biểu đồ (monthly + department-trend) làm tròn 2 chữ số để đồng
// bộ với bảng/dòng tổng/KPI (cùng 2 chữ số thập phân).
const round2 = (n) => Math.round(n * 100) / 100;

// Số ngày của khoảng from..to (bao gồm cả 2 đầu) — công thức trạng thái tổng
// đã chuyển sang tính tại chỗ bằng searchDays truyền từ client; hàm cũ bỏ đi.

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

// ---------- cache kết quả gộp theo TỪNG NGÀY (5 phút) ----------
// 02/11/2026: cache theo NGÀY thay vì theo nguyên khoảng — dịch chuyển 1 ngày
// trong khoảng chỉ phải tải (các) ngày THIẾU, 61 ngày còn lại dùng lại cache
// ngay (trước đây đổi 1 ngày = mất cả cache, parse lại 62 ngày ~1.5s).
// Các ngày thiếu được nhóm thành đoạn liên tục, mỗi đoạn đọc 1 lần theo khoảng
// (nên khoảng mới TO vẫn chỉ 1 query như cũ). Dedup đồng thời theo đoạn.
// Mọi endpoint vẫn dùng CHUNG nguồn loadRecords này → số liệu không lệch.
const recordsCache = new Map();   // date -> { t, rows } (bản ghi công nhân-ngày)
const recordsPending = new Map(); // "s::e" -> promise (đang tải đoạn)
const CACHE_TTL = 5 * 60 * 1000;

function fmtDay(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function daysBetween(from, to) {
  const out = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(fmtDay(d));
  return out;
}

// Ghi rows (công nhân-ngày) đã parse vào cache theo đúng ngày của record.
// Gộp theo ngày TRƯỚC khi set — mỗi ngày 1 entry chứa ĐẦY ĐỦ records của ngày.
// (Tránh set từng record → entry chỉ còn record cuối cùng.)
function seedDayCache(rows) {
  const byDay = new Map();
  for (const r of rows) {
    const arr = byDay.get(r.date);
    if (arr) arr.push(r);
    else byDay.set(r.date, [r]);
  }
  for (const [date, arr] of byDay) {
    recordsCache.set(date, { t: Date.now(), rows: arr });
  }
}

async function loadRecordsSpan(from, to) {
  const key = `${from}::${to}`;
  if (recordsPending.has(key)) return recordsPending.get(key);
  const p = (async () => {
    const rows = await loadRecordsFresh(from, to);
    seedDayCache(rows);
    // Ngày KHÔNG có bản ghi (nghỉ / ngày tương lai chưa đồng bộ) cũng được cache
    // là "rỗng" — nếu không, mỗi request lại coi ngày đó là THIẾU → refresh nguồn
    // HR (30s/lần) dù không có gì để kéo.
    for (const d of daysBetween(from, to)) {
      if (!recordsCache.has(d)) recordsCache.set(d, { t: Date.now(), rows: [] });
    }
    recordsPending.delete(key);
    return rows;
  })();
  recordsPending.set(key, p);
  return p;
}

export async function loadRecords(from, to) {
  const days = daysBetween(from, to);
  if (!days.length) return [];
  const now = Date.now();
  // Ngày chưa có / đã hết hạn → cần tải; nhóm thành đoạn liên tục để ít query.
  const missing = days.filter((d) => {
    const hit = recordsCache.get(d);
    return !hit || now - hit.t >= CACHE_TTL;
  });
  if (missing.length) {
    const spans = [];
    let s = missing[0];
    let prev = missing[0];
    for (let i = 1; i < missing.length; i++) {
      const d = missing[i];
      const next = new Date(`${prev}T00:00:00`);
      next.setDate(next.getDate() + 1);
      if (d === fmtDay(next)) { prev = d; continue; }
      spans.push([s, prev]);
      s = d;
      prev = d;
    }
    spans.push([s, prev]);
    await Promise.all(spans.map(([a, b]) => loadRecordsSpan(a, b)));
  }
  const out = [];
  for (const d of days) {
    const hit = recordsCache.get(d);
    if (hit) out.push(...hit.rows);
  }
  return out;
}

// ---------- làm ấm cache khi server khởi động (02/11/2026) ----------
// Tự đọc + parse 2 tháng gần nhất ngầm sau khi server lắng nghe → người mở
// link đầu tiên không phải chờ pha "lạnh ~1.5s". Không chặn luồng khởi động.
export function warmUpCache() {
  if (demoEnabled()) return;
  const now = new Date();
  const from = fmtDay(new Date(now.getFullYear(), now.getMonth() - 2, now.getDate()));
  // Làm ấm đến NGÀY HÔM QUA, không lấy hôm nay: ngày hôm nay thường chưa có
  // dữ liệu trong SQLite → nếu lấy hôm nay, lúc khởi động sẽ kích hoạt refresh
  // nguồn HR (và nếu HR đang mất kết nối sẽ chờ timeout — làm UI lần đầu chậm).
  // Ngày hôm nay sẽ được backfill tự nhiên khi user chọn hoặc job nền chạy.
  const to = fmtDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  loadRecords(from, to)
    .then(() => console.log(`[dashboard] cache đã được làm ấm: ${from} .. ${to}`))
    .catch((err) => console.error('[dashboard] lỗi làm ấm cache:', err.message));
}

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
    return { rows: rollupProcessRows(rows, filters), totals: null };
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
  const days = 1; // 01/11/2026: bảng chi tiết theo từng ngày → số ngày tìm kiếm = 1
  // 02/11/2026: dòng Tổng tính từ CHÍNH rows đã lọc — "Công nhân" = RIÊNG BIỆT
  // (union workerId), otGe4/over = số lượt (record ≥240 phút / actual>plan),
  // plan/actual = tổng phút. Trước đây client cộng workers từng dòng theo ngày
  // → cùng công nhân đếm trùng (93.014 thay vì ~2.128 người).
  const workerSet = new Set();
  let ge4Cnt = 0;
  let overCnt = 0;
  let planMin = 0;
  let actualMin = 0;
  for (const r of rows) {
    workerSet.add(r.workerId);
    if (r.actualOtMinutes >= HEAVY_OT_MINUTES) ge4Cnt += 1;
    if (r.actualOtMinutes > r.planOtMinutes) overCnt += 1;
    planMin += r.planOtMinutes;
    actualMin += r.actualOtMinutes;
  }
  return {
    rows: rollupProcessRows(rows, filters, days),
    totals: {
      workers: workerSet.size,
      otGe4: ge4Cnt,
      over: overCnt,
      plan: planMin,
      actual: actualMin,
    },
  };
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
    return { rows: rows.filter((r) => deptSet.has(r.department)), totals: null };
  }
  // 30/10/2026 tối ưu + sửa sai: actual/plan/issue lấy từ CHUNG nguồn loadRecords
  // (cache 5 phút). "Công nhân" = số nhân viên RIÊNG BIỆT có OT thực tế > 0
  // HOẶC có đơn kế hoạch > 0 trong ngày+nhóm (đếm từ chính records) — KHÔNG
  // đếm dòng chấm công 0 giờ (ngày nghỉ như Chủ Nhật vẫn có dòng chấm công
  // 0/null, đếm vào là sai theo yêu cầu user). Bỏ luôn query COUNT DISTINCT cũ
  // (trước đây gán bằng Math.max trên từng phòng → chỉ ra số của 1 phòng lớn
  // nhất, không phải tổng).
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
  // 01/11/2026 user chốt: bảng chi tiết theo TỪNG NGÀY nên "số ngày tìm kiếm"
  // LUÔN = 1 (không dùng số ngày trong khoảng from..to) — ngưỡng cảnh báo tính
  // sát theo 1 ngày, không bị kéo rộng bởi D = 62.
  const days = 1;
  const full = Array.from(groups.values()).map((g) => {
    const status = rules.getDeptRangeAlertStatus(g.planHours, g.actualOtHours, g.empSet.size, days);
    return {
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
      status,
      // 02/11/2026: giữ Set nội bộ để tính dòng Tổng (Công nhân = RIÊNG BIỆT,
      // không cộng dồn theo ngày); được bóc ra trước khi trả về client.
      _empSet: g.empSet,
      _ge4Set: g.ge4Set,
    };
  });
  // 02/11/2026: lọc theo trạng thái NGAY TRÊN SERVER (tab chi tiết bộ phận có
  // dropdown Trạng thái) — để dòng Tổng tính đúng theo đúng bộ dòng hiển thị.
  let visible = full;
  if (filters.alert && filters.alert !== 'all') {
    // UI gửi 'normal' (mục "Bình thường") nhưng status dòng là 'green'
    // (getDeptRangeAlertStatus) — map lại, nếu không lọc 'normal' trả bảng
    // RỖNG + dòng Tổng toàn 0 (bug 02/11/2026 "dòng tổng bất thường").
    const target = filters.alert === 'normal' ? 'green' : filters.alert;
    visible = full.filter((r) => r.status === target);
  }
  // Dòng Tổng: "Công nhân" = số NHÂN VIÊN RIÊNG BIỆT (union của các ngày) —
  // trước đây client cộng workers từng dòng → cùng công nhân xuất hiện nhiều
  // ngày bị đếm trùng (vd 93.014 thay vì ~2.128). otGe4/over = số LƯỢT nên
  // CỘNG DỒN theo dòng (không union — union ra 664, cộng dồn = 3.576 lượt,
  // khớp tab "Theo bộ phận chi tiết"); plan/actual = tổng phút chính xác.
  const workerSet = new Set();
  let ge4Cnt = 0;
  let planMin = 0;
  let actualMin = 0;
  let overCnt = 0;
  for (const r of visible) {
    r._empSet.forEach((w) => workerSet.add(w));
    ge4Cnt += r._ge4Set.size;
    planMin += r.planOtMinutes;
    actualMin += r.actualOtMinutes;
    overCnt += r.overCount;
  }
  const rows = visible
    .sort((a, b) => a.date.localeCompare(b.date) || GROUP_ORDER[a.department] - GROUP_ORDER[b.department])
    .map(({ _empSet, _ge4Set, ...rest }) => rest);
  return {
    rows,
    totals: {
      workers: workerSet.size,
      otGe4: ge4Cnt,
      overCount: overCnt,
      planOtMinutes: planMin,
      actualOtMinutes: actualMin,
    },
  };
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
    // 02/11/2026: KHÔNG round1 ở server — card client tự toFixed(2). Trước đây
    // round1(206990.2166)=206990.2 rồi toFixed(2)=206990.20 → lệch 0.02 với
    // dòng Tổng bảng (206990.22) — lại thành "bất thường" user phát hiện.
    { id: '2', title: 'Total OT (Plan)', value: agg.totalPlanH, unit: 'hours', trend: trend(planSpark), sparkline: planSpark },
    { id: '3', title: 'Actual OT', value: agg.totalActualH, unit: 'hours', trend: trend(actualSpark), sparkline: actualSpark },
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
    planOtHours: round2(v.plan),
    actualOtHours: round2(v.actual),
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
      hours: round2(r.actualH),
      planHours: round2(r.planH),
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
