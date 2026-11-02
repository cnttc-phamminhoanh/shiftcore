// ============================================================
// SNAPSHOT HR (SQLite local) — UI/API CHỈ đọc SQLite, không đọc view/bảng gốc.
// - Job nền 30 phút: kéo 7 ngày gần nhất từ view v_hr_ot_daily -> SQLite,
//   kèm DIFF-SYNC: xóa dòng trong khoảng đã kéo mà không còn ở nguồn
//   (dữ liệu bị xóa/sửa ở HR cũng được phản ánh, độ trễ ≤ 30 phút).
// - Lazy backfill: khi user chọn khoảng ngày chưa có, query HR 1 lần rồi
//   lưu vào SQLite; khoảng nằm trong vùng phủ nhưng quá 30 phút -> refresh nền.
// - Master data (nhân viên, phòng ban) cũng nằm trong SQLite (bảng hr_employee,
//   hr_department) — request không đọc view v_hr_employee/v_hr_department.
// File DB: cache/hr_snapshot.db (cạnh server.js).
// ============================================================
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { config, demoEnabled } from '../config.js';
import { hrQuery } from '../db/hr.js';
import { isProductionDeptName } from '../rules/production-depts.js';

const DB_FILE = path.join(config.cacheDir, 'hr_snapshot.db');

