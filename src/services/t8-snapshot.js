// ============================================================
// SNAPSHOT T8 (SQLite local) — cùng pattern với HR snapshot.
// Bảng nóng att_overtime trên RDS aliyun query chậm (~24s/khoảng 2 tháng).
// Job 30 phút kéo 7 ngày gần nhất -> SQLite; lazy backfill cho khoảng cũ;
// DIFF-SYNC xóa dòng trong khoảng đã kéo mà không còn ở nguồn;
// khoảng trong vùng phủ nhưng quá 30 phút -> refresh nền (không chặn request).
// ============================================================
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { config, demoEnabled } from '../config.js';
import { t8Query } from '../db/t8.js';
import { isProductionDeptName } from '../rules/production-depts.js';

const DB_FILE = path.join(config.cacheDir, 'hr_snapshot.db');

let db = null;
let jobRunning = false;
let jobTimer = null;
let lastRefresh = 0;
let refreshing = null;

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
    CREATE TABLE IF NOT EXISTS t8_ot (
      emp_no      TEXT NOT NULL,
      dateFr      TEXT NOT NULL,
      dateTo      TEXT,
      start_time  TEXT,
      end_time    TEXT,
      sheet_hour  REAL DEFAULT 0,
      rem         REAL DEFAULT 0,
      sheet_no    TEXT,
      sheetDate   TEXT,
      checkDate   TEXT,
      sheet_sta   INTEGER,
      PRIMARY KEY (emp_no, dateFr, sheet_no)
    );
    CREATE INDEX IF NOT EXISTS idx_t8_ot_dateFr ON t8_ot(dateFr);
    -- Index hợp cho GROUP BY dateFr,emp_no + WHERE dateFr BETWEEN (30/10/2026):
    CREATE INDEX IF NOT EXISTS idx_t8_ot_dateFr_emp ON t8_ot(dateFr, emp_no);
  `);
  // Migration cho DB cũ: thêm 2 cột thời gian nếu chưa có.
  const cols = db.prepare(`PRAGMA table_info(t8_ot)`).all().map((c) => c.name);
  if (!cols.includes('start_time')) db.exec(`ALTER TABLE t8_ot ADD COLUMN start_time TEXT`);
  if (!cols.includes('end_time')) db.exec(`ALTER TABLE t8_ot ADD COLUMN end_time TEXT`);
  return db;
}

// Mã nhân viên SẢN XUẤT (whitelist 29/10/2026): nhân viên trong hr_employee thuộc phòng ban
// sản xuất. Trả null khi chưa có master data (an toàn: KHÔNG lọc).
function productionEmpCodes() {
  try {
    const d = getDb();
    const rows = d.prepare(
      `SELECT e.code, de.name AS dn, de.engName AS den
         FROM hr_employee e LEFT JOIN hr_department de ON LOWER(de.uID) = LOWER(e.departID)`
    ).all();
    if (rows.length === 0) return null;
    const set = new Set();
    for (const r of rows) if (isProductionDeptName(r.dn, r.den)) set.add(String(r.code));
    return set.size ? set : null;
  } catch {
    return null;
  }
}

// Ghi 1 lô + DIFF: xóa dòng trong [from, toPlus) không còn ở nguồn.
// Bỏ qua bước xóa khi lô rỗng (tránh "ngày không có dòng = xóa sạch").
function syncRows(rows, from, toPlus) {
  if (!rows || rows.length === 0) return 0;
  const d = getDb();
  const insert = d.prepare(`
    INSERT INTO t8_ot (emp_no, dateFr, dateTo, start_time, end_time, sheet_hour, rem, sheet_no, sheetDate, checkDate, sheet_sta)
    VALUES (@emp_no, @dateFr, @dateTo, @start_time, @end_time, @sheet_hour, @rem, @sheet_no, @sheetDate, @checkDate, @sheet_sta)
    ON CONFLICT(emp_no, dateFr, sheet_no) DO UPDATE SET
      dateTo=excluded.dateTo, start_time=excluded.start_time, end_time=excluded.end_time,
      sheet_hour=excluded.sheet_hour, rem=excluded.rem,
      sheetDate=excluded.sheetDate, checkDate=excluded.checkDate, sheet_sta=excluded.sheet_sta
  `);
  d.exec(`CREATE TEMP TABLE IF NOT EXISTS _t8_sync_keys (emp_no TEXT NOT NULL, dateFr TEXT NOT NULL, sheet_no TEXT NOT NULL, PRIMARY KEY(emp_no, dateFr, sheet_no))`);
  const keyIns = d.prepare(`INSERT OR IGNORE INTO _t8_sync_keys (emp_no, dateFr, sheet_no) VALUES (?, ?, ?)`);
  const tx = d.transaction((list) => {
    d.prepare(`DELETE FROM _t8_sync_keys`).run();
    for (const r of list) {
      insert.run(r);
      keyIns.run(r.emp_no, r.dateFr, r.sheet_no);
    }
    d.prepare(
      `DELETE FROM t8_ot
        WHERE dateFr >= @from AND dateFr < @toPlus
          AND NOT EXISTS (SELECT 1 FROM _t8_sync_keys k
                           WHERE k.emp_no = t8_ot.emp_no
                             AND k.dateFr = t8_ot.dateFr
                             AND k.sheet_no = t8_ot.sheet_no)`
    ).run({ from, toPlus });
  });
  tx(rows);
  return rows.length;
}

export async function refreshRange(from, to) {
  const toPlus = addDay(to, 1);
  const rows = await t8Query(
    `SELECT emp_no, dateFr, dateTo,
            CAST(start_time AS varchar(10)) AS start_time,
            CAST(end_time AS varchar(10)) AS end_time,
            sheet_hour, rem, sheet_no, sheetDate, checkDate, sheet_sta
       FROM v_t8_ot
      WHERE dateFr >= @from AND dateFr < @toPlus`,
    { from, toPlus }
  );
  // Lọc chỉ nhân viên sản xuất (giữ nguyên khi chưa có master).
  const prodCodes = productionEmpCodes();
  let list = rows;
  if (prodCodes) {
    const filtered = rows.filter((r) => prodCodes.has(String(r.emp_no)));
    if (filtered.length !== rows.length) console.log(`[t8-snapshot] lọc phi sản xuất: bỏ ${rows.length - filtered.length}/${rows.length} dòng`);
    list = filtered;
    if (list.length === 0) return 0;
  }
  const n = syncRows(list, from, toPlus);
  lastRefresh = Date.now();
  console.log(`[t8-snapshot] refresh ${from}..${to}: upsert ${n} dòng`);
  return n;
}

function missingRange(from, to) {
  const row = getDb().prepare(
    `SELECT MIN(dateFr) AS minD, MAX(dateFr) AS maxD FROM t8_ot`
  ).get();
  if (!row || !row.minD) return { from, to };
  if (from < row.minD || to > row.maxD) return { from, to };
  return null;
}

function maybeBackgroundRefresh(from, to) {
  const stale = Date.now() - lastRefresh > config.snapshotIntervalMin * 60 * 1000;
  if (!stale || refreshing) return;
  // 30/10/2026: chỉ refresh PHẦN GẦN (7 ngày trước `to`) — trước đây refresh cả
  // khoảng yêu cầu (~397k dòng) chặn event loop ~20s khi mở trang.
  const start = addDay(to, -7);
  refreshing = refreshRange(start, to)
    .catch((err) => console.warn('[t8-snapshot] refresh nền lỗi:', err.message))
    .finally(() => { refreshing = null; });
}

export async function ensureRange(from, to) {
  if (demoEnabled()) return [];
  const miss = missingRange(from, to);
  if (miss) {
    try { await refreshRange(miss.from, miss.to); }
    catch (e) { console.warn(`[t8-snapshot] backfill lỗi (vẫn trả dữ liệu cũ): ${e.message}`); }
  } else {
    maybeBackgroundRefresh(from, to);
  }
  return getDb().prepare(
    `SELECT emp_no, dateFr, dateTo, start_time, end_time, sheet_hour, rem, sheet_no, sheetDate, checkDate, sheet_sta
       FROM t8_ot WHERE dateFr BETWEEN ? AND ? AND sheet_sta = ?`
  ).all(from, to, config.t8SheetSta);
}

// Đồng bộ TOÀN BỘ (chunk theo tháng).
export async function fullSync() {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  const r = await t8Query(`SELECT MIN(dateFr) AS minD, MAX(dateFr) AS maxD FROM v_t8_ot`);
  if (!r[0].minD) {
    console.log(`[t8-snapshot] FULL SYNC ${startedAt} — nguồn view rỗng, không có gì để kéo`);
    return 0;
  }
  // T8 chỉ cần đồng bộ từ mốc này trở đi (HR mới có dữ liệu chấm công từ 12/2025).
  const SYNC_FROM = '2025-12-01';
  let from = String(r[0].minD).slice(0, 10) > SYNC_FROM ? String(r[0].minD).slice(0, 10) : SYNC_FROM;
  const to = String(r[0].maxD).slice(0, 10);
  let total = 0;
  console.log(`[t8-snapshot] FULL SYNC BẮT ĐẦU ${startedAt} — phạm vi ${from}..${to}`);
  while (from <= to) {
    const [y, m] = from.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const chunkEnd = addDay(next, -1);
    total += await refreshRange(from, chunkEnd > to ? to : chunkEnd);
    from = next;
  }
  console.log(`[t8-snapshot] FULL SYNC HOÀN TẤT ${new Date().toISOString()} — sau ${((Date.now() - t0) / 1000).toFixed(1)}s, tổng ${total} dòng`);
  return total;
}

export async function reconcileRecent(days = 7) {
  const to = todayLocal();
  const from = addDay(to, -days + 1);
  const prodCodes = productionEmpCodes();
  // Lấy dòng thô (chưa gộp) để lọc đúng theo nhân viên sản xuất, rồi đếm theo (ngày, sheet_sta).
  const srcRows = await t8Query(
    `SELECT CONVERT(varchar(10), dateFr, 120) AS d, sheet_sta, emp_no FROM v_t8_ot
      WHERE dateFr >= @from AND dateFr <= @to`,
    { from, to }
  );
  const srcCounts = new Map();
  for (const r of srcRows) {
    if (prodCodes && !prodCodes.has(String(r.emp_no))) continue;
    const k = `${r.d}::${r.sheet_sta ?? 'NULL'}`;
    srcCounts.set(k, (srcCounts.get(k) || 0) + 1);
  }
  const d = getDb();
  const localRows = d.prepare(`SELECT dateFr, sheet_sta, emp_no FROM t8_ot WHERE dateFr BETWEEN ? AND ?`).all(from, to);
  const locCounts = new Map();
  for (const r of localRows) {
    if (prodCodes && !prodCodes.has(String(r.emp_no))) continue;
    const k = `${r.dateFr}::${r.sheet_sta ?? 'NULL'}`;
    locCounts.set(k, (locCounts.get(k) || 0) + 1);
  }
  const mismatches = [];
  const keys = new Set([...srcCounts.keys(), ...locCounts.keys()]);
  for (const k of keys) {
    if ((srcCounts.get(k) || 0) !== (locCounts.get(k) || 0)) {
      const [date, sheet] = k.split('::');
      mismatches.push({ date, sheet_sta: sheet === 'NULL' ? null : Number(sheet), t8: srcCounts.get(k) || 0, sqlite: locCounts.get(k) || 0 });
    }
  }
  if (mismatches.length) console.warn(`[t8-snapshot] đối soát lệch ${mismatches.length} nhóm:`, mismatches.slice(0, 5));
  else console.log(`[t8-snapshot] đối soát ${from}..${to}: khớp`);
  return mismatches;
}

export function startJob() {
  if (demoEnabled() || jobTimer) return;
  const d = getDb();
  const empty = d.prepare('SELECT COUNT(*) c FROM t8_ot').get().c === 0;
  const run = () => {
    if (jobRunning) return;
    jobRunning = true;
    const to = todayLocal();
    const from = addDay(to, -6);
    const task = empty ? fullSync() : refreshRange(from, to);
    if (empty) console.log(`[t8-snapshot] SQLite trống (lần đầu) — bắt đầu full sync toàn bộ lịch sử ${new Date().toISOString()}`);
    task
      .then(() => reconcileRecent(7))
      .catch((err) => console.warn('[t8-snapshot] job lỗi:', err.message))
      .finally(() => { jobRunning = false; });
  };
  run();
  jobTimer = setInterval(run, config.snapshotIntervalMin * 60 * 1000);
}
