/* Сквозные проверки после этапа 8: правки по замечаниям с телефона, ошибки, найденные код-ревью, и общее качество. */
import { test, eq, ok, note } from './harness.js';
import { openApp, withStore, waitFor, sleep, today } from './helpers.js';
import { uid } from '../js/store.js';

const focusIn = (a, el) => el.dispatchEvent(new a.win.FocusEvent('focusin', { bubbles: true }));
const focusOut = (a, el) => el.dispatchEvent(new a.win.FocusEvent('focusout', { bubbles: true }));
const shown = (a, sel) => { const el = a.q(sel); return !!el && a.win.getComputedStyle(el).display !== 'none'; };

/* ---------- замечания с телефона ---------- */

test('после «Сохранить» экран возвращается наверх сразу и остаётся там (даже если клавиатура закрывалась)', async () => {
  const a = await openApp({ height: 520 });
  try {
    a.click(a.tile('Питомец')); await sleep(900);
    a.click(a.qa('[data-act="sub"]')[0]); await sleep(900);
    const body = a.q('#body');
    body.scrollTop = body.scrollHeight; await sleep(60);
    ok(body.scrollTop > 100, 'экран прокручен вниз: ' + body.scrollTop);
    a.typeAmount('250'); a.click(a.q('#save'));
    await waitFor(() => a.q('.toast.show'), 'сохранено');
    eq(body.scrollTop, 0, 'сразу наверху');
    a.win.dispatchEvent(new a.win.Event('resize')); // iPhone меняет размер экрана, когда прячет клавиатуру
    await sleep(900);
    eq(body.scrollTop, 0, 'и через секунду тоже');
    ok(a.doc.activeElement?.id !== 'amt', 'клавиатура сама не открывается');
    eq(a.q('#amt').value, '');
  } finally { a.close(); }
});

test('ввод суммы и комментария: нижняя панель и «Сохранить» скрыты, после ввода возвращаются', async () => {
  const a = await openApp();
  try {
    ok(shown(a, '.tabs') && shown(a, '.savebar'), 'до ввода обе панели видны');
    const amt = a.q('#amt'); amt.focus(); focusIn(a, amt);
    ok(a.q('#app').classList.contains('typing'));
    ok(!shown(a, '.tabs'), 'нижняя панель скрыта'); ok(!shown(a, '.savebar'), '«Сохранить» скрыта');
    amt.blur(); focusOut(a, amt); await sleep(250);
    ok(shown(a, '.tabs') && shown(a, '.savebar'), 'после ввода панели вернулись');
    a.click(a.q('[data-act="note"]')); await sleep(30);
    const note = a.q('#note'); note.focus(); focusIn(a, note);
    ok(!shown(a, '.tabs') && !shown(a, '.savebar'), 'при вводе комментария то же самое');
    note.blur(); focusOut(a, note); await sleep(250);
    ok(shown(a, '.tabs') && shown(a, '.savebar'));
  } finally { a.close(); }
});

test('переход фокуса между полями не мигает панелями; поле даты и списки панели не прячут', async () => {
  const a = await openApp({ route: '#/history' });
  try {
    await a.go('#/add', () => a.q('#amt'));
    a.click(a.q('[data-act="note"]')); await sleep(30);
    const amt = a.q('#amt'), note = a.q('#note');
    focusIn(a, amt); focusOut(a, amt); focusIn(a, note); await sleep(250);
    ok(a.q('#app').classList.contains('typing'), 'фокус перешёл в другое поле: режим ввода сохранился');
    note.blur(); focusOut(a, note); await sleep(250); ok(!a.q("#app").classList.contains("typing"));
    focusIn(a, a.q('#date')); await sleep(30);
    ok(!a.q('#app').classList.contains('typing'), 'календарь панели не прячет');
  } finally { a.close(); }
});

