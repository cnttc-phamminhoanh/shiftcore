// Kết nối DB HR — SQL Server (chấm công thực tế)
import sql from 'mssql';
import { config } from '../config.js';

let pool = null;

export async function getHrPool() {
  if (pool) return pool;
  if (!config.hr.server || !config.hr.database) {
    throw new Error('Thiếu cấu hình DB_HR_* (xem .env) — hoặc chạy DEMO=1');
  }
  pool = await new sql.ConnectionPool({
    server: config.hr.server,
    database: config.hr.database,
    user: config.hr.user,
    password: config.hr.password,
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

// Chỉ dùng SQL tham số hoá (@param) — chống SQL injection.
export async function hrQuery(text, params = {}) {
  const request = (await getHrPool()).request();
  for (const [k, v] of Object.entries(params)) {
    request.input(k, v);
  }
  const result = await request.query(text);
  return result.recordset;
}
