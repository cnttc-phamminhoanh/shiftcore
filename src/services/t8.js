// Truy vấn DB T8 — CHỈ ĐỌC VIEW v_t8_ot (đã join att_overtime1 + att_overtime2).
// Chỉ tính các đơn có sheet_sta = T8_SHEET_STA (mặc định 1 = đã duyệt).
import { t8Query } from '../db/t8.js';
import { config } from '../config.js';
import { addDay } from './hr.js';

export async function getOtLinesRange(from, to) {
  const toPlus = addDay(to, 1);
  return t8Query(
    `SELECT emp_no, dateFr, dateTo, sheet_hour, rem, sheet_no, sheetDate, checkDate, sheet_sta
       FROM v_t8_ot
      WHERE sheet_sta = @sta
        AND dateFr >= @from AND dateFr < @toPlus`,
    { sta: config.t8SheetSta, from, toPlus }
  );
}
