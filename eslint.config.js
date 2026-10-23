// ESLint flat config — dự án OT Dashboard (backend Node.js)
// Dùng: npm run lint (kiểm tra) · npm run lint:fix (tự sửa)
import js from '@eslint/js';
import globals from 'globals';

export default [
  // Bỏ qua thư mục không lint
  {
    ignores: [
      'node_modules/**',
      'public/**',
      'dist/**',
      'logs/**',
      'cache/**',
      'ui-src/**',
      'ui-integration/**',
    ],
  },
  // Quy tắc khuyến nghị của ESLint
  js.configs.recommended,
  // Cấu hình cho file JS của backend (gồm cả .mjs)
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Biến/tham số thừa: cảnh báo (không báo đỏ) — cho phép tiền tố _ bỏ qua
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // console.log được phép (server Node nội bộ)
      'no-console': 'off',
      // Chấm phẩy bắt buộc — đồng nhất team
      semi: ['warn', 'always'],
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
];
