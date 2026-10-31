// ============================================================
// Ánh xạ phòng ban THẬT (HR / T8) về 8 nhóm quy trình mà UI dùng:
// CUT, SEW, EMB, PRI, FIN, PAC, SOC, OTHER.
// Dựa trên từ khoá trong tên phòng ban (tiếng Việt + tiếng Anh).
// => Nếu phòng ban thực tế của công ty khác, chỉ cần sửa mảng này.
// ============================================================
export const SPIKE_DEPARTMENT_GROUPS = ['CUT', 'SEW', 'EMB', 'PRI', 'FIN', 'PAC', 'SOC', 'OTHER'];

const GROUP_KEYWORDS = [
  { group: 'CUT', kw: ['cut', 'cắt', 'cat', '裁剪', '剪'] },
  { group: 'EMB', kw: ['emb', 'thêu', '绣'] },
  { group: 'PRI', kw: ['print', 'in ấn', '印'] },
  // FIN (hoàn thành): ủi, đóng nút cũng thuộc hoàn thành (29/10/2026)
  { group: 'FIN', kw: ['finish', 'final', 'hoàn', '整烫', '整', 'ủi', 'iron', 'đóng nút', 'button'] },
  // PAC (đóng gói): đóng thùng thuộc packing (29/10/2026)
  { group: 'PAC', kw: ['pack', 'đóng gói', 'đóng thùng', 'bao bì', 'crating', '装箱', '包装', '装'] },
  { group: 'SEW', kw: ['sew', 'may', 'chuyền', '缝', '车'] },
  // SOC (tất) — nhóm mới, tách riêng khỏi OTHER (29/10/2026)
  { group: 'SOC', kw: ['tất', 'sock', '袜'] },
];

// Phòng ban PHỤC VỤ (bảo trì / kỹ thuật / điện...) LUÔN về OTHER, kiểm tra TRƯỚC mọi
// nhóm quy trình — tránh từ khoá nhiễu: "Bảo trì máy may" chứa "may" nhưng là cơ khí,
// không phải nhóm may. Quyết định nghiệp vụ 28/10/2026: bảo trì/tài chính → OTHER.
const SERVICE_KEYWORDS = ['bảo trì', 'bảo dưỡng', 'sửa chữa', 'mechanic', 'maintenance', 'điện', 'electrical'];

export function mapDeptToGroup(name = '', engName = '') {
  const s = `${name || ''} ${engName || ''}`.toLowerCase();
  if (SERVICE_KEYWORDS.some((k) => s.includes(k))) return 'OTHER';
  for (const g of GROUP_KEYWORDS) {
    if (g.kw.some((k) => s.includes(k))) return g.group;
  }
  return 'OTHER';
}
