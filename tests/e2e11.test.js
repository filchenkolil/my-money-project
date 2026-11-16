/* Версия 1.1: «Регулярные», «Темп месяца», «Обсуждение AI». */
import { test, eq, ok } from './harness.js';
import { openApp, waitFor, sleep, today, monthsAgo } from './helpers.js';
import { regularView, paceView } from '../js/analytics.js';
import { buildSummary, normalizeLevel } from '../js/summary.js';

const mk = (date, amount, categoryId, extra = {}) => ({ id: date + categoryId + amount, date, amount, categoryId, subcategoryId: null, note: '', isRegular: false, ...extra });
const EXP = [
  mk('2026-10-05', 100000, 'edu', { isRegular: true }), mk('2026-10-10', 300000, 'prod', { note: 'закупка' }), mk('2026-10-20', 50000, 'sub', { isRegular: true, subcategoryId: 's1' }),
  mk('2026-11-02', 120000, 'edu', { isRegular: true }), mk('2026-11-10', 80000, 'prod'), mk('2026-11-15', 20000, 'sub', { isRegular: true, subcategoryId: 's1' }),
];
const KEYS = ['2026-10', '2026-11'];

test('регулярные: сумма, изменение, доля по месяцам, категории и подкатегории', () => {
  const v = regularView(EXP, KEYS, '2026-11');
  eq(v.cur, 140000); eq(v.prev, 150000); eq(v.delta.diff, -10000);
  eq(v.months.map((m) => m.pct), [33.3, 63.6]);
  eq(v.cats.map((c) => c.categoryId), ['edu', 'sub']);
  eq(v.cats[0].cur, 120000); eq(v.cats[0].prev, 100000); eq(v.cats[0].values, [100000, 120000]);
  eq(v.cats[1].subs, [{ id: 's1', cur: 20000, prev: 50000 }]);
  const none = regularView(EXP, KEYS, '2026-10');
  eq(none.hasPrev, false); eq(none.cur, 150000);
  eq(regularView([], [], '2026-11').cats, []);
});

test('темп месяца: накопление по дням, сравнение на тот же день, прогноз', () => {
  const p = paceView(EXP, '2026-11', '2026-11-16');
  eq(p.day, 16); eq(p.cur.length, 16); eq(p.cur[0], 0); eq(p.cur[1], 120000); eq(p.cur[15], 220000); eq(p.total, 220000);
  eq(p.prev.length, 31); eq(p.prevAtSame, 400000); eq(p.delta.diff, -180000);
  eq(p.running, true); eq(p.perDay, 13750); eq(p.projection, 412500);
  const done = paceView(EXP, '2026-10', '2026-11-16');
  eq(done.cur.length, 31); eq(done.running, false); eq(done.projection, null); eq(done.total, 450000);
  const fut = paceView(EXP, '2026-12', '2026-11-16');
  eq(fut.cur, []); eq(fut.total, 0);
});

test('темп месяца: расходы поездок попадают по дате расхода', () => {
  const td = { trips: [{ id: 't', currency: 'RUB', rateE4: 10000, start: '2026-11-03', end: '2026-11-05' }], tripExpenses: [{ id: 'x', tripId: 't', date: '2026-11-04', amount: 50000, isRub: true, categoryId: 'tc.oth' }] };
  const p = paceView(EXP, '2026-11', '2026-11-16', td);
  eq(p.total, 270000); eq(p.cur[2], 120000); eq(p.cur[3], 170000);
});

const DATA = { categories: [{ id: 'edu', name: 'Образование' }, { id: 'prod', name: 'Продукты' }, { id: 'sub', name: 'Подписки' }, { id: 's1', name: 'Claude' }], expenses: EXP, trips: [], tripExpenses: [], tripCategories: [] };

test('сводка для AI: инструкция, итоги, регулярные; состав зависит от уровня', () => {
  const t = buildSummary(DATA, 'totals', '2026-11-16');
  ok(t.startsWith('Ты мой финансовый помощник'), 'начинается с инструкции');
  ok(t.includes('Ноябрь 2026: 2 200 ₽'.replace(/ /g, ' ')) || /Ноябрь 2026: 2.200 ₽/.test(t), t);
  ok(t.includes('Подписки: ') && t.includes('Claude'), 'подкатегории');
  ok(t.includes('## Регулярные расходы') && t.includes('Образование'));
  ok(!t.includes('закупка') && !t.includes('2026-10-10'), 'в режиме итогов нет комментариев и строк');
  const n = buildSummary(DATA, 'notes', '2026-11-16');
  ok(n.includes('закупка') && !n.includes('2026-11-10'), 'комментарии без остальных строк');
  const all = buildSummary(DATA, 'all', '2026-11-16');
  ok(all.includes('2026-11-10') && all.includes('регулярный'));
  ok(buildSummary({ ...DATA, expenses: [] }, 'all').includes('Расходов пока нет'));
  eq(normalizeLevel('мусор'), 'totals');
});

