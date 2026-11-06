/* Настройки: список разделов и сведения о сборке. */
import { header, esc } from '../ui/dom.js';
import { UI } from '../ui/icons.js';
import { VERSION, channelName } from '../version.js';
import { SCHEMA_VERSION } from '../migrations.js';
import { hashFor } from '../router.js';

const ROWS = [['categories', 'Категории и подкатегории'], ['backup', 'Экспорт и восстановление'], ['reset', 'Сброс всех данных']];

export function mountSettings(root, ctx) {
  root.innerHTML = header('Настройки') + '<div class="pad">' +
    ROWS.map(([route, label]) => `<button type="button" class="setrow" data-route="${route}"><span class="sp">${label}</span><span class="ch">${UI.chevron}</span></button>`).join('') +
    `<dl class="kv" style="margin-top:24px"><dt>Версия</dt><dd>${esc(VERSION)}</dd><dt>Схема данных</dt><dd class="num">${SCHEMA_VERSION}</dd><dt>Канал</dt><dd>${esc(channelName(location.pathname))}</dd><dt>Категорий</dt><dd class="num">${ctx.categories.filter((c) => c.parentId === null).length}</dd><dt>Расходов</dt><dd class="num">${ctx.expenses.length}</dd></dl>` +
    '<p class="muted small" style="margin:16px 4px 0">Данные хранятся только на этом устройстве. Тёмная тема и размер шрифта берутся из настроек iPhone.</p></div>';
  root.onclick = (ev) => { const b = ev.target.closest('[data-route]'); if (b) location.hash = hashFor(b.dataset.route); };
  return {};
}
