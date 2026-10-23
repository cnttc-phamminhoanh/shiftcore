# OT Dashboard API — Node.js (UI + API)

Dashboard theo dõi giờ tăng ca công nhân. **Một server Node.js duy nhất** vừa phục vụ
UI (thư mục `public/`) vừa chạy API `/api/*` — UI và API cùng origin nên **không cần
CORS, không cần proxy**.

| Nguồn | Vai trò | Khóa liên kết |
| --- | --- | --- |
| **HR** (SQL Server) | Chấm công thực tế — **NGUỒN TÍNH CHÍNH** | `T_Card_Base_Employee.code` |
| **T8** (SQL Server) | Đơn đăng ký tăng ca — **NGUỒN TÍNH CHÍNH** | `att_overtime2.emp_no` = code |
| **Igarment** (MySQL) | Lần quẹt thẻ cuối — **CHỈ THAM KHẢO** | `pyperson.IDNo` = code (nội bộ qua `SysID`) |

---

## 1. Cài đặt & chạy

```bash
cd shiftcore
npm install
cp .env.example .env          # sửa các DB_* theo môi trường
npm start                     # chạy ở cổng PORT (mặc định 3000)
```

- **Demo (không cần DB):** `DEMO=1 npm start` — dùng dữ liệu mẫu y hệt UI.
- **Production:** `pm2 start server.js --name ot-dashboard` (hoặc systemd).
- Kiểm tra nhanh: mở `http://<IP-máy-chủ>:3000/api/health`.

### Trước khi nối DB thật (1 lần)

API **chỉ đọc VIEW / bảng SNAPSHOT, không bao giờ
đọc bảng gốc** — nên cần tạo chúng trước rồi mới cấp quyền:

```bash
# 1) Tạo VIEW + bảng snapshot (chạy trong SSMS / MySQL client)
sql/views.hr.sql         # HR:  v_hr_ot_daily, v_hr_employee, v_hr_department
sql/views.t8.sql         # T8:  v_t8_ot (join att_overtime1 + att_overtime2)
sql/snapshot.igarment.sql # IG: tạo BẢNG snapshot ig_last_swipe

# 2) Cấp quyền read-only — CHỈ trên view/snapshot
sql/readonly-grant.example.sql
```

### Build UI vào server

```bash
cd ui-src          # source React của dashboard (đã copy vào dự án)
npm install
npx vite build     # zip gốc thiếu scripts/ nên dùng vite build trực tiếp
# copy nội dung thư mục dist/ vào ../public/ :
rm -rf ../public && cp -r dist ../public
cd .. && npm start
```

Sau đó mọi người truy cập `http://<IP-máy-chủ>:3000/` là thấy dashboard.

---

## 2. Cấu hình `.env` (chỉ tồn tại ở server)

| Biến | Ý nghĩa |
| --- | --- |
| `PORT` | Cổng chạy (3000) |
| `DEMO` | `1` = dữ liệu mẫu; `0` = dữ liệu thật 3 DB |
| `ALLOW_CIDRS` | Dải IP được gọi API, VD `172.18.0.0/16,127.0.0.1/32` — **để trống = không giới hạn (không khuyến khích)** |
| `RATE_LIMIT_MAX` | Số request tối đa / client / phút (300) |
| `HTTPS_KEY` / `HTTPS_CERT` | Để trống = HTTP nội bộ; muốn HTTPS chỉ cần trỏ 2 file |
| `DB_HR_*` | SQL Server HR (chấm công) |
| `DB_T8_*` | SQL Server T8 (đơn tăng ca) |
| `DB_IG_*` | MySQL Igarment (quẹt thẻ sản lượng) |
| `T8_SHEET_STA` | Trạng thái đơn được tính (mặc định `1` = đã duyệt) |
| `SNAPSHOT_INTERVAL_MIN` | Chu kỳ chụp snapshot quẹt thẻ cuối (mặc định `30` phút) |
| `SCAN_BASE_HOUR` | Giờ gốc ước tính "phút đến quẹt cuối" (mặc định `6`) |

---

## 3. Các endpoint (UI sẽ gọi)

