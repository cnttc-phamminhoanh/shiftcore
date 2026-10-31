import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Nạp .env TRƯỚC khi đọc process.env. (Bug cũ: thiếu dòng này → .env bị bỏ qua.)
dotenv.config({ path: path.join(projectRoot, '.env') });

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v !== undefined ? n : d;
};

export const config = {
  port: num(process.env.PORT, 3000),
  demo: bool(process.env.DEMO, false),
  allowCidrs: (process.env.ALLOW_CIDRS || '127.0.0.1/32,::1/128')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  rateLimitMax: num(process.env.RATE_LIMIT_MAX, 300),
  rateLimitWindowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  httpsKey: process.env.HTTPS_KEY || '',
  httpsCert: process.env.HTTPS_CERT || '',
  hr: {
    server: process.env.DB_HR_SERVER || '',
    database: process.env.DB_HR_DATABASE || '',
    user: process.env.DB_HR_USER || '',
    password: process.env.DB_HR_PASSWORD || '',
  },
  t8: {
    server: process.env.DB_T8_SERVER || '',
    database: process.env.DB_T8_DATABASE || '',
    user: process.env.DB_T8_USER || '',
    password: process.env.DB_T8_PASSWORD || '',
  },
  t8SheetSta: num(process.env.T8_SHEET_STA, 1),
  snapshotIntervalMin: num(process.env.SNAPSHOT_INTERVAL_MIN, 30),
  publicDir: path.join(projectRoot, 'public'),
  cacheDir: path.join(projectRoot, 'cache'),
  logDir: path.join(projectRoot, 'logs'),
};

export const demoEnabled = () => config.demo;
