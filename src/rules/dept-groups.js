// ============================================================
// Ánh xạ phòng ban THẬT (HR / T8 / Igarment) về 7 nhóm quy trình mà UI dùng:
// CUT, SEW, EMB, PRI, FIN, PAC, OTHER.
// Dựa trên từ khoá trong tên phòng ban (tiếng Việt + tiếng Anh).
// => Nếu phòng ban thực tế của công ty khác, chỉ cần sửa mảng này.
// ============================================================
export const SPIKE_DEPARTMENT_GROUPS = ['CUT', 'SEW', 'EMB', 'PRI', 'FIN', 'PAC', 'OTHER'];

const GROUP_KEYWORDS = [
  { group: 'CUT', kw: ['cut', 'cắt', 'cat', '裁剪', '剪'] },
  { group: 'EMB', kw: ['emb', 'thêu', '绣'] },
  { group: 'PRI', kw: ['print', 'in ấn', '印'] },
  { group: 'FIN', kw: ['finish', 'fin', 'hoàn', '整烫', '整'] },
  { group: 'PAC', kw: ['pack', 'đóng gói', 'bao bì', '包装', '装'] },
  { group: 'SEW', kw: ['sew', 'may', 'chuyền', '缝', '车'] },
];

export function mapDeptToGroup(name = '', engName = '') {
  const s = `${name || ''} ${engName || ''}`.toLowerCase();
  for (const g of GROUP_KEYWORDS) {
    if (g.kw.some((k) => s.includes(k))) return g.group;
  }
  return 'OTHER';
}
