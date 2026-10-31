// Kết nối DB T8 — SQL Server (đơn đăng ký tăng ca)
import sql from 'mssql';
import { config } from '../config.js';

let pool = null;

export async function getT8Pool() {
  if (pool) return pool;
  if (!config.t8.server || !config.t8.database) {
    throw new Error('Thiếu cấu hình DB_T8_* (xem .env) — hoặc chạy DEMO=1');
  }
  pool = await new sql.ConnectionPool({
    server: config.t8.server,
    database: config.t8.database,
    user: config.t8.user,
    password: config.t8.password,
    connectionTimeout: 15000,
    requestTimeout: 60000,
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
  const request = (await getT8Pool()).request();
  for (const [k, v] of Object.entries(params)) {
    request.input(k, v);
  }
  const result = await request.query(text);
  return result.recordset;
}

export async function t8Query(text, params = {}) {
  try {
    return await runOnce(text, params);
  } catch (e) {
    // Mất kết nối idle (RDS đóng) -> reset pool rồi thử lại 1 lần.
    console.warn('[t8] ket noi loi, reset pool va thu lai:', e.message);
    try { pool && pool.close(); } catch { /* empty */ }
    pool = null;
    return runOnce(text, params);
  }
}
