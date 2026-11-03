// EXPORTS: formatNumber
// 03/11/2026: định dạng số hiển thị cho người xem — phân cách hàng nghìn
// bằng dấu phẩy, phần thập phân ngăn cách bằng dấu chấm:
//   51125.77  → "51,125.77"
//   59614     → "59,614.00"  (digits mặc định 2)
//   2043      → "2,043"      (digits = 0)
export function formatNumber(v: number, digits = 2): string {
  const [int, dec] = v.toFixed(digits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec ? `${grouped}.${dec}` : grouped;
}
