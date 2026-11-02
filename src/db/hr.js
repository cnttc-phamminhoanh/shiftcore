// Kết nối DB HR — SQL Server (chấm công thực tế)
import sql from 'mssql';
import { config } from '../config.js';

let pool = null;
// Cooldown: sau khi HR không kết nối được, trong HR_DOWN_COOLDOWN_MS không thử
// lại (tránh mỗi request/endpoint đều chờ timeout connect ~30s khi HR đang down).
const HR_DOWN_COOLDOWN_MS = 45 * 1000;
let hrDownUntil = 0;

export async function getHrPool() {
  if (pool) return pool;
  if (!config.hr.server || !config.hr.database) {
    throw new Error('Thiếu cấu hình DB_HR_* (xem .env) — hoặc chạy DEMO=1');
  }
  // Fail nhanh: LAN/VPN nội bộ — kết nối được thì <1s, không được thì chờ ngắn.
  pool = await new sql.ConnectionPool({
    server: config.hr.server,
    database: config.hr.database,
    user: config.hr.user,
    password: config.hr.password,
    connectionTimeout: 4000,
    requestTimeout: 30000,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  }).connect();
  pool.on('error', () => {
    pool = null;
  });
  return pool;
}

async function runOnce(text, params) {
  const request = (await getHrPool()).request();
  for (const [k, v] of Object.entries(params)) {
    request.input(k, v);
  }
  const result = await request.query(text);
  return result.recordset;
}

// Chỉ dùng SQL tham số hoá (@param) — chống SQL injection.
export async function hrQuery(text, params = {}) {
  if (Date.now() < hrDownUntil) {
    throw new Error(`HR đang trong cooldown (đợi đến ${new Date(hrDownUntil).toISOString()})`);
  }
  try {
    return await runOnce(text, params);
  } catch (e) {
    hrDownUntil = Date.now() + HR_DOWN_COOLDOWN_MS;
    console.warn(`[hr] kết nối HR lỗi (cooldown ${HR_DOWN_COOLDOWN_MS / 1000}s):`, e.message);
    try { pool && pool.close(); } catch { /* empty */ }
    pool = null;
    throw e;
  }
}
