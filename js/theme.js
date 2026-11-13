/* Тема оформления: «Как в системе» (по умолчанию), «Светлая» или «Тёмная». Выбор хранится на этом телефоне (localStorage). */
export const THEMES = [['system', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']];
const KEY = 'mymoney.theme';

export const normalizeTheme = (v) => (THEMES.some((t) => t[0] === v) ? v : 'system');

/** Какая тема будет на экране: выбранная вручную или системная. */
export const effectiveTheme = (theme, systemDark) => (theme === 'light' || theme === 'dark' ? theme : systemDark ? 'dark' : 'light');

export function getTheme() {
  try { return normalizeTheme(localStorage.getItem(KEY)); } catch { return 'system'; }
}

/** Ставит тему на страницу; в браузерах, где память недоступна, выбор действует до закрытия приложения. */
export function applyTheme(theme, doc = document) {
  const t = normalizeTheme(theme), root = doc.documentElement;
  if (t === 'system') delete root.dataset.theme; else root.dataset.theme = t;
  const dark = effectiveTheme(t, !!doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches) === 'dark';
  doc.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#181818' : '#FFFFFF'));
  return t;
}

export function setTheme(theme) {
  const t = normalizeTheme(theme);
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* память недоступна: тема действует до закрытия */ }
  return applyTheme(t);
}
