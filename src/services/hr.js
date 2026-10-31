// Truy vấn DB HR — UI/API CHỈ đọc SQLite (snapshot). Không gọi view trong request.
// View (v_hr_*) chỉ được job snapshot đụng tới (xem hr-snapshot.js).
import { ensureMasterData, getSnapshotDb } from './hr-snapshot.js';

// Master data (nhân viên) — đọc từ SQLite; job làm mới mỗi 30 phút,
// rỗng (lần deploy đầu) thì ensureMasterData kéo blocking 1 lần.
export async function getEmployees() {
  await ensureMasterData();
  return getSnapshotDb().prepare(`SELECT uID, code, name, departID, status FROM hr_employee`).all();
}

export async function getDepartments() {
  await ensureMasterData();
  return getSnapshotDb().prepare(`SELECT uID, code, name, engName FROM hr_department`).all();
}

// Chấm công theo khoảng ngày [from, to] — đọc từ SQLite snapshot (lazy backfill
// tự kéo về từ view HR khi khoảng ngày chưa có). Tránh query thẳng bảng to.
import { ensureRange as hrSnapshotRange } from './hr-snapshot.js';
export async function getAttendanceRange(from, to) {
  return hrSnapshotRange(from, to);
}

export function addDay(iso, n = 1) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
