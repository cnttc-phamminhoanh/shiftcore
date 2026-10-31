// Chạy tay: node scripts/full-sync.mjs
// Đồng bộ toàn bộ HR + T8 về SQLite (xoá dữ liệu cũ và kéo lại).
// Bản 28/10/2026: log thời gian start→end (ISO timestamp) cho từng phần + tổng;
// đồng thời đồng bộ master data (nhân viên/phòng ban).
// Bản 29/10/2026: GỠ Igarment (ig_swipe) khỏi hệ thống — chỉ còn HR + T8.
import { fullSync as hrFull } from '../src/services/hr-snapshot.js';
import { fullSync as t8Full } from '../src/services/t8-snapshot.js';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'cache', 'hr_snapshot.db'));
db.exec('DELETE FROM hr_ot; DELETE FROM t8_ot; DELETE FROM hr_employee; DELETE FROM hr_department;');
db.close();
console.log(`===== FULL SYNC BẮT ĐẦU ${new Date().toISOString()} — đã xoá bảng cũ =====`);

const tStart = Date.now();

console.log('\n--- HR ---');
const tHr = Date.now();
const nHr = await hrFull();
console.log(`HR xong trong ${((Date.now() - tHr) / 1000).toFixed(1)}s (${nHr} dòng)`);

console.log('\n--- T8 ---');
const tT8 = Date.now();
const nT8 = await t8Full();
console.log(`T8 xong trong ${((Date.now() - tT8) / 1000).toFixed(1)}s (${nT8} dòng)`);

console.log(`\n===== FULL SYNC HOÀN TẤT ${new Date().toISOString()} — TỔNG ${((Date.now() - tStart) / 1000).toFixed(1)}s (HR ${nHr} + T8 ${nT8} dòng) =====`);
process.exit(0);
