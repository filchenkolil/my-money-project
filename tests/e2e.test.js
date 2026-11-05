/* Сквозные проверки: настоящее приложение открывается во фрейме, дальше нажимаем и вводим как пользователь. */
import { test, eq, ok } from './harness.js';
import { openDb, deleteDb } from '../js/db.js';
import { MIGRATIONS } from '../js/migrations.js';
import { createStore } from '../js/store.js';

const DB = 'mymoney-beta'; // тестовый канал приложения (адрес /beta/) использует эту базу
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 4000) {
  const t0 = Date.now();
  for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('не дождались: ' + what); await sleep(30); }
}

async function withStore(fn) {
  const db = await openDb(DB, MIGRATIONS); const store = createStore(db);
  try { return await fn(store); } finally { db.close(); }
}

/** Чистая база, при необходимости с готовыми расходами, затем открытое приложение. */
async function openApp({ seed, height = 844, route = '' } = {}) {
  await deleteDb(DB);
  if (seed) await withStore(async (s) => { await s.seedDefaultsIfEmpty(); await seed(s); });
  const frame = document.createElement('iframe');
  frame.style.cssText = `width:390px;height:${height}px;border:1px solid #999;position:fixed;left:-2000px;top:0`;
  frame.src = '/beta/index.html' + route;
  document.body.append(frame);
  const win = frame.contentWindow;
  await new Promise((r) => frame.addEventListener('load', r, { once: true }));
  const doc = frame.contentDocument;
  await waitFor(() => doc.querySelector('.tabs button') , 'нижняя панель');
  const q = (s) => doc.querySelector(s), qa = (s) => [...doc.querySelectorAll(s)];
  const typeAmount = (v) => { const a = q('#amt'); a.value = v; a.dispatchEvent(new win.Event('input', { bubbles: true })); return a; };
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  const tile = (name) => qa('.tile:not(.more)').find((t) => t.textContent.trim() === name);
  return { win, doc, q, qa, typeAmount, click, tile, body: q('#body'), close: () => frame.remove() };
}
const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD по местному времени

test('экран: «Введите сумму», пример формата, 7 плиток и «Ещё», нижняя панель без подписи у «+»', async () => {
  const a = await openApp();
  try {
    const amt = a.q('#amt');
    eq([amt.placeholder, amt.getAttribute('inputmode')], ['Введите сумму', 'decimal']);
    ok(a.q('#hint').textContent.includes('1 500'));
    eq(a.qa('.tile:not(.more)').length, 7);
    ok(a.q('.tile.more').textContent.includes('Ещё 8'));
    eq(a.qa('.tabs button').length, 4); // 4 кнопки + пустое место: пятое место свободно
    eq(a.q('.fab').textContent.trim(), '', 'под «+» нет подписи');
    eq(a.q('.fab').getAttribute('aria-label'), 'Добавить расход');
    eq(a.qa('.wk button').length, 7);
    eq(a.q('.wk [aria-pressed="true"]').querySelector('b').textContent, String(+today().slice(8)));
  } finally { a.close(); }
});

test('сумма форматируется по ходу ввода', async () => {
  const a = await openApp();
  try {
    eq(a.typeAmount('1500').value, '1 500');
    eq(a.typeAmount('12500,5').value, '12 500,5');
  } finally { a.close(); }
});

test('неверная сумма: поле очищается, категория и комментарий остаются, понятное сообщение', async () => {
  const a = await openApp();
  try {
    a.click(a.tile('Питомец')); await sleep(50);
    a.click(a.q('[data-act="note"]')); a.q('#note').value = 'тест'; a.q('#note').dispatchEvent(new a.win.Event('input', { bubbles: true }));
    a.typeAmount('15оо'); a.click(a.q('#save'));
    await waitFor(() => a.q('#err'), 'сообщение об ошибке');
    ok(a.q('#err').textContent.includes('неверном формате'));
    eq(a.q('#amt').value, '');
    eq(a.tile('Питомец').getAttribute('aria-pressed'), 'true');
    eq(a.q('#note').value, 'тест');
    eq(await withStore((s) => s.allExpenses()).then((l) => l.length), 0);
  } finally { a.close(); }
});

test('без категории не сохраняется', async () => {
  const a = await openApp();
  try {
    a.typeAmount('100'); a.click(a.q('#save'));
    await waitFor(() => a.q('#err'), 'ошибка');
    eq(a.q('#err').textContent, 'Выберите категорию.');
    eq(a.q('#amt').value, '100');
  } finally { a.close(); }
});

