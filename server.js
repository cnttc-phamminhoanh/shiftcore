import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import compression from 'compression';
import { config, demoEnabled } from './src/config.js';
import { allowlist } from './src/middleware/allowlist.js';
import { rateLimit } from './src/middleware/rate-limit.js';
import { auditMiddleware } from './src/middleware/audit.js';
import apiRouter from './src/routes/api.js';
import { startJob as startHrSnapshotJob } from './src/services/hr-snapshot.js';
import { startJob as startT8SnapshotJob } from './src/services/t8-snapshot.js';

const app = express();
app.disable('x-powered-by');
app.use(compression()); // nén gzip/br mọi response — records ~20MB → ~2.5MB
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));

// ----- Bảo mật cho mọi đường /api/* -----
app.use('/api', allowlist);
app.use('/api', rateLimit);
app.use('/api', auditMiddleware);
app.use('/api', apiRouter);

// ----- Stub runtime nền tảng cũ -----
// UI build từ miaoda còn gọi /spark/app/{appId}/runtime/api/v1/* (time-offset, metrics).
// Không có nền tảng đó → trả JSON rỗng, tránh SPA fallback trả index.html
// (gây lỗi "Unexpected token '<' is not valid JSON" trong console).
app.use('/spark', (req, res) => {
  if (String(req.path).includes('time-offset')) return res.json({ offset: 0 });
  return res.json({});
});

// ----- Serve UI tĩnh (đã build vào public/) -----
const publicDir = path.resolve(config.publicDir);
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  app.use(express.static(publicDir));
}

// Trang chủ: UI nếu có, ngược lại trang thông tin API.
app.get('/', (req, res) => {
  const index = path.join(publicDir, 'index.html');
  if (fs.existsSync(index)) {
    res.sendFile(index);
    return;
  }
  res
    .status(200)
    .type('html')
    .send(
      `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>OT Dashboard API</title></head>
<body style="font-family:sans-serif;padding:24px;max-width:760px;margin:auto">
<h2>OT Dashboard API — đang chạy ✓</h2>
<p>Chế độ: <b>${demoEnabled() ? 'DEMO (dữ liệu mẫu)' : 'REAL (3 database)'}</b></p>
<p>UI dashboard chưa được build vào <code>public/</code>. Xem hướng dẫn build trong <code>README.md</code> (mục "Build UI").</p>
<p>Kiểm tra API: <a href="/api/health">/api/health</a> · <a href="/api/departments">/api/departments</a></p>
<ul>
<li><code>/api/kpi?from=YYYY-MM-DD&to=YYYY-MM-DD</code></li>
<li><code>/api/overtime/daily?from=...&to=...</code></li>
<li><code>/api/overtime/records?from=...&to=...</code></li>
<li><code>/api/overtime/monthly?from=...&to=...</code></li>
<li><code>/api/overtime/department-trend?from=...&to=...</code></li>
<li><code>/api/ot/spike-stats?from=...&to=...</code></li>
</ul>
</body></html>`
    );
});

// SPA fallback: các route không phải API → trả về UI
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Không tìm thấy endpoint' });
    return;
  }
  const index = path.join(publicDir, 'index.html');
  if (fs.existsSync(index)) {
    res.sendFile(index);
    return;
  }
  res.status(404).type('text').send('Chưa build UI. Xem README.md.');
});

// ----- Khởi động -----
if (!demoEnabled()) {
  startHrSnapshotJob();
  startT8SnapshotJob();
}

function listen(server, label) {
  server.listen(config.port, () => {
    console.log('==========================================');
    console.log(` OT Dashboard API  ·  ${label}`);
    console.log(` Truy cập:  http://localhost:${config.port}/`);
    console.log(` Health:    http://localhost:${config.port}/api/health`);
    console.log(` Chế độ:    ${demoEnabled() ? 'DEMO (dữ liệu mẫu)' : 'REAL (HR + T8)'}`);
    console.log(` IP cho phép: ${config.allowCidrs.length ? config.allowCidrs.join(', ') : 'TẤT CẢ (không khuyến khích)'}`);
    console.log('==========================================');
  });
}

if (config.httpsKey && config.httpsCert && fs.existsSync(config.httpsKey) && fs.existsSync(config.httpsCert)) {
  const server = https.createServer(
    { key: fs.readFileSync(config.httpsKey), cert: fs.readFileSync(config.httpsCert) },
    app
  );
  listen(server, 'HTTPS');
} else {
  const server = http.createServer(app);
  listen(server, 'HTTP (nội bộ)');
}
