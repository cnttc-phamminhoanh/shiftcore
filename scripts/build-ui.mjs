// ============================================================
// build-ui.mjs — MỘT LỆNH build UI thuần (không preset cloud):
//   1) cd ui-src → npm install --ignore-scripts
//   2) npx vite build
//   3) copy dist/ đè vào ../public/
// Dùng: npm run build:ui   (Windows không có rm -rf / cp nên gói trong node)
// ============================================================
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const uiSrc = path.join(root, 'ui-src');
const publicDir = path.join(root, 'public');

function sh(cmd, cwd) {
  console.log('> ' + cmd + '   (' + cwd + ')');
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

// 1) Dependencies
if (!fs.existsSync(path.join(uiSrc, 'node_modules'))) {
  sh('npm install --ignore-scripts', uiSrc);
} else {
  console.log('(bỏ qua npm install — node_modules đã có)');
}

// 2) Build
sh('npx vite build', uiSrc);

// 3) Copy đè public/ — chỉ d public cũ SAU KHI build thành công
const distDir = path.join(uiSrc, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('Không tìm thấy dist/index.html — build thất bại, public/ cũ được giữ nguyên.');
  process.exit(1);
}
fs.rmSync(publicDir, { recursive: true, force: true });
fs.cpSync(distDir, publicDir, { recursive: true });
