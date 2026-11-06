/* Разделы, которые ещё не построены: честная заглушка, а для настроек сведения о сборке. */
import { header, esc } from '../ui/dom.js';
import { monthLabel } from '../dates.js';


const TITLES = { history: 'История', analytics: 'Аналитика' };

export function mountStub(root, ctx, route) {
  root.innerHTML = header(TITLES[route]) +
    `<div class="pad"><div class="card"><b>Раздел появится в следующей сборке.</b><p class="muted" style="margin:8px 0 0">Месяц, который вы выберете здесь, будет общим для истории и всех дашбордов. Сейчас выбран: ${esc(monthLabel(ctx.state.month))}.</p></div></div>`;
  return {};
}

