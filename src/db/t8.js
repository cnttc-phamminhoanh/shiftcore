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

export async function t8Query(text, params = {}) {
  const request = (await getT8Pool()).request();
  for (const [k, v] of Object.entries(params)) {
    request.input(k, v);
  }
  const result = await request.query(text);
  return result.recordset;
}
