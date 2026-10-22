// i18n setup (ticket 16).
//
// Swedish is the primary language (the source of truth), English is the
// translation. The language is stored in localStorage so the driver/worker PWA
// keeps it across reloads.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import sv from './locales/sv.json';
import en from './locales/en.json';

export const LANGUAGES = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
] as const;

export const LANGUAGE_KEY = 'avc_language';

export function getStoredLanguage(): string {
  if (typeof window === 'undefined') return 'sv';
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
  // A browser language we have a bundle for wins over the default.
  const browser = navigator.language?.slice(0, 2);
  if (browser && LANGUAGES.some((l) => l.code === browser)) return browser;
  return 'sv';
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = getStoredLanguage();
}

i18n.use(initReactI18next).init({
  resources: {
    sv: { translation: sv },
    en: { translation: en },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'sv',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

/** Switches the language and remembers it. */
export function setLanguage(code: string): void {
  if (!LANGUAGES.some((l) => l.code === code)) return;
  localStorage.setItem(LANGUAGE_KEY, code);
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
}

export default i18n;
