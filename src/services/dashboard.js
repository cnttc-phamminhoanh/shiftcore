// ============================================================
// TỔNG HỢP DASHBOARD — gộp 3 nguồn thành 1 khung dữ liệu:
//   HR (chấm công thực) + T8 (đơn tăng ca) = NGUỒN TÍNH CHÍNH
//   Igarment (lần quẹt thẻ cuối) = CHỈ THAM KHẢO
// Khóa liên kết: HR.code = T8.emp_no = Igarment.IDNo
// ============================================================
import { demoEnabled } from '../config.js';
import * as rules from '../rules/ot-alert.js';
import { mapDeptToGroup, SPIKE_DEPARTMENT_GROUPS } from '../rules/dept-groups.js';
import { getEmployees, getDepartments, getAttendanceRange, addDay } from './hr.js';
import { getOtLinesRange } from './t8.js';
import { getLastSwipes } from './ig-snapshot.js';
import * as demo from './demo.js';

// ---------- helpers ----------
const round1 = (n) => Math.round(n * 10) / 10;

function isoDate(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function monthPeriod(monthsAgo) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const last = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
  return { start: isoDate(first), end: isoDate(last) };
}

const MONTHS = [
  { label: 'Month 8', ago: 2 },
  { label: 'Month 9', ago: 1 },
  { label: 'Month 10', ago: 0 },
];

function daysBetweenInclusive(from, to) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b - a) / 86400000) + 1;
}

function intersects(from, to, period) {
  return !(period.end < from || period.start > to);
}

function scanMinutesOf(scanTime, baseHour) {
  if (!scanTime) return 0;
  const m = String(scanTime).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Math.max(0, minutes - baseHour * 60);
}

// ---------- cache kết quả gộp (60s) — tránh query DB lặp cho cùng khoảng ngày ----------
const recordsCache = new Map();
const CACHE_TTL = 60 * 1000;

async function loadRecordsFresh(from, to) {
  if (demoEnabled()) return demo.getRecords();
  const [emps, depts, att, lines, swipes] = await Promise.all([
    getEmployees(),
    getDepartments(),
    getAttendanceRange(from, to),
    getOtLinesRange(from, to),
    getLastSwipes(from, to),
  ]);

  const deptByUid = new Map(depts.map((d) => [d.uID, d]));
  const empByCode = new Map(emps.map((e) => [e.code, e]));
  const empByUid = new Map(emps.map((e) => [e.uID, e]));
  const headcountByDept = new Map();
  for (const e of emps) {
    headcountByDept.set(e.departID, (headcountByDept.get(e.departID) || 0) + 1);
  }
  const swipeByEmpDay = new Map(swipes.map((s) => [`${s.empCode}::${s.date}`, s]));

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
    const emp = empByUid.get(a.empID);
    if (!emp) continue;
    const otHours = Number(a.otHours) || 0;
    const minutes = otHours > 0 ? otHours * 60 : Number(a.overtimeMinutes) || 0;
    const key = `${emp.code}::${a.fdate}`;
    actual.set(key, (actual.get(key) || 0) + minutes);
  }

  // Gộp thành bản ghi công nhân-ngày: hợp giữa người có chấm công và người có đăng ký
  const records = [];
  const seen = new Set();
  const push = (code, date) => {
    const key = `${code}::${date}`;
    if (seen.has(key)) return;
    seen.add(key);
    const emp = empByCode.get(code);
    if (!emp) return;
    const dept = deptByUid.get(emp.departID);
    const p = plan.get(key);
    const swipe = swipeByEmpDay.get(key);
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
      scanTime: swipe?.time || '',
    });
  };
  for (const key of actual.keys()) {
    const [code, date] = key.split('::');
    push(code, date);
  }
  for (const key of plan.keys()) {
    const [code, date] = key.split('::');
    push(code, date);
  }
  return records;
}