const cur = () => today().slice(0, 7), prev = () => monthsAgo(-1).slice(0, 7);
const seed = async (s) => {
  const add = (date, amount, categoryId, extra = {}) => s.addExpense({ amount, date, categoryId, ...extra });
  await add(prev() + '-05', 200000, 'prod', { isRegular: true }); await add(prev() + '-06', 100000, 'gifts');
  await add(cur() + '-01', 300000, 'prod', { isRegular: true, note: 'абонемент' }); await add(cur() + '-01', 100000, 'gifts');
};

test('экран «Регулярные»: сумма, столбцы с долей, разворот категории', async () => {
  const a = await openApp({ seed, route: '#/analytics/regular' });
  try {
    await waitFor(() => a.q('.hero'), 'дашборд');
    eq(a.qa('.dchip').length, 6); eq(a.q('.dchip[aria-current]').textContent, 'Регулярные');
    ok(a.q('.hero .big').textContent.includes('3 000'), a.q('.hero .big').textContent);
    ok(a.q('.hero').textContent.includes('75%'), 'доля 3000 из 4000');
    ok(a.qa('.mcol').length >= 2 && a.q('.mcol[aria-pressed="true"] b').textContent.includes('75'), 'доля над столбцом');
    eq(a.qa('.legrow').length, 1);
    a.click(a.q('.legrow')); await waitFor(() => a.q('.subs'), 'подкатегории');
    ok(a.q('.subs').textContent.includes('Без подкатегории'));
    a.click(a.q('.legrow')); await sleep(60); ok(!a.q('.subs'), 'сворачивается');
  } finally { a.close(); }
});

test('экран «Темп месяца»: линия, легенда, прогноз', async () => {
  const a = await openApp({ seed, route: '#/analytics/pace' });
  try {
    await waitFor(() => a.q('svg.pace'), 'график');
    ok(a.q('.pace .lprev'), 'линия прошлого месяца'); ok(a.q('.pace .dotcur'), 'точка сегодняшнего дня');
    eq(a.qa('.legend span').length, 2);
    ok(a.q('.hero .big').textContent.includes('4 000'), a.q('.hero .big').textContent);
    ok(a.qa('.stat').length === 2);
  } finally { a.close(); }
});

test('«Обсуждение AI»: кнопка в шапке и строка в настройках, уровни, копирование и открытие', async () => {
  const a = await openApp({ seed, route: '#/analytics' });
  const calls = { copy: [], open: [] };
  try {
    await waitFor(() => a.q('[data-act="ai"]'), 'кнопка в шапке');
    a.win.__mymoneyAI = { copy: async (t) => { calls.copy.push(t); }, open: (u) => { calls.open.push(u); } };
    a.click(a.q('[data-act="ai"]')); await waitFor(() => a.h1() === 'Обсуждение AI', 'экран');
    eq(a.qa('.seg button').map((b) => b.textContent), ['Итоги', 'С комментариями', 'Все расходы']);
    eq(a.q('.seg [aria-pressed="true"]').textContent, 'Итоги');
    ok(!a.q('.preview').textContent.includes('абонемент'));
    a.click(a.qa('.seg button')[1]); await sleep(60);
    ok(a.q('.preview').textContent.includes('абонемент'), 'комментарии в предпросмотре');
    a.click(a.q('[data-act="open"]')); await waitFor(() => calls.copy.length === 1, 'копирование');
    eq(calls.open, ['https://claude.ai/new']); ok(calls.copy[0].includes('абонемент') && calls.copy[0].startsWith('Ты мой финансовый помощник'));
    await waitFor(() => a.q('#aistatus').textContent.includes('скопирована'), 'статус');
    a.click(a.q('[data-act="copy"]')); await waitFor(() => calls.copy.length === 2, 'второе копирование'); eq(calls.open.length, 1, 'только копирование не открывает Claude');
    a.win.__mymoneyAI = { copy: async () => { throw new Error('нет доступа'); }, open: () => {} };
    a.click(a.q('[data-act="copy"]')); await waitFor(() => a.q('#aistatus').textContent.includes('Не удалось'), 'ошибка копирования');
  } finally { try { localStorage.removeItem('mymoney.aiLevel'); } catch { /* нечего чистить */ } a.close(); }
  const b = await openApp({ seed, route: '#/settings' });
  try {
    await waitFor(() => b.q('.setrow'), 'настройки');
    ok(b.qa('.setrow')[0].textContent.includes('Обсуждение AI'));
    b.click(b.qa('.setrow')[0]); await waitFor(() => b.h1() === 'Обсуждение AI', 'из настроек');
  } finally { b.close(); }
});
