/* Мелкие помощники для разметки. */
import { icon, UI } from './icons.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Цвет категории из оттенка палитры; насыщенность и яркость зависят от темы (см. --cs, --cl). */
export const hueColor = (hue) => `hsl(${hue ?? 200} var(--cs) var(--cl))`;

export const dotHTML = (cat) => `<span class="dot" style="background:${hueColor(cat.hue)}">${icon(cat.icon)}</span>`;

export const header = (title, right = '', back = false) => `<div class="hdr">${back ? '<button type="button" class="ib" data-act="back" aria-label="Назад">' + UI.back + '</button>' : ''}<h1${back ? ' class="sub"' : ''}>${esc(title)}</h1>${right}</div>`;

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Плавно прокручивает вниз к элементу. Фокус и клавиатуру не трогает. */
export function scrollToEl(root, selector) {
  const el = root.querySelector(selector);
  if (!el) return;
  try { el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch { el.scrollIntoView(); }
}

/** Уведомление внизу экрана. Одно на всё приложение. */
export function createToast(el) {
  let timer = 0, onUndo = null;
  el.addEventListener('click', (e) => { if (e.target.closest('[data-undo]') && onUndo) { const fn = onUndo; onUndo = null; el.classList.remove('show'); fn(); } });
  return function toast(message, undo) {
    onUndo = undo || null;
    el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button" data-undo>Отменить</button>' : ''}`;
    el.classList.toggle('act', !!undo);
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => { el.classList.remove('show'); onUndo = null; }, undo ? 5000 : 2300);
  };
}

/** Приложение запущено с экрана «Домой» (а не во вкладке Safari). Данные вкладки и значка хранятся раздельно. */
export const isStandalone = () => navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;

/** Напоминание установить приложение: пока записей нет и открыта вкладка Safari. */
export const installNotice = (hasData) => (hasData || isStandalone() ? '' :
  '<div class="notice" role="note"><b>Сначала установите приложение.</b><br>Нажмите «Поделиться» → «На экран „Домой“» и откройте MyMoney с иконки. Данные из Safari в установленное приложение не переносятся.</div>');

/** Нижняя карточка поверх экрана. Содержимое задаёт вызывающий код. */
export const sheetHTML = (inner) => `<div class="sheet" data-act="sheetbg"><div class="sheetbox" role="dialog" aria-modal="true">${inner}</div></div>`;
