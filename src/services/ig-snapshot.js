// ============================================================
// SNAPSHOT "lần quẹt thẻ cuối" — theo phương án đã thống nhất:
// API phục vụ request CHỈ ĐỌC bảng snapshot ig_last_swipe (MySQL).
// Bảng pytckreg/pyperson (bảng nóng) chỉ bị job đụng tới mỗi SNAPSHOT_INTERVAL_MIN.
//
// Job làm 2 việc bằng câu gộp (không phải 1 câu cho từng công nhân):
//   1) Upsert giờ quẹt cuối: MAX(RegTime) GROUP BY (pyperson.IDNo, RegDate)
//   2) Cập nhật chi tiết (mã hàng/bước/số lượng) của đúng lượt quẹt cuối
// Độ trễ cột tham khảo ≤ SNAPSHOT_INTERVAL_MIN (mặc định 30 phút).
// ============================================================
import { igQuery } from '../db/ig.js';
import { config, demoEnabled } from '../config.js';

const SNAPSHOT_TABLE = 'ig_last_swipe';

let lastRefresh = 0;
let loading = null;
let jobTimer = null;

function addDayLocal(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Chụp 1 khoảng ngày [from, to] — ghi vào bảng snapshot (2 câu gộp).
export async function refreshRange(from, to) {
  // 1) Giờ quẹt cuối theo (công nhân, ngày) — upsert
  await igQuery(
    `INSERT INTO ${SNAPSHOT_TABLE} (emp_code, reg_date, last_time, refreshed_at)
     SELECT p.IDNo,
            r.RegDate,
            TIME_FORMAT(MAX(r.RegTime), '%H:%i'),
            NOW()
       FROM pytckreg r
       INNER JOIN pyperson p ON p.SysID = r.RegPerSysID
      WHERE r.RegDate BETWEEN ? AND ?
      GROUP BY p.IDNo, r.RegDate
     ON DUPLICATE KEY UPDATE
        last_time   = VALUES(last_time),
        refreshed_at = VALUES(refreshed_at)`,
    [from, to]
  );
  // 2) Chi tiết của đúng lượt quẹt cuối (mã hàng, bước, số lượng — tham khảo)
  await igQuery(
    `UPDATE ${SNAPSHOT_TABLE} s
     INNER JOIN (
        SELECT p.IDNo, r.RegDate, r.WrkOrder, r.StepNo, r.Qty, r.StationID
          FROM pytckreg r
          INNER JOIN pyperson p ON p.SysID = r.RegPerSysID
          INNER JOIN (
             SELECT RegPerSysID, RegDate, MAX(RegTime) AS mt
               FROM pytckreg
              WHERE RegDate BETWEEN ? AND ?
              GROUP BY RegPerSysID, RegDate
          ) x ON r.RegPerSysID = x.RegPerSysID AND r.RegDate = x.RegDate AND r.RegTime = x.mt
     ) d ON s.emp_code = d.IDNo AND s.reg_date = d.RegDate
     SET s.wrk_order  = d.WrkOrder,
         s.step_no    = d.StepNo,
         s.qty        = d.Qty,
         s.station_id = d.StationID`,
    [from, to]
  );
  lastRefresh = Date.now();
}

function ensureCovered(from, to) {
  const stale = Date.now() - lastRefresh > config.snapshotIntervalMin * 60 * 1000;
  if (!stale) return Promise.resolve();
  if (loading) return loading.catch(() => undefined);
  loading = refreshRange(from, to)
    .catch((err) => {
      lastRefresh = 0;
      console.warn('[ig-snapshot] refresh lỗi:', err.message);
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

// Đọc snapshot — KHÔNG đụng pytckreg. Trả về: empCode, date, time, wrkOrder, stepNo, qty, stationId
export async function getLastSwipes(from, to) {
  if (demoEnabled()) return [];
  await ensureCovered(from, to);
  const rows = await igQuery(
    `SELECT emp_code,
            DATE_FORMAT(reg_date, '%Y-%m-%d') AS regDate,
            TIME_FORMAT(last_time, '%H:%i')   AS lastTime,
            wrk_order, step_no, qty, station_id
       FROM ${SNAPSHOT_TABLE}
      WHERE reg_date BETWEEN ? AND ?`,
    [from, to]
  );
  return rows.map((r) => ({
    empCode: String(r.emp_code),
    date: String(r.regDate),
    time: String(r.lastTime),
    wrkOrder: r.wrk_order || '',
    stepNo: r.step_no ?? null,
    qty: r.qty ?? null,
    stationId: r.station_id ?? null,
  }));
}

// Job định kỳ: chụp vài ngày gần nhất để dashboard luôn có dữ liệu mới.
export function startSnapshotJob() {
  if (demoEnabled() || jobTimer) return;
  const run = () => {
    const to = addDayLocal(todayLocal(), 1);
    const from = addDayLocal(todayLocal(), -3);
    refreshRange(from, to).catch((err) => console.warn('[ig-snapshot] job lỗi:', err.message));
  };
  run();
  jobTimer = setInterval(run, config.snapshotIntervalMin * 60 * 1000);
}