| Endpoint | Trả về | Ghi chú |
| --- | --- | --- |
| `GET /api/health` | `{ok, mode, time}` | Trạng thái server |
| `GET /api/departments` | `{groups: [...]}` | 7 nhóm: CUT SEW EMB PRI FIN PAC OTHER |
| `GET /api/kpi?from&to` | `{from, to, cards[]}` | 4 thẻ KPI (Worker Count, Plan, Actual, IGM) + sparkline |
| `GET /api/overtime/summary?from&to` | `{workerCount, planHours, actualHours, igmHours, searchDays}` | Tổng cho công thức trạng thái |
| `GET /api/overtime/daily?from&to&dept` | `{rows: IDailySummary[]}` | Bảng theo process/ngày |
| `GET /api/overtime/records?from&to&dept&process&alert&search&heavyOt` | `{rows: IWorkerOtRecord[], total}` | Bảng công nhân, đã áp đúng bộ lọc toolbar |
| `GET /api/overtime/monthly?from&to` | `{rows: IMonthlyData[]}` | Month 8/9/10 (3 tháng gần nhất) |
| `GET /api/overtime/department-trend?from&to` | `{rows[]}` | OT thực theo tháng × 7 nhóm |
| `GET /api/ot/spike-stats?from&to&dept` | IDepartmentSpikeStats | 7 cột spike + `maxDailyWorkers` + `peakDate` + `alert` |
| `GET /api/last-swipes?from&to` | `{rows[]}` | Snapshot quẹt cuối (tham khảo) |

Mọi query đều dùng **SQL tham số hoá** (chống SQL injection). `from/to` mặc định =
90 ngày gần nhất.

---

## 4. Quy tắc nghiệp vụ — port NGUYÊN XI từ UI (`src/lib/*`)

Toàn bộ ngưỡng được implement trong `src/rules/ot-alert.js` (đã port 1:1 từ
`ot-alert.ts`, `worker-ot-status.ts`, `actual-ot-status.ts`, `spike-stats.ts` của UI):

- **Cấp cảnh báo công nhân (theo ngày):** ratio = actual/plan → `normal` (≤ plan hoặc plan=0), `yellow` (<2×), `orange` (<2×..<3×), `red` (≥3×).
- **Trạng thái KPI Actual OT:** `yellow = A ≥ P + W×0.5×D`, `orange = A ≥ P + W×0.75×D`, `red = A > P + W×1×D` (W = tổng công nhân, D = số ngày). Backend trả `workerCount` + `searchDays` để UI dùng đúng công thức.
- **Spike công nhân:** OT thực **mỗi ngày mỗi người** (các phân đoạn cùng ngày CỘNG TRƯỚC khi so), ≥ 240 phút = red; 120–240 = pink; **không cộng dồn nhiều ngày**; không suy OT từ Igarment.
- **Biểu đồ spike phòng ban:** đếm worker-days ≥ 4h; chiều cao cột & màu theo **maxDailyWorkers** (ngày tệ nhất), ngưỡng `<5` xanh / `5–7` vàng / `8–10` cam / `>10` đỏ.

> ⚠️ Nguyên tắc nguồn: **mọi số và công thức lấy từ HR + T8**. Igarment (cột
> `scanTime`, thẻ IGM OT) chỉ hiển thị tham khảo, không ảnh hưởng cảnh báo.

---

## 5. Xử lý bảng "nóng" Igarment (`pytckreg`)

Bảng quẹt thẻ ghi liên tục theo từng công đoạn → **request không bao giờ đụng nó**.
Giải pháp đã làm trong `src/services/ig-snapshot.js`:

1. **Job định kỳ** (mặc định 30 phút) gộp `MAX(RegTime)` theo `(pyperson.IDNo, RegDate)`
   cho vài ngày gần nhất rồi **ghi vào bảng snapshot `ig_last_swipe`** (MySQL,
   tạo bằng `sql/snapshot.igarment.sql`) — 2 câu gộp, không phải 1 câu/người.
2. **Request chỉ SELECT trên `ig_last_swipe`** — bảng nhỏ, không bị lock, không treo
   hệ thống; nếu snapshot quá 30 phút thì refresh đúng khoảng ngày được hỏi.
3. Chỉ lấy giờ `HH:mm` — RegTime có ngày rác (`1899-12-30`) nên định dạng qua
   `TIME_FORMAT(RegTime, '%H:%i')` ngay trong câu INSERT.