test('сохранение: запись в копейках, ввод пачкой (дата остаётся, поля чистые), итог дня, «Отменить»', async () => {
  const a = await openApp();
  try {
    const mon = a.qa('.wk button')[0]; a.click(mon); const picked = a.q('.wk [aria-pressed="true"]').dataset.v;
    a.click(a.tile('Питомец')); await sleep(50);
    a.click(a.qa('[data-act="sub"]').find((b) => b.textContent === 'Корм'));
    a.click(a.q('[data-act="reg"]'));
    a.typeAmount('1 500,50'); a.click(a.q('#save'));
    await waitFor(() => a.q('.toast.show'), 'уведомление');
    ok(a.q('.toast').textContent.includes('Сохранено'));
    const rows = await withStore((s) => s.allExpenses());
    eq(rows.length, 1);
    eq([rows[0].amount, rows[0].date, rows[0].categoryId, rows[0].subcategoryId, rows[0].isRegular], [150050, picked, 'pet', 'pet.1', true]);
    eq(a.q('#amt').value, '');
    eq(a.qa('.tile[aria-pressed="true"]').length, 0, 'категория сброшена');
    eq(a.q('.wk [aria-pressed="true"]').dataset.v, picked, 'дата осталась');
    ok(a.q('.dateline').textContent.includes('1 расход') && a.q('.dateline').textContent.includes('1 500,50'));
    eq(a.q('[data-act="reg"]').getAttribute('aria-pressed'), 'false');
    // отмена
    a.click(a.q('[data-undo]'));
    await waitFor(() => !a.q('.dateline'), 'итог дня исчез');
    eq((await withStore((s) => s.allExpenses())).length, 0);
    ok(a.q('.toast').textContent.includes('отменён'));
  } finally { a.close(); }
});

test('частые категории сверху: у кого больше расходов за 60 дней', async () => {
  const d = today();
  const a = await openApp({ seed: async (s) => { for (let i = 0; i < 3; i++) await s.addExpense({ amount: 100, date: d, categoryId: 'gifts' }); await s.addExpense({ amount: 100, date: d, categoryId: 'edu' }); } });
  try {
    const names = a.qa('.tile:not(.more) .nm').map((n) => n.textContent);
    eq(names.slice(0, 2), ['Подарки', 'Образование']);
  } finally { a.close(); }
});

test('выбранная скрытая категория встаёт в последний слот, «Ещё» раскрывает все 15', async () => {
  const a = await openApp();
  try {
    a.click(a.q('.tile.more')); await sleep(30);
    eq(a.qa('.tile:not(.more)').length, 15);
    a.click(a.tile('Инвестиции')); await sleep(30);
    a.click(a.q('.tile.more')); await sleep(30);
    eq(a.qa('.tile:not(.more)').length, 7);
    eq(a.qa('.tile:not(.more)')[6].textContent.trim(), 'Инвестиции');
  } finally { a.close(); }
});

test('после выбора категории экран едет вниз, а не наверх к сумме', async () => {
  const a = await openApp({ height: 560 });
  try {
    a.typeAmount('300');
    a.body.scrollTop = 60; await sleep(50);
    const before = a.body.scrollTop;
    a.click(a.tile('Питомец'));
    await sleep(900);
    ok(a.body.scrollTop >= before, `прокрутка не вверх: было ${before}, стало ${a.body.scrollTop}`);
    const r = a.q('#subs').getBoundingClientRect();
    ok(r.top > 0 && r.bottom < 560, 'подкатегории в видимой области');
    // подкатегория → вниз к «Комментарию»
    const t1 = a.body.scrollTop;
    a.click(a.qa('[data-act="sub"]')[0]); await sleep(900);
    ok(a.body.scrollTop >= t1, 'после подкатегории тоже вниз');
  } finally { a.close(); }
});

test('новая подкатегория из формы: добавляется и выбирается; повтор названия отклоняется', async () => {
  const a = await openApp();
  try {
    a.click(a.tile('Питомец')); await sleep(30);
    a.click(a.q('[data-act="addsub"]')); await sleep(30);
    a.q('#newsub').value = 'Игрушки'; a.q('#newsub').dispatchEvent(new a.win.Event('input', { bubbles: true }));
    a.click(a.q('[data-act="addsubok"]'));
    await waitFor(() => a.qa('[data-act="sub"]').some((b) => b.textContent === 'Игрушки'), 'новая подкатегория');
    eq(a.qa('[data-act="sub"][aria-pressed="true"]').map((b) => b.textContent), ['Игрушки']);
    a.click(a.q('[data-act="addsub"]')); await sleep(30);
    a.q('#newsub').value = 'корм'; a.q('#newsub').dispatchEvent(new a.win.Event('input', { bubbles: true }));
    a.click(a.q('[data-act="addsubok"]'));
    await waitFor(() => a.q('.toast.show') && a.q('.toast').textContent.includes('уже есть'), 'отказ дубля');
  } finally { a.close(); }
});

test('разделы: переходы по нижней панели, «+» возвращает на главную с чистой формой', async () => {
  const a = await openApp();
  try {
    a.click(a.q('[data-route="history"]'));
    await waitFor(() => a.q('h1')?.textContent === 'История', 'История');
    eq(a.q('[aria-current="page"]').dataset.route, 'history');
    a.click(a.q('[data-route="settings"]'));
    await waitFor(() => a.q('h1')?.textContent === 'Настройки', 'Настройки');
    ok(a.q('.kv').textContent.includes('тестовый'));
    a.click(a.q('[data-route="add"]'));
    await waitFor(() => a.q('#amt'), 'главная');
    eq(a.q('.fab').getAttribute('aria-current'), 'page');
  } finally { a.close(); }
});

test('приложение не теряет данные после перезапуска страницы', async () => {
  const a = await openApp();
  try {
    a.click(a.tile('Продукты')); a.typeAmount('250'); a.click(a.q('#save'));
    await waitFor(() => a.q('.toast.show'), 'сохранено');
  } finally { a.close(); }
  const rows = await withStore((s) => s.allExpenses()); // база осталась после закрытия приложения
  eq(rows.map((r) => r.amount), [25000]);
  await deleteDb(DB);
});
