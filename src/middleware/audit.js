// Audit log — ghi mỗi lần gọi API vào logs/audit.log (phục vụ truy vết khi có sự cố / key bị lộ / ai đó tải dữ liệu bất thường).
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const logFile = path.resolve(config.logDir, 'audit.log');

export function auditLog(entry) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch {
    /* audit không được phép làm sập server */
  }
}

export function auditMiddleware(req, res, next) {
  res.on('finish', () => {
    auditLog({
      t: new Date().toISOString(),
      ip: req.clientIp || '',
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ua: req.get('user-agent') || '',
    });
  });
  next();
}