let db = null;
let jobRunning = false;
let jobTimer = null;
let lastRefresh = 0;
let refreshing = null;
let masterSyncedAt = 0;

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDay(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function getDb() {
  if (db) return db;
  fs.mkdirSync(config.cacheDir, { recursive: true });
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS hr_ot (
      fdate            TEXT NOT NULL,
      empID            TEXT NOT NULL,
      departID         TEXT,
      otHours          REAL DEFAULT 0,
      overtimeMinutes  REAL DEFAULT 0,
      onTime1          TEXT,
      offTime1         TEXT,
      onTime2          TEXT,
      offTime2         TEXT,
      attendDays       REAL,
      dayType          TEXT,
      CardList         TEXT,
      PRIMARY KEY (empID, fdate)
    );
    CREATE INDEX IF NOT EXISTS idx_hr_ot_fdate ON hr_ot(fdate);
    -- Index hợp cho GROUP BY fdate,departID + COUNT(DISTINCT empID) (30/10/2026:
    -- tối ưu dashboard — daily workers, kpi workers) và đọc theo (fdate, empID):
    CREATE INDEX IF NOT EXISTS idx_hr_ot_fdate_dept_emp ON hr_ot(fdate, departID, empID);
    CREATE INDEX IF NOT EXISTS idx_hr_ot_fdate_emp ON hr_ot(fdate, empID);
    -- Master data (UI đọc từ SQLite; job làm mới 30 phút):
    CREATE TABLE IF NOT EXISTS hr_employee (
      uID      TEXT NOT NULL PRIMARY KEY,
      code     TEXT,
      name     TEXT,
      departID TEXT,
      status   INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_hr_employee_code ON hr_employee(code);
    CREATE TABLE IF NOT EXISTS hr_department (
      uID     TEXT NOT NULL PRIMARY KEY,
      code    TEXT,
      name    TEXT,
      engName TEXT,
      status  INTEGER DEFAULT 1
    );
  `);
  // Migration: DB cũ có bảng hr_employee chưa có cột status (view cũ lọc status=1).
  const empCols = db.prepare(`PRAGMA table_info(hr_employee)`).all();
  if (!empCols.some((c) => c.name === 'status')) {
    db.exec(`ALTER TABLE hr_employee ADD COLUMN status INTEGER DEFAULT 1`);
  }
  // Migration: hr_department cũ chưa có cột status (view cũ lọc status=1).
  const deptCols = db.prepare(`PRAGMA table_info(hr_department)`).all();
  if (!deptCols.some((c) => c.name === 'status')) {
    db.exec(`ALTER TABLE hr_department ADD COLUMN status INTEGER DEFAULT 1`);
  }
  return db;
}

export function getSnapshotDb() { return getDb(); }

// Whitelist departID phòng ban SẢN XUẤT (29/10/2026): đọc danh mục phòng ban trong
// SQLite rồi giữ những phòng thuộc sản xuất. Trả null khi chưa có danh mục
// (an toàn: KHÔNG lọc → tránh tự xoá sạch khi master chưa kịp sync).
function productionDeptIdSet() {
  const d = getDb();
  const rows = d.prepare('SELECT uID, name, engName FROM hr_department').all();
  if (rows.length === 0) return null;
  const set = new Set();
  for (const r of rows) if (isProductionDeptName(r.name, r.engName)) set.add(String(r.uID).toLowerCase());
  return set.size ? set : null;
}

// Ghi 1 lô dòng từ view HR vào SQLite + DIFF: xóa dòng trong [from, toPlus)
// không còn ở nguồn. Bỏ qua bước xóa khi lô rỗng (ngày nghỉ không có dòng —
// không xóa sạch khoảng đó, tránh "tưởng thiếu = xóa").
function syncRows(rows, from, toPlus) {
  if (!rows || rows.length === 0) return 0;
  const prodIds = productionDeptIdSet();
  let list = rows;
  if (prodIds) {
    const filtered = rows.filter((r) => prodIds.has(String(r.departID || '').toLowerCase()));
    if (filtered.length !== rows.length) {
      console.log(`[hr-snapshot] lọc phi sản xuất: bỏ ${rows.length - filtered.length}/${rows.length} dòng`);
    }
    list = filtered;
    if (list.length === 0) return 0;
  } else {
    console.warn('[hr-snapshot] chưa có danh mục phòng ban — KHÔNG lọc sản xuất (giữ nguyên)');
  }
  const d = getDb();
  const insert = d.prepare(`
    INSERT INTO hr_ot (fdate, empID, departID, otHours, overtimeMinutes,
                       onTime1, offTime1, onTime2, offTime2, attendDays, dayType, CardList)
    VALUES (@fdate, @empID, @departID, @otHours, @overtimeMinutes,
            @onTime1, @offTime1, @onTime2, @offTime2, @attendDays, @dayType, @CardList)
    ON CONFLICT(empID, fdate) DO UPDATE SET
      departID=excluded.departID, otHours=excluded.otHours,
      overtimeMinutes=excluded.overtimeMinutes, onTime1=excluded.onTime1,
      offTime1=excluded.offTime1, onTime2=excluded.onTime2,
      offTime2=excluded.offTime2, attendDays=excluded.attendDays,
      dayType=excluded.dayType, CardList=excluded.CardList
  `);
  d.exec(`CREATE TEMP TABLE IF NOT EXISTS _hr_sync_keys (empID TEXT NOT NULL, fdate TEXT NOT NULL, PRIMARY KEY(empID, fdate))`);
  const keyIns = d.prepare(`INSERT OR IGNORE INTO _hr_sync_keys (empID, fdate) VALUES (?, ?)`);
  const tx = d.transaction((list) => {
    d.prepare(`DELETE FROM _hr_sync_keys`).run();
    for (const r of list) {
      insert.run(r);
      keyIns.run(r.empID, r.fdate);
    }
    d.prepare(
      `DELETE FROM hr_ot
        WHERE fdate >= @from AND fdate < @toPlus
          AND NOT EXISTS (SELECT 1 FROM _hr_sync_keys k
                           WHERE k.empID = hr_ot.empID AND k.fdate = hr_ot.fdate)`
    ).run({ from, toPlus });
  });
  tx(list);
  return list.length;
}

// Query HR cho 1 khoảng [from,to] và upsert+diff vào SQLite.
export async function refreshRange(from, to) {
  const toPlus = addDay(to, 1);
  const rows = await hrQuery(
    `SELECT fdate, empID, departID, otHours, overtimeMinutes,
            onTime1, offTime1, onTime2, offTime2,
            attendDays, dayType, CardList
       FROM v_hr_ot_daily
      WHERE fdate >= @from AND fdate < @toPlus`,
    { from, toPlus }
  );
  const n = syncRows(rows, from, toPlus);
  lastRefresh = Date.now();
  console.log(`[hr-snapshot] refresh ${from}..${to}: upsert ${n} dòng`);
  return n;
}

// Các ngày trong khoảng [from,to] CHƯA có dữ liệu trong SQLite.
// 02/11/2026: trả MẢNG khoảng thiếu CHÍNH XÁC (chỉ phần nằm ngoài [min,max]) —
// trước đây trả nguyên {from,to}: mở khoảng 2 tháng mà thiếu 1 ngày cuối (hôm nay
// chưa có dữ liệu nguồn) → kéo LẠI cả 2 tháng từ view HR (5-10s mỗi lần mở trang).
function missingRange(from, to) {
  const d = getDb();
  const row = d.prepare(
    `SELECT MIN(fdate) AS minD, MAX(fdate) AS maxD FROM hr_ot`
  ).get();
  if (!row || !row.minD) return [{ from, to }];          // chưa có dữ liệu nào
  const missing = [];
  if (from < row.minD) missing.push({ from, to: addDay(row.minD, -1) }); // phần TRƯỚC dữ liệu
  if (to > row.maxD) missing.push({ from: addDay(row.maxD, 1), to });    // phần SAU dữ liệu
  return missing.length ? missing : null;
}

// Ngày đã thử backfill NHƯNG nguồn HR không có dữ liệu (vd ngày hôm nay chưa tổng
// hợp) → ghi nhớ để không query lại HR mỗi lần mở trang (5 phút thử lại 1 lần).
const EMPTY_CHECK_COOLDOWN_MS = 5 * 60 * 1000;
const emptyCheckedAt = new Map(); // date -> ts
function markEmptyChecked(from, to) {
  const d = getDb();
  const now = Date.now();
  for (let cur = from; cur <= to; cur = addDay(cur, 1)) {
    if (!d.prepare('SELECT 1 FROM hr_ot WHERE fdate = ? LIMIT 1').get(cur)) {
      emptyCheckedAt.set(cur, now);
    }
  }
}
function isEmptyChecked(from, to) {
  const now = Date.now();
  for (let cur = from; cur <= to; cur = addDay(cur, 1)) {
    const t = emptyCheckedAt.get(cur);
    if (!t || now - t > EMPTY_CHECK_COOLDOWN_MS) return false;
  }
  return true;
}

// Refresh nền (KHÔNG chặn request) khi khoảng trong vùng phủ nhưng quá 30 phút
// chưa làm mới — để thay đổi (thêm/sửa/xóa) ở nguồn phản ánh ≤ 30 phút.
function maybeBackgroundRefresh(from, to) {
  const stale = Date.now() - lastRefresh > config.snapshotIntervalMin * 60 * 1000;
  if (!stale || refreshing) return;
  // 30/10/2026: chỉ refresh PHẦN GẦN (7 ngày trước `to`) — trước đây refresh cả
  // khoảng yêu cầu (mở khoảng 9 tháng → kéo ~535k dòng từ view + upsert đồng bộ
  // chặn event loop ~20s, UI load chậm). Dữ liệu cũ trong SQLite đã có, không
  // cần kéo lại; chỉ phần gần nhất thay đổi theo nguồn.
  const start = addDay(to, -7);
  refreshing = refreshRange(start, to)
    .catch((err) => console.warn('[hr-snapshot] refresh nền lỗi:', err.message))
    .finally(() => { refreshing = null; });
}

// Backfill (khoảng THIẾU dữ liệu) — dedup theo khoảng để nhiều endpoint cùng
// thiếu 1 khoảng (vd 5 request UI mở đồng thời với to = hôm nay chưa có dữ liệu)
// chờ CHUNG 1 refresh thay vì mỗi cái refresh riêng (trước: mỗi cái 30s).
const backfillPending = new Map();
function refreshBackfill(from, to) {
  const key = `${from}::${to}`;
  if (!backfillPending.has(key)) {
    backfillPending.set(
      key,
      refreshRange(from, to)
        .catch((err) => {
          console.warn(`[hr-snapshot] backfill lỗi (vẫn trả dữ liệu cũ): ${err.message}`);
        })
        .then(() => {
          // 02/11/2026: sau khi kéo từ HR mà SQLite VẪN thiếu → nguồn HR không có
          // dữ liệu cho các ngày đó (không phải lỗi) → ghi dấu "đã thử, trống".
          const miss = missingRange(from, to);
          if (miss) for (const m of miss) markEmptyChecked(m.from, m.to);
        })
        .finally(() => {
          backfillPending.delete(key);
        })
    );
  }
  return backfillPending.get(key);
}

// Đảm bảo SQLite có dữ liệu cho khoảng [from,to]; nếu thiếu -> backfill từ HR (request chờ).
export async function ensureRange(from, to) {
  if (demoEnabled()) return [];
  const miss = missingRange(from, to);
  if (miss) {
    for (const r of miss) {
      // Bỏ qua khoảng đã thử gần đây mà nguồn trống → không treo request chờ HR.
      if (!isEmptyChecked(r.from, r.to)) {
        await refreshBackfill(r.from, r.to);
      }
    }
  } else {
    maybeBackgroundRefresh(from, to);
  }
  const d = getDb();
  return d.prepare(
    `SELECT fdate, empID, departID, otHours, overtimeMinutes,
            onTime1, offTime1, onTime2, offTime2,
            attendDays, dayType, CardList
       FROM hr_ot WHERE fdate BETWEEN ? AND ?`
  ).all(from, to);
}

// Đồng bộ TOÀN BỘ (chunk theo tháng) — chạy 1 lần lúc khởi động khi SQLite trống.
export async function fullSync() {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  const r = await hrQuery(`SELECT MIN(fdate) AS minD, MAX(fdate) AS maxD FROM v_hr_ot_daily`);
  if (!r[0].minD) {
    console.log(`[hr-snapshot] FULL SYNC ${startedAt} — nguồn view rỗng, không có gì để kéo`);
    return 0;
  }
  let from = r[0].minD;
  const to = r[0].maxD;
  let total = 0;
  // Master data TRƯỚC — whitelist phòng ban sản xuất cần có trong SQLite để lọc rows.
  await syncMasterData();
  console.log(`[hr-snapshot] FULL SYNC BẮT ĐẦU ${startedAt} — phạm vi ${from}..${to}`);
  while (from <= to) {
    const [y, m] = from.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const chunkEnd = addDay(next, -1);
    total += await refreshRange(from, chunkEnd > to ? to : chunkEnd);
    from = next;
  }
  console.log(`[hr-snapshot] FULL SYNC HOÀN TẤT ${new Date().toISOString()} — sau ${((Date.now() - t0) / 1000).toFixed(1)}s, tổng ${total} dòng + master data`);
  return total;
}

// Đối soát số dòng SQLite vs view theo từng ngày gần nhất (chỉ cảnh báo, không tự sửa).
// Lưu ý: SQLite đã LỌC theo phòng ban sản xuất → đối soát cũng lọc nguồn cùng điều kiện.
export async function reconcileRecent(days = 7) {
  const to = todayLocal();
  const from = addDay(to, -days + 1);
  const prodIds = productionDeptIdSet();
  const srcRows = await hrQuery(
    `SELECT fdate, departID FROM v_hr_ot_daily WHERE fdate >= @from AND fdate <= @to`,
    { from, to }
  );
  const srcCounts = new Map();
  for (const r of srcRows) {
    if (prodIds && !prodIds.has(String(r.departID || '').toLowerCase())) continue;
    srcCounts.set(r.fdate, (srcCounts.get(r.fdate) || 0) + 1);
  }
  const d = getDb();
  const mismatches = [];
  const dates = new Set([...srcCounts.keys(), ...d.prepare(`SELECT DISTINCT fdate d FROM hr_ot WHERE fdate BETWEEN ? AND ?`).all(from, to).map((r) => r.d)]);
  for (const fdate of dates) {
    const s = d.prepare(`SELECT COUNT(*) c FROM hr_ot WHERE fdate = ?`).get(fdate).c;
    const src = srcCounts.get(fdate) || 0;
    if (s !== src) mismatches.push({ fdate, hr: src, sqlite: s });
  }
  if (mismatches.length) console.warn(`[hr-snapshot] đối soát lệch ${mismatches.length} ngày:`, mismatches.slice(0, 5));
  else console.log(`[hr-snapshot] đối soát ${from}..${to}: khớp`);
  return mismatches;
}

// ---------- Master data (nhân viên / phòng ban) ----------
// Đồng bộ từ view vào SQLite (upsert + xóa dòng đã mất ở nguồn).
export async function syncMasterData() {
  if (demoEnabled()) return;
  const [empsRaw, deptsRaw] = await Promise.all([
    hrQuery(`SELECT uID, code, name, departID, status FROM v_hr_employee`),
    hrQuery(`SELECT uID, code, name, engName, status FROM v_hr_department`),
  ]);
  // Chỉ giữ PHÒNG BAN SẢN XUẤT + nhân viên thuộc phòng sản xuất (whitelist 29/10/2026).
  const prodDeptIds = new Set(
    deptsRaw.filter((x) => isProductionDeptName(x.name, x.engName)).map((x) => String(x.uID).toLowerCase())
  );
  const depts = deptsRaw.filter((x) => prodDeptIds.has(String(x.uID).toLowerCase()));
  const emps = empsRaw.filter((e) => prodDeptIds.has(String(e.departID || '').toLowerCase()));
  if (depts.length === 0) {
    console.warn('[hr-snapshot] master sync: danh mục phòng ban rỗng sau khi lọc — bỏ qua để tránh xoá sạch');
    return;
  }
  const d = getDb();
  const insEmp = d.prepare(`
    INSERT INTO hr_employee (uID, code, name, departID, status)
    VALUES (@uID, @code, @name, @departID, @status)
    ON CONFLICT(uID) DO UPDATE SET
      code=excluded.code, name=excluded.name,
      departID=excluded.departID, status=excluded.status`);
  const insDept = d.prepare(`
    INSERT INTO hr_department (uID, code, name, engName, status)
    VALUES (@uID, @code, @name, @engName, @status)
    ON CONFLICT(uID) DO UPDATE SET code=excluded.code, name=excluded.name, engName=excluded.engName, status=excluded.status`);
  const tx = d.transaction(() => {
    d.exec(`CREATE TEMP TABLE IF NOT EXISTS _hr_emp_keys (uID TEXT PRIMARY KEY)`);
    d.exec(`CREATE TEMP TABLE IF NOT EXISTS _hr_dept_keys (uID TEXT PRIMARY KEY)`);
    d.prepare(`DELETE FROM _hr_emp_keys`).run();
    d.prepare(`DELETE FROM _hr_dept_keys`).run();
    const kEmp = d.prepare(`INSERT OR IGNORE INTO _hr_emp_keys (uID) VALUES (?)`);
    const kDept = d.prepare(`INSERT OR IGNORE INTO _hr_dept_keys (uID) VALUES (?)`);
    for (const r of emps) { insEmp.run(r); kEmp.run(r.uID); }
    for (const r of depts) { insDept.run(r); kDept.run(r.uID); }
    d.prepare(`DELETE FROM hr_employee WHERE uID NOT IN (SELECT uID FROM _hr_emp_keys)`).run();
    d.prepare(`DELETE FROM hr_department WHERE uID NOT IN (SELECT uID FROM _hr_dept_keys)`).run();
  });
  tx();
  masterSyncedAt = Date.now();
  console.log(`[hr-snapshot] master sync: ${emps.length} nhân viên, ${depts.length} phòng ban (chỉ SẢN XUẤT; nguồn ${empsRaw.length}/${deptsRaw.length})`);
}

// Đảm bảo master data đã có trong SQLite. Rỗng (lần deploy đầu) -> kéo blocking (nhỏ, nhanh);
// non-empty nhưng quá 30 phút chưa sync -> refresh nền.
export async function ensureMasterData() {
  if (demoEnabled()) return;
  const d = getDb();
  const n = d.prepare(`SELECT COUNT(*) c FROM hr_employee`).get().c;
  if (n === 0) {
    try { await syncMasterData(); }
    catch (e) { console.warn(`[hr-snapshot] master sync lỗi: ${e.message}`); }
    return;
  }
  if (Date.now() - masterSyncedAt > config.snapshotIntervalMin * 60 * 1000) {
    masterSyncedAt = Date.now();
    syncMasterData().catch((e) => console.warn('[hr-snapshot] master sync nền lỗi:', e.message));
  }
}

// Job nền: mỗi SNAPSHOT_INTERVAL_MIN phút kéo 7 ngày gần nhất + master data.
export function startJob() {
  if (demoEnabled() || jobTimer) return;
  const d = getDb();
  const empty = d.prepare('SELECT COUNT(*) c FROM hr_ot').get().c === 0;
  const run = () => {
    if (jobRunning) return;
    jobRunning = true;
    const to = todayLocal();
    const from = addDay(to, -6);
    const task = empty
      ? fullSync()
      : refreshRange(from, to).then(() => syncMasterData());
    if (empty) console.log(`[hr-snapshot] SQLite trống (lần đầu) — bắt đầu full sync toàn bộ lịch sử ${new Date().toISOString()}`);
    task
      .then(() => reconcileRecent(7))
      .catch((err) => console.warn('[hr-snapshot] job lỗi:', err.message))
      .finally(() => { jobRunning = false; });
  };
  run();
  jobTimer = setInterval(run, config.snapshotIntervalMin * 60 * 1000);
}
