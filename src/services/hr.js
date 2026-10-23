// Truy vấn DB HR — CHỈ ĐỌC VIEW (v_hr_*) theo phương án đã thống nhất.
// View chỉ lộ cột cần thiết (mã, tên, phòng ban, giờ OT) — không lộ lương/CCCD/SĐT.
import { hrQuery } from '../db/hr.js';

const EMP_TTL = 10 * 60 * 1000;
let empCache = { t: 0, rows: null };
let deptCache = { t: 0, rows: null };

export async function getEmployees() {
  if (empCache.rows && Date.now() - empCache.t < EMP_TTL) return empCache.rows;
  const rows = await hrQuery(`SELECT code, name, departID FROM v_hr_employee`);
  empCache = { t: Date.now(), rows };
  return rows;
}

export async function getDepartments() {
  if (deptCache.rows && Date.now() - deptCache.t < EMP_TTL) return deptCache.rows;
  const rows = await hrQuery(`SELECT uID, code, name, engName FROM v_hr_department`);
  deptCache = { t: Date.now(), rows };
  return rows;
}

// Chấm công theo khoảng ngày [from, to] (bao gồm cả 2 đầu).
// fdate trong view đã là yyyy-MM-dd nên so sánh chuỗi, tránh lệch múi giờ.
export async function getAttendanceRange(from, to) {
  const toPlus = addDay(to, 1);
  return hrQuery(
    `SELECT fdate, empID, departID, otHours, overtimeMinutes,
            onTime1, offTime1, onTime2, offTime2,
            attendDays, dayType, CardList
       FROM v_hr_ot_daily
      WHERE fdate >= @from AND fdate < @toPlus`,
    { from, toPlus }
  );
}

export function addDay(iso, n = 1) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