Độ trễ cột quẹt cuối ≤ 30 phút (đã chốt với bạn). Khi dashboard có thể chấp nhận
trễ lâu hơn, chỉ cần tăng `SNAPSHOT_INTERVAL_MIN`.

---

## 6. Bảo mật

| Lớp | Hiện trạng |
| --- | --- |
| Chặn IP ngoài công ty | `ALLOW_CIDRS` kiểu CIDR — **cho cả dải** nên máy tính đổi IP (DHCP) vẫn truy cập được; máy ngoài công ty bị 403 |
| Rate limit | 300 req/phút/client (chống quét) |
| Audit log | Mỗi request ghi `logs/audit.log` (ip, đường, status, UA) — truy vết khi có sự cố |
| Quyền DB | Tài khoản **read-only** — **CHỈ SELECT trên VIEW** (`v_hr_*`, `v_t8_ot`) và bảng snapshot `ig_last_swipe`; KHÔNG cấp quyền bảng gốc (xem `sql/readonly-grant.example.sql`) |
| Không lộ dữ liệu nhạy cảm | Backend chỉ đọc: tên, mã, phòng ban, giờ OT. **KHÔNG** đọc lương, CCCD, SĐT |
| Key/password | Chỉ trong `.env` trên server, không bao giờ gửi xuống trình duyệt |
| HTTPS | Tùy chọn (`HTTPS_KEY`/`HTTPS_CERT`). Nội bộ chạy HTTP được, để sẵn khóa cho khi cần |

**IP allowlist là gì?** Không phải "liệt kê từng máy" — bạn khai báo **dải mạng**
(ví dụ toàn bộ công ty dùng `10.0.0.0/8`, hay riêng phân xưởng `172.18.0.0/16`).
Máy nào có IP nằm trong dải đều vào được, IP đổi vẫn vào được. Máy ngoài dải bị chặn.

---

## 7. Giả định cần bạn xác nhận khi nối DB thật

1. **Map phòng ban → 7 nhóm** (`src/rules/dept-groups.js`): dùng từ khoá trong tên
   phòng ban (vi/anh). Nếu phòng ban thực tế khác mẫu, sửa mảng `GROUP_KEYWORDS`.
2. **OT thực tế** = cột `otHours` trong view `v_hr_ot_daily` (đã tính sẵn
   `usualOvertimeH + sundayOvertimeH + holidayOvertimeH`); nếu `otHours = 0` mà
   `overtimeMinutes` (phút) > 0 thì lấy `overtimeMinutes / 60`.
3. **Người có đăng ký OT (T8) nhưng không có chấm công (HR)** vẫn hiện trên
   dashboard với `actualOtMinutes = 0` — để phát hiện đăng ký nhưng không làm.
4. **`scanTimeMinutes`** (bảng process) = Σ phút từ `SCAN_BASE_HOUR` đến lần quẹt
   cuối — **proxy tham khảo**, không phải số liệu Igarment chính thức.
5. **Audit log ghi file đơn giản** — nếu lưu lượng lớn, chuyển sang bảng DB/log hệ thống.

---

## 8. Cấu trúc mã

```
shiftcore/
├── server.js                 # serve UI + API + khởi động snapshot job
├── .env.example
├── package.json
├── src/
│   ├── config.js             # đọc .env
│   ├── rules/                # QUY TẮC NGHIỆP VỤ (port từ UI)
│   ├── db/                   # kết nối + query an toàn (hr/t8/ig)
│   ├── middleware/           # allowlist · rate-limit · audit
│   ├── services/             # hr.js, t8.js, ig-snapshot, dashboard (gộp 3 nguồn), demo
│   └── routes/api.js
├── public/                   # UI đã build (vào đây sau khi build)
├── ui-src/                   # source React của UI
├── sql/
│   ├── views.hr.sql                 # tạo VIEW HR (v_hr_ot_daily, v_hr_employee, v_hr_department)
│   ├── views.t8.sql                 # tạo VIEW T8 (v_t8_ot)
│   ├── snapshot.igarment.sql        # tạo BẢNG snapshot ig_last_swipe (không phải view)
│   └── readonly-grant.example.sql   # cấp quyền read-only — CHỈ trên view/snapshot
└── logs/                     # audit log
```
