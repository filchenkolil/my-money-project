/* Настройки: список разделов и сведения о сборке. */
import { header, esc } from '../ui/dom.js';
import { UI } from '../ui/icons.js';
import { VERSION, channelName } from '../version.js';
import { SCHEMA_VERSION } from '../migrations.js';
import { THEMES, getTheme, setTheme } from '../theme.js';
import { hashFor } from '../router.js';

const ROWS = [['categories', 'Категории и подкатегории'], ['backup', 'Экспорт и восстановление'], ['reset', 'Сброс всех данных']];

export function mountSettings(root, ctx) {
  const theme = getTheme();
  root.innerHTML = header('Настройки') + '<div class="pad"><div class="lbl" style="margin-top:4px">Оформление</div><div class="seg" role="group" aria-label="Тема оформления">' + THEMES.map(([id, name]) => `<button type="button" data-theme="${id}" aria-pressed="${id === theme}">${name}</button>`).join('') + '</div><div style="height:8px"></div>' +
    ROWS.map(([route, label]) => `<button type="button" class="setrow" data-route="${route}"><span class="sp">${label}</span><span class="ch">${UI.chevron}</span></button>`).join('') +
    `<dl class="kv" style="margin-top:24px"><dt>Версия</dt><dd>${esc(VERSION)}</dd><dt>Схема данных</dt><dd class="num">${SCHEMA_VERSION}</dd><dt>Канал</dt><dd>${esc(channelName(location.pathname))}</dd><dt>Категорий</dt><dd class="num">${ctx.categories.filter((c) => c.parentId === null).length}</dd><dt>Расходов</dt><dd class="num">${ctx.expenses.length}</dd></dl>` +
    '<p class="muted small" style="margin:16px 4px 0">Данные хранятся только на этом устройстве. Оформление «Как в системе» следует настройкам iPhone.</p></div>';
  root.onclick = (ev) => {
    const t = ev.target.closest('[data-theme]');
    if (t) { setTheme(t.dataset.theme); root.querySelectorAll('[data-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); return; }
    const b = ev.target.closest('[data-route]'); if (b) location.hash = hashFor(b.dataset.route);
  };
  return {};
}
