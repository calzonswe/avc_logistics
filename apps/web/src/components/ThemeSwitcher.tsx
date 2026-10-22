// Theme switcher — toggles dark mode class on <html>, persisted in localStorage.
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const THEME_KEY = 'avc_theme';

function getStoredTheme(): 'light' | 'dark' | 'system' {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', isDark);
    return;
  }
  root.classList.toggle('dark', theme === 'dark');
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light'))}
      title={theme === 'light' ? 'Byt till mörkt läge' : theme === 'dark' ? 'Byt till systeminställning' : 'Byt till ljust läge'}
      className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
      aria-label="Växla tema"
    >
      <Moon className="w-5 h-5" />
      <Sun className="w-5 h-5" />
      <span className="sr-only">
        {theme === 'light' ? 'Mörkt läge' : theme === 'dark' ? 'Systeminställning' : 'Ljust läge'}
      </span>
    </button>
  );
}