export async function loadRecords(from, to) {
  const cacheKey = `${from}::${to}`;
  const hit = recordsCache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.rows;
  const rows = await loadRecordsFresh(from, to);
  recordsCache.set(cacheKey, { t: Date.now(), rows });
  return rows;
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
    rows = rows.filter((r) => rules.getOtAlertLevel(r.planOtMinutes, r.actualOtMinutes) === alert);
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

// ---------- /api/overtime/records ----------
export async function buildRecords(from, to, filters = {}) {
  const records = await loadRecords(from, to);
  const deptSet = filters.deptSet || expandDeptParam(filters.dept);
  let rows = filterRecords(records, { ...filters, deptSet });

  if (filters.heavyOt === '1' || filters.heavyOt === 'true') {
    rows = rules.aggregateWorkerOtSpikes(rows).map((r) => ({
      id: `${r.workDate}::${r.workerNo}`,
      date: r.workDate,
      workerId: r.workerNo,
      workerName: r.name,
      department: r.department,
      process: '',
      workers: 0,
      planOtMinutes: 0,
      planIssueDate: '',
      actualOtMinutes: Math.round(r.actualOtMinutes),
      scanTime: '',
    }));
  } else {
    rows = [...rows].sort(
      (a, b) =>
        b.actualOtMinutes - a.actualOtMinutes ||
        b.date.localeCompare(a.date) ||
        a.workerId.localeCompare(b.workerId)
    );
  }
  return rows;
}

// ---------- /api/overtime/daily ----------
export async function buildDailySummary(from, to, deptSet) {
  if (demoEnabled()) {
    const rows = demo.getDailySummary();
    return rows.filter((r) => deptSet.has(r.department));
  }
  const records = await loadRecords(from, to);
  const groups = new Map();
  for (const r of records) {
    if (!deptSet.has(r.department)) continue;
    const key = `${r.date}::${r.department}::${r.process}`;
    const g = groups.get(key) || {
      date: r.date,
      department: r.department,
      process: r.process,
      workers: 0,
      planHours: 0,
      planIssueDate: '',
      actualOtHours: 0,
      scanTimeMinutes: 0,
    };
    g.workers = Math.max(g.workers, r.workers || 0);
    g.planHours += r.planOtMinutes / 60;
    if (r.planIssueDate && (!g.planIssueDate || r.planIssueDate < g.planIssueDate)) {
      g.planIssueDate = r.planIssueDate;
    }
    g.actualOtHours += r.actualOtMinutes / 60;
    g.scanTimeMinutes += scanMinutesOf(r.scanTime, scanBaseHour());
    groups.set(key, g);
  }
  return Array.from(groups.values())
    .map((g) => ({
      ...g,
      planHours: round1(g.planHours),
      actualOtHours: round1(g.actualOtHours),
      status: rules.getDailySummaryStatus(g.planHours, g.actualOtHours),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || GROUP_ORDER[a.department] - GROUP_ORDER[b.department]);
}

import { config } from '../config.js';
const scanBaseHour = () => config.scanBaseHour;

// ---------- /api/kpi ----------
export async function buildKpi(from, to) {
  if (demoEnabled()) return demo.getKpi();
  const records = await loadRecords(from, to);
  const monthly = await buildMonthlyInner(from, to, records);
  const totals = totalsFromRecords(records);

  const spark = (fn) => monthly.map((m) => round1(fn(m)));
  const trend = (vals) => {
    if (vals.length < 2 || vals[vals.length - 2] === 0) return 0;
    return round1(((vals[vals.length - 1] - vals[vals.length - 2]) / vals[vals.length - 2]) * 100);
  };

  const workerSpark = spark((m) => m.workerCount);
  const planSpark = spark((m) => m.planHours);
  const actualSpark = spark((m) => m.actualHours);
  const igmSpark = spark((m) => m.scanHours);

  return [
    { id: '1', title: 'Worker Count', value: totals.workerCount, unit: 'people', trend: trend(workerSpark), sparkline: workerSpark },
    { id: '2', title: 'Total OT (Plan)', value: round1(totals.planHours), unit: 'hours', trend: trend(planSpark), sparkline: planSpark },
    { id: '3', title: 'Actual OT', value: round1(totals.actualHours), unit: 'hours', trend: trend(actualSpark), sparkline: actualSpark },
    { id: '4', title: 'IGM OT', value: round1(totals.igmHours), unit: 'hours', trend: trend(igmSpark), sparkline: igmSpark },
  ];
}

function totalsFromRecords(records) {
  const workerSet = new Set(records.map((r) => r.workerId));
  let planMin = 0;
  let actualMin = 0;
  let scanMin = 0;
  for (const r of records) {
    planMin += r.planOtMinutes;
    actualMin += r.actualOtMinutes;
    scanMin += scanMinutesOf(r.scanTime, scanBaseHour());
  }
  return {
    workerCount: workerSet.size,
    planHours: planMin / 60,
    actualHours: actualMin / 60,
    igmHours: scanMin / 60,
  };
}

// ---------- /api/overtime/summary ----------
export async function buildTotals(from, to) {
  if (demoEnabled()) {
    const records = demo.getRecords();
    return totalsFromRecords(records);
  }
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
  const records = await loadRecords(from, to);
  return buildMonthlyInner(from, to, records);
}

async function buildMonthlyInner(from, to, records) {
  return MONTHS.map(({ label, ago }) => {
    const period = monthPeriod(ago);
    if (!intersects(from, to, period)) return null;
    let planMin = 0;
    let actualMin = 0;
    let scanMin = 0;
    const workers = new Set();
    for (const r of records) {
      if (r.date < period.start || r.date > period.end) continue;
      planMin += r.planOtMinutes;
      actualMin += r.actualOtMinutes;
      scanMin += scanMinutesOf(r.scanTime, scanBaseHour());
      workers.add(r.workerId);
    }
    return {
      id: label,
      month: label,
      planOtHours: round1(planMin / 60),
      actualOtHours: round1(actualMin / 60),
      scanHours: round1(scanMin / 60),
      workerCount: workers.size,
    };
  }).filter(Boolean);
}

// ---------- /api/overtime/department-trend ----------
export async function buildDepartmentTrend(from, to) {
  if (demoEnabled()) return demo.getDepartmentTrend();
  const records = await loadRecords(from, to);
  const rows = [];
  for (const { label, ago } of MONTHS) {
    const period = monthPeriod(ago);
    if (!intersects(from, to, period)) continue;
    for (const group of SPIKE_DEPARTMENT_GROUPS) {
      let hours = 0;
      let planHours = 0;
      for (const r of records) {
        if (r.department !== group) continue;
        if (r.date < period.start || r.date > period.end) continue;
        hours += r.actualOtMinutes / 60;
        planHours += r.planOtMinutes / 60;
      }
      rows.push({
        id: `${label}-${group}`,
        month: label,
        department: group,
        hours: round1(hours),
        planHours: round1(planHours),
      });
    }
  }
  return rows;
}

// ---------- /api/ot/spike-stats ----------
export async function buildSpikeStats(from, to, deptSet) {
  const records = await loadRecords(from, to);
  const filtered = records.filter((r) => deptSet.has(r.department));
  return rules.buildDepartmentSpikeStats(filtered);
}

// ---------- /api/last-swipes (tham khảo) ----------
export async function buildLastSwipes(from, to) {
  if (demoEnabled()) {
    return demo
      .getRecords()
      .filter((r) => r.scanTime && r.date >= from && r.date <= to)
      .map((r) => ({
        empCode: r.workerId,
        date: r.date,
        time: r.scanTime,
        wrkOrder: '',
        stepNo: null,
        qty: null,
        stationId: null,
      }));
  }
  return getLastSwipes(from, to);
}

export { addDay };
