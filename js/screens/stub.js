/* Разделы, которые ещё не построены: честная заглушка, а для настроек сведения о сборке. */
import { header, esc } from '../ui/dom.js';
import { monthLabel } from '../dates.js';
import { VERSION, channelName } from '../version.js';

const TITLES = { history: 'История', analytics: 'Аналитика' };

export function mountStub(root, ctx, route) {
  root.innerHTML = header(TITLES[route]) +
    `<div class="pad"><div class="card"><b>Раздел появится в следующей сборке.</b><p class="muted" style="margin:8px 0 0">Месяц, который вы выберете здесь, будет общим для истории и всех дашбордов. Сейчас выбран: ${esc(monthLabel(ctx.state.month))}.</p></div></div>`;
  return {};
}

export function mountSettings(root, ctx) {
  root.innerHTML = header('Настройки') +
    `<div class="pad"><div class="card"><dl class="kv">
      <dt>Сборка</dt><dd>${esc(VERSION)}</dd>
      <dt>Канал</dt><dd>${esc(channelName(location.pathname))}</dd>
      <dt>Категорий</dt><dd class="num">${ctx.categories.filter((c) => c.parentId === null).length}</dd>
      <dt>Расходов</dt><dd class="num">${ctx.expenses.length}</dd>
    </dl></div>
    <p class="muted small" style="margin:16px 4px 0">Данные хранятся только на этом устройстве. Экспорт, восстановление и управление категориями появятся в следующих сборках.</p></div>`;
  return {};
}
