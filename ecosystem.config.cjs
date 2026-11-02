// =====================================================================
//  PM2 configuration — OT Dashboard (shiftcore)
//  Dùng:  pm2 start ecosystem.config.cjs
//         pm2 save            (lưu lại cấu hình)
//         pm2 startup         (tự khởi động sau khi máy reboot — làm 1 lần)
//  Log:  logs/pm2-out.log + logs/pm2-error.log (thư mục logs/ đã tồn tại)
// =====================================================================
module.exports = {
  apps: [
    {
      name: 'shiftcore-ot-dashboard',

      // Bắt buộc chạy từ thư mục gốc dự án: server.js và src/config.js
      // dùng import.meta.url / đường dẫn tương đối để tìm .env, cache/, public/.
      cwd: __dirname,
      script: 'server.js',

      // server.js là ES module (package.json "type": "module") — PM2 >= 5 chạy được.
      interpreter: 'node',

      // CHỈ 1 instance (fork). Lý do: server giữ cache nóng trong RAM và chạy
      // job đồng bộ SQL Server mỗi 30 phút — nếu chạy nhiều instance (cluster),
      // mỗi instance sẽ tự chạy job đồng bộ trùng lặp.
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,          // crash thì tự khởi động lại
      max_memory_restart: '600M', // vượt ~600MB RAM thì restart (cache 1 tháng ~vài trăm MB)
      restart_delay: 3000,        // chờ 3s trước khi restart
      kill_timeout: 5000,         // cho server thời gian đóng SQLite/conn

      watch: false,               // tắt watch — server là production, không tự restart theo file

      env: {
        NODE_ENV: 'production',
        PORT: 2403,
        // Mọi biến còn lại (DB_HR_*, DB_T8_*, HTTPS_KEY/CERT, ALLOW_CIDRS…) lấy từ file .env
        // trong thư mục dự án — server tự nạp bằng dotenv.
      },

      out_file: __dirname + '/logs/pm2-out.log',
      error_file: __dirname + '/logs/pm2-error.log',
      merge_logs: true,
      time: true, // ghi timestamp vào mỗi dòng log
    },
  ],
};
