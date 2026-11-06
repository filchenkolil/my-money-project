/* Лента месяцев: общая для «Истории» и «Аналитики». Выбранный месяц хранится в общем состоянии приложения. */
import { monthShort, monthYear } from '../dates.js';

export function monthStripHTML(keys, selected) {
  return `<div class="mstrip" role="tablist" aria-label="Месяц">${keys.map((k) =>
    `<button type="button" class="mchip" role="tab" data-act="month" data-v="${k}"${k === selected ? ' aria-current="true"' : ''}>${monthYear(k)}<b>${monthShort(k)}</b></button>`).join('')}</div>`;
}

/** Подвести выбранный месяц в видимую часть ленты (после перерисовки). */
export function centerSelected(root, selector = '.mchip[aria-current], .mcol[aria-pressed="true"]') {
  const cur = root.querySelector(selector), strip = cur?.parentElement;
  if (cur && strip) strip.scrollLeft = Math.max(0, cur.offsetLeft - strip.clientWidth / 2 + cur.offsetWidth / 2);
}
