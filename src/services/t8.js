// Truy vấn DB T8 — đọc từ SQLite snapshot (lazy backfill từ view v_t8_ot).
import { ensureRange as t8SnapshotRange } from './t8-snapshot.js';

export async function getOtLinesRange(from, to) {
  return t8SnapshotRange(from, to);
}
