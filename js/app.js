/* Оболочка приложения: база, нижняя панель, разделы, общее состояние. */
import { openDb, dbNameFor } from './db.js';
import { MIGRATIONS } from './migrations.js';
import { createStore } from './store.js';
import { todayISO } from './dates.js';
import { createState } from './state.js';
import { routeFromHash, hashFor } from './router.js';
import { UI } from './ui/icons.js';
import { createToast, esc } from './ui/dom.js';
import { mountAdd } from './screens/add.js';
import { mountStub, mountSettings } from './screens/stub.js';

const TABS = [['analytics', 'Аналитика', UI.chart], ['history', 'История', UI.hist], ['add', 'Добавить расход', UI.plus], null, ['settings', 'Настройки', UI.gear]];

function tabsHTML(active) {
  return TABS.map((t) => {
    if (!t) return '<span aria-hidden="true"></span>'; // свободное место: 5 мест фиксированы, в v2 здесь «Поездки»
    const [route, label, svg] = t, cur = route === active ? ' aria-current="page"' : '';
    if (route === 'add') return `<button type="button" class="fab" data-route="add" aria-label="${label}"${cur}>${svg}</button>`;
    return `<button type="button" data-route="${route}"${cur}><span class="ic">${svg}</span><span class="tl">${label}</span></button>`;
  }).join('');
}

/** Когда открыта клавиатура, нижняя панель прячется, а высота экрана равна видимой части: «Сохранить» остаётся над клавиатурой. */
function watchKeyboard(app) {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const open = window.innerHeight - vv.height > 120;
    app.classList.toggle('kb', open);
    app.style.height = open ? vv.height + 'px' : '';
    if (open) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
}

async function boot() {
  const app = document.getElementById('app');
  const db = await openDb(dbNameFor(location.pathname), MIGRATIONS);
  const store = createStore(db);
  await store.seedDefaultsIfEmpty();
  app.innerHTML = '<main class="body" id="body"></main><nav class="tabs" id="tabs" aria-label="Разделы"></nav><div class="toast" id="toast" role="status"></div>';
  const body = app.querySelector('#body'), tabs = app.querySelector('#tabs');

  const ctx = {
    store, state: createState(todayISO()), categories: [], expenses: [],
    toast: createToast(app.querySelector('#toast')),
    async reload() { [this.categories, this.expenses] = await Promise.all([store.categories(), store.allExpenses()]); },
  };
  await ctx.reload();

  let current = null, route = null;
  function show() {
    route = routeFromHash(location.hash);
    tabs.innerHTML = tabsHTML(route);
    body.onclick = body.oninput = body.onchange = body.onkeydown = null;
    body.scrollTop = 0;
    current = route === 'add' ? mountAdd(body, ctx) : route === 'settings' ? mountSettings(body, ctx) : mountStub(body, ctx, route);
  }
  tabs.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-route]');
    if (!b) return;
    if (b.dataset.route === route) { show(); return; } // повторное нажатие на «+» даёт чистую форму
    location.hash = hashFor(b.dataset.route);
  });
  window.addEventListener('hashchange', show);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const prev = ctx.state.today; ctx.state.today = todayISO();
    current?.resume?.(prev);
  });
  watchKeyboard(app);
  show();
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="fatal"><h2>Не удалось открыть данные</h2><p class="muted">Закройте другие вкладки приложения и откройте его заново. Если не помогло, перезапустите телефон: данные при этом не пропадут.</p><p class="muted small">${esc(e?.message || e)}</p></div>`;
});
