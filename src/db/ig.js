// Kết nối DB Igarment — MySQL (quẹt thẻ sản lượng / bảng "nóng")
import mysql from 'mysql2/promise';
import { config } from '../config.js';

let pool = null;

export async function getIgPool() {
  if (pool) return pool;
  if (!config.ig.host || !config.ig.database) {
    throw new Error('Thiếu cấu hình DB_IG_* (xem .env) — hoặc chạy DEMO=1');
  }
  pool = mysql.createPool({
    host: config.ig.host,
    port: config.ig.port,
    database: config.ig.database,
    user: config.ig.user,
    password: config.ig.password,
    connectionLimit: 5,
    waitForConnections: true,
  });
  return pool;
}

// Chỉ dùng placeholder '?' — chống SQL injection.
export async function igQuery(text, params = []) {
  const p = await getIgPool();
  const [rows] = await p.query(text, params);
  return rows;
}
