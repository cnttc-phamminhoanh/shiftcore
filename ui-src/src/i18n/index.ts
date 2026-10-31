// EXPORTS: default (i18n instance), changeAppLanguage, SUPPORTED_LANGUAGES, AppLanguage
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import vi from './locales/vi.json';
import zhCN from './locales/zh-CN.json';

export const SUPPORTED_LANGUAGES = ['en', 'vi', 'zh-CN'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Lựa chọn ngôn ngữ được LƯU TRÌNH DUYỆT (localStorage): lần vào sau tự dùng
// ngôn ngữ đã chọn. Lần đầu chưa có lựa chọn → mặc định tiếng Trung.
const STORAGE_KEY = 'ot-dashboard-language';
const DEFAULT_LANGUAGE: AppLanguage = 'zh-CN';

function detectInitialLanguage(): AppLanguage {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) {
      return saved as AppLanguage;
    }
  } catch {
    /* chế độ riêng tư — bỏ qua */
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    vi: { translation: vi },
    'zh-CN': { translation: zhCN },
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes rendered text
});

// Chuyển ngôn ngữ tức thì + LƯU LẠI vào localStorage để lần sau vào dùng lại.
export function changeAppLanguage(language: AppLanguage): void {
  void i18n.changeLanguage(language);
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    /* bỏ qua nếu trình duyệt chặn storage */
  }
}

export default i18n;