test('кнопка «Ввод» на клавиатуре убирает фокус из суммы и комментария', async () => {
  const a = await openApp();
  try {
    const amt = a.q('#amt'); amt.focus();
    amt.dispatchEvent(new a.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    ok(a.doc.activeElement !== amt, 'фокус снят с суммы');
    a.click(a.q('[data-act="note"]')); await sleep(30);
    const note = a.q('#note'); note.focus();
    note.dispatchEvent(new a.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    ok(a.doc.activeElement !== note, 'фокус снят с комментария');
  } finally { a.close(); }
});

/* ---------- найденное код-ревью ---------- */

test('двойное нажатие «Сохранить» создаёт одну запись, а не две', async () => {
  const a = await openApp();
  try {
    a.click(a.tile('Продукты')); a.typeAmount('100');
    const save = a.q('#save'); a.click(save); a.click(save); a.click(save);
    await waitFor(() => a.q('.toast.show'), 'сохранено'); await sleep(200);
    eq((await withStore((s) => s.allExpenses())).length, 1);
  } finally { a.close(); }
});

test('«Отменить» после ухода с главного экрана удаляет запись и не рисует форму поверх другого экрана', async () => {
  const a = await openApp();
  try {
    a.click(a.tile('Продукты')); a.typeAmount('100'); a.click(a.q('#save'));
    await waitFor(() => a.q('.toast.show [data-undo]'), 'кнопка отмены');
    await a.go('#/settings', () => a.h1() === 'Настройки');
    a.click(a.q('[data-undo]')); await sleep(300);
    eq((await withStore((s) => s.allExpenses())).length, 0, 'запись отменена');
    eq(a.h1(), 'Настройки', 'экран настроек не перерисован формой');
  } finally { a.close(); }
});

test('быстрое переключение разделов: поздний ответ базы не перетирает открытый экран', async () => {
  const a = await openApp({ seed: async (s) => { await s.addExpense({ amount: 100, date: today(), categoryId: 'prod' }); } });
  try {
    a.win.location.hash = '#/history'; a.win.location.hash = '#/settings';
    await sleep(500);
    eq(a.h1(), 'Настройки');
    a.win.location.hash = '#/backup'; a.win.location.hash = '#/categories';
    await sleep(500);
    eq(a.h1(), 'Категории');
  } finally { a.close(); }
});

test('«Категория во времени»: выбранная подкатегория удалена, дашборд не падает', async () => {
  const a = await openApp({ seed: async (s) => { await s.addExpense({ amount: 10000, date: today(), categoryId: 'pet', subcategoryId: 'pet.1' }); }, route: '#/analytics/category' });
  try {
    await waitFor(() => a.q('#dcat'), 'дашборд');
    a.change(a.q('#dcat'), 's:pet:pet.1'); await sleep(60);
    ok(a.q('.hero').textContent.includes('Питомец › Корм'));
    await a.go('#/catdel/pet.1', () => a.q('#moveall'));
    a.change(a.q('#moveall'), 'pet|pet.2'); await sleep(60);
    a.click(a.q('[data-act="delete"]')); await waitFor(() => a.q('.sheet'), 'подтверждение');
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.h1() === 'Категории', 'список');
    await a.go('#/analytics/category', () => a.q('#dcat'));
    ok(!a.q('#dcat').value.includes('pet.1'), 'выбор сброшен на существующую категорию: ' + a.q('#dcat').value);
    ok(a.q('.hero') || a.q('.empty'));
  } finally { a.close(); }
});

/* ---------- общее качество ---------- */

const SCREENS = ['#/add', '#/history', '#/analytics', '#/analytics/compare', '#/analytics/category', '#/settings', '#/categories', '#/catedit/prod', '#/catdel/pet', '#/backup', '#/reset', '#/edit/'];
const seedSome = async (s) => {
  const d = today(); const cats = ['prod', 'trans', 'pet', 'gifts', 'rest'];
  for (let i = 0; i < 12; i++) await s.addExpense({ amount: 10000 + i * 777, date: d.slice(0, 8) + '01', categoryId: cats[i % 5], note: 'проверка длинного комментария, который должен переноситься на следующую строку и не ломать экран' });
};

async function visitAll(a, fn) {
  const first = (await withStore((s) => s.allExpenses()))[0];
  for (const r of SCREENS) {
    const hash = r === '#/edit/' ? '#/edit/' + encodeURIComponent(first.id) : r;
    a.win.location.hash = hash; await sleep(250);
    await fn(r, a);
  }
}

test('ни один экран не вылезает за ширину 390 px по горизонтали', async () => {
  const a = await openApp({ seed: seedSome });
  try {
    const bad = [];
    await visitAll(a, (r) => {
      const de = a.doc.documentElement, body = a.q('#body');
      if (de.scrollWidth > 391 || body.scrollWidth > body.clientWidth + 1) bad.push(`${r}: страница ${de.scrollWidth}, область ${body.scrollWidth}/${body.clientWidth}`);
      for (const el of a.qa('#body *')) {
        if (el.closest('.wk, .mscroll, .mstrip, .dstrip, svg')) continue;
        const rc = el.getBoundingClientRect();
        if (rc.width && rc.right > 391.5) { bad.push(`${r}: ${el.tagName}.${el.className} уходит вправо до ${Math.round(rc.right)}`); break; }
      }
    });
    eq(bad, []);
  } finally { a.close(); }
});

test('зоны нажатия не меньше 44 × 44 px на всех экранах (переключатели расширены невидимой зоной)', async () => {
  const a = await openApp({ seed: seedSome });
  try {
    const bad = new Set();
    await visitAll(a, (r) => {
      for (const el of a.qa('button, select, input:not([type=hidden]):not(.dpick), label.ib, label.btn')) {
        if (el.matches('.tog, [hidden]') || el.closest('[hidden]')) continue;
        const rc = el.getBoundingClientRect();
        if (rc.width < 1 || rc.height < 1) continue;
        if (rc.width < 43.5 || rc.height < 43.5) bad.add(`${r}: ${el.tagName}.${el.className} ${Math.round(rc.width)}×${Math.round(rc.height)} «${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 20)}»`);
      }
    });
    eq([...bad], []);
  } finally { a.close(); }
});

test('у каждой кнопки и поля есть название для VoiceOver; язык страницы русский', async () => {
  const a = await openApp({ seed: seedSome });
  try {
    eq(a.doc.documentElement.lang, 'ru');
    const bad = new Set();
    await visitAll(a, (r) => {
      for (const el of a.qa('button, input:not([type=hidden]), select')) {
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim();
        const labelled = el.closest('label')?.textContent.trim();
        if (!name && !labelled) bad.add(`${r}: ${el.tagName}.${el.className}`);
      }
      for (const svg of a.qa('svg')) if (svg.getAttribute('aria-hidden') !== 'true' && !svg.getAttribute('role') && !svg.getAttribute('aria-label')) bad.add(`${r}: svg без подписи`);
    });
    eq([...bad], []);
  } finally { a.close(); }
});

test('нет запросов в интернет: все файлы с одного адреса, ни аналитики, ни внешних шрифтов', async () => {
  const a = await openApp({ seed: seedSome });
  try {
    await visitAll(a, () => {});
    const foreign = a.win.performance.getEntriesByType('resource').map((e) => e.name).filter((n) => !n.startsWith(a.win.location.origin));
    eq(foreign, []);
    ok(!/https?:\/\/(?!localhost)/.test(await (await fetch('/beta/index.html')).text().then((t) => t.replace(/xmlns="[^"]*"/g, ''))), 'во входной странице нет внешних адресов');
  } finally { a.close(); }
});

test('5 000 записей: история и аналитика открываются быстрее секунды', async () => {
  const cats = ['prod', 'trans', 'pet', 'gifts', 'rest', 'home', 'cloth', 'health', 'fun', 'subs'];
  const a = await openApp({ seed: async (s) => {
    const base = new Date(); const expenses = [];
    for (let i = 0; i < 5000; i++) { const d = new Date(base); d.setDate(d.getDate() - (i % 330)); expenses.push({ id: uid(), amount: 5000 + (i % 97) * 130, date: d.toLocaleDateString('sv'), categoryId: cats[i % cats.length], subcategoryId: null, note: i % 7 ? '' : 'заметка', isRegular: i % 11 === 0, createdAt: i }); }
    await s.applyRestore({ expenses });
  } });
  try {
    const timed = async (hash, ready) => { const t0 = performance.now(); a.win.location.hash = hash; await waitFor(ready, hash, 5000); return performance.now() - t0; };
    const hist = await timed('#/history', () => a.q('.rec'));
    const over = await timed('#/analytics', () => a.q('.donut'));
    const cmp = await timed('#/analytics/compare', () => a.q('.tbl'));
    const cat = await timed('#/analytics/category', () => a.q('#dcat'));
    const add = await timed('#/add', () => a.q('#amt'));
    note(`5000 записей: история ${Math.round(hist)} мс, обзор ${Math.round(over)}, сравнение ${Math.round(cmp)}, категория ${Math.round(cat)}, главная ${Math.round(add)}`);
    ok(hist < 1000 && over < 1000 && cmp < 1000 && cat < 1000 && add < 1000, `история ${Math.round(hist)} мс, обзор ${Math.round(over)}, сравнение ${Math.round(cmp)}, категория ${Math.round(cat)}, главная ${Math.round(add)}`);
    eq((await withStore((s) => s.allExpenses())).length, 5000);
  } finally { a.close(); }
});
