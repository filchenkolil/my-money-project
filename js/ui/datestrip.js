/* Полоса дней: листается вправо и влево, по умолчанию видна неделя с выбранной датой.
   Диапазон: 2 месяца назад и вперёд от сегодняшнего дня (если выбрана более далёкая дата, полоса дотягивается до неё). */
import { stripRange, daysBetween, weekStart, monthKey, monthLabel } from '../dates.js';

const NAMES = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export function stripHTML(today, selected) {
  const { start, end } = stripRange(today, selected);
  const days = daysBetween(start, end).map((iso, i) =>
    `<button type="button" data-act="day" data-v="${iso}" aria-pressed="${iso === selected}"${iso === today ? ' data-today aria-label="Сегодня"' : ''}>${NAMES[i % 7]}<b class="num">${+iso.slice(8)}</b></button>`).join('');
  return `<div class="wkm" id="wkm">${monthLabel(monthKey(selected))}</div><div class="wk" id="wk" role="group" aria-label="Дата расхода">${days}</div>`;
}

/** После перерисовки: показать неделю выбранной даты и подписывать месяц по мере прокрутки. */
export function mountStrip(root, selected) {
  const strip = root.querySelector('#wk'), label = root.querySelector('#wkm');
  if (!strip) return;
  const btns = [...strip.children];
  const first = btns.findIndex((b) => b.dataset.v === weekStart(selected));
  if (first >= 0) strip.scrollLeft = btns[first].offsetLeft - strip.offsetLeft;
  let queued = false;
  strip.addEventListener('scroll', () => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const unit = btns.length > 1 ? btns[1].offsetLeft - btns[0].offsetLeft : 0;
      const col = unit ? Math.round(strip.scrollLeft / unit) : 0;
      const mid = btns[Math.min(btns.length - 1, col + 3)]; // четверг видимой недели определяет месяц
      if (mid) label.textContent = monthLabel(monthKey(mid.dataset.v));
    });
  }, { passive: true });
}
