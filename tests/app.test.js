import { test, eq, ok } from './harness.js';
import { newForm, expenseWord, tileList, checkForm, afterSave, FORM_ERRORS } from '../js/form.js';
import { formatRub } from '../js/money.js';
import { routeFromHash, hashFor } from '../js/router.js';
import { createState } from '../js/state.js';

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

test('плитки: свёрнуто семь, остальные под «Ещё N»', () => {
  eq(tileList(IDS, null, false), { ids: IDS.slice(0, 7), hidden: 3 });
  eq(tileList(IDS, null, true), { ids: IDS, hidden: 0 });
});

test('плитки: выбранная категория из скрытых занимает последнее место', () => {
  eq(tileList(IDS, 'i', false), { ids: ['a', 'b', 'c', 'd', 'e', 'f', 'i'], hidden: 3 });
  eq(tileList(IDS, 'b', false).ids, IDS.slice(0, 7));
  eq(tileList(['a', 'b'], 'b', false), { ids: ['a', 'b'], hidden: 0 });
});

test('склонение «расход»', () => {
  eq([1, 2, 4, 5, 11, 12, 21, 22, 25, 101, 111].map(expenseWord),
    ['1 расход', '2 расхода', '4 расхода', '5 расходов', '11 расходов', '12 расходов', '21 расход', '22 расхода', '25 расходов', '101 расход', '111 расходов']);
});

test('форма: категория проверяется раньше суммы', () => {
  const f = { ...newForm('2026-11-05'), amount: '15оо' };
  eq(checkForm(f), { ok: false, field: 'category', message: FORM_ERRORS.category });
  f.categoryId = 'prod';
  eq(checkForm(f).field, 'amount');
  eq(checkForm(f).message, FORM_ERRORS.format);
  eq(checkForm({ ...f, amount: '0' }).message, FORM_ERRORS.zero);
  eq(checkForm({ ...f, amount: '10 000 001' }).message, FORM_ERRORS.too_big);
});

test('форма: верные данные превращаются в расход в копейках', () => {
  const r = checkForm({ ...newForm('2026-11-05'), amount: '1 500,50', categoryId: 'pet', subcategoryId: 'pet.1', note: '  корм ', isRegular: true });
  eq(r, { ok: true, expense: { amount: 150050, date: '2026-11-05', categoryId: 'pet', subcategoryId: 'pet.1', note: 'корм', isRegular: true } });
  eq(checkForm({ ...newForm('2026-11-05'), amount: '5', categoryId: 'prod' }).expense.subcategoryId, null);
});

test('после сохранения остаётся только дата', () => {
  const f = { ...newForm('2026-11-03'), amount: '5', categoryId: 'prod', note: 'x', showNote: true, isRegular: true, expanded: true };
  eq(afterSave(f), newForm('2026-11-03'));
});

test('адрес: известные разделы и запасной вариант', () => {
  eq(['#/history', '#/analytics', '#/settings', '#/add'].map(routeFromHash), ['history', 'analytics', 'settings', 'add']);
  eq(['', '#', '#/', '#/nope', null, undefined, '#/history?x=1'].map(routeFromHash), ['add', 'add', 'add', 'add', 'add', 'add', 'history']);
  eq(hashFor('history'), '#/history');
});

test('выбранный месяц общий: меняется в одном месте, виден всем', () => {
  const s = createState('2026-11-05'), seen = [];
  eq(s.month, '2026-11'); eq(s.currentMonth, '2026-11');
  const off = s.subscribe((w) => seen.push(w + ':' + s.month));
  s.shiftMonth(-1); s.shiftMonth(-1); s.setMonth('2026-09'); // последнее значение уже выбрано: сигнала нет
  eq(seen, ['month:2026-10', 'month:2026-09']);
  off(); s.shiftMonth(1);
  eq(seen.length, 2);
  eq(s.month, '2026-10');
  ok(s.currentMonth === '2026-11');
});

/* ---------- этап 4: календарь, история, правка ---------- */
import { shiftMonthsISO, weekStart, stripRange, daysBetween } from '../js/dates.js';
import { selectMonth, groupByDay, monthStripKeys, filtersActive, NO_FILTERS } from '../js/history.js';
import { expenseToForm, diffExpense } from '../js/form.js';
import { routeParam, tabFor } from '../js/router.js';

test('календарь: сдвиг на месяцы с коротким месяцем и переходом года', () => {
  eq(shiftMonthsISO('2026-11-05', -2), '2026-09-05');
  eq(shiftMonthsISO('2026-11-05', 2), '2027-01-05');
  eq(shiftMonthsISO('2026-03-31', -1), '2026-02-28');
  eq(shiftMonthsISO('2028-03-31', -1), '2028-02-29');
  eq(shiftMonthsISO('2026-12-31', 2), '2027-02-28');
});

test('календарь: полоса дней на 2 месяца назад и вперёд, целыми неделями', () => {
  const r = stripRange('2026-11-05');
  eq([r.start, r.end], ['2026-08-31', '2027-01-10']); // 5 сентября (сб) → понедельник 31 августа; 5 января (вт) → воскресенье 10 января
  eq(weekStart(r.start), r.start);
  eq(daysBetween(r.start, r.end).length % 7, 0);
  ok(daysBetween(r.start, r.end).includes('2026-11-05'));
  const old = stripRange('2026-11-05', '2026-03-10'); // правка старой записи: полоса дотягивается до неё
  eq(old.start, '2026-03-09');
  eq(stripRange('2026-11-05', '2027-06-01').end, '2027-06-06');
});

const X = (id, date, amount, categoryId, extra = {}) => ({ id, date, amount, categoryId, subcategoryId: null, isRegular: false, note: '', createdAt: +id.slice(1), ...extra });
const L = [X('a1', '2026-10-05', 100, 'prod'), X('a2', '2026-10-05', 200, 'pet', { subcategoryId: 'pet.1', isRegular: true }), X('a3', '2026-10-20', 300, 'prod'), X('a4', '2026-11-01', 400, 'prod')];

test('история: месяц, фильтры, порядок «новые сверху», группы по дням с итогом', () => {
  eq(selectMonth(L, '2026-10').map((e) => e.id), ['a3', 'a2', 'a1']);
  eq(selectMonth(L, '2026-10', { ...NO_FILTERS, categoryId: 'prod' }).map((e) => e.id), ['a3', 'a1']);
  eq(selectMonth(L, '2026-10', { ...NO_FILTERS, categoryId: 'pet', subcategoryId: 'pet.1' }).map((e) => e.id), ['a2']);
  eq(selectMonth(L, '2026-10', { ...NO_FILTERS, regularOnly: true }).map((e) => e.id), ['a2']);
  eq(selectMonth(L, '2026-09'), []);
  eq(groupByDay(selectMonth(L, '2026-10')).map((g) => [g.date, g.total, g.items.length]), [['2026-10-20', 300, 1], ['2026-10-05', 300, 2]]);
  ok(!filtersActive(NO_FILTERS)); ok(filtersActive({ ...NO_FILTERS, regularOnly: true }));
});

test('лента месяцев без пропусков, всегда содержит текущий', () => {
  eq(monthStripKeys([], '2026-11-05'), ['2026-11']);
  eq(monthStripKeys(L, '2026-12-02'), ['2026-10', '2026-11', '2026-12']);
  eq(monthStripKeys([X('b1', '2027-01-15', 1, 'prod')], '2026-11-05'), ['2026-11', '2026-12', '2027-01']);
  eq(monthStripKeys([X('b2', '2026-06-15', 1, 'prod')], '2026-11-05').length, 6);
});

test('правка: форма из расхода и список изменений «было → стало»', () => {
  const e = X('c1', '2026-10-05', 150050, 'pet', { subcategoryId: 'pet.1', note: 'корм', isRegular: true });
  const f = expenseToForm(e);
  eq([f.amount, f.categoryId, f.subcategoryId, f.note, f.showNote, f.isRegular, f.date], ['1 500,50', 'pet', 'pet.1', 'корм', true, true, '2026-10-05']);
  const names = (id) => ({ pet: 'Питомец', 'pet.1': 'Корм', prod: 'Продукты' }[id]);
  eq(diffExpense(e, { amount: 150050, date: '2026-10-05', categoryId: 'pet', subcategoryId: 'pet.1', note: 'корм', isRegular: true }, names), []);
  eq(diffExpense(e, { amount: 99900, date: '2026-10-06', categoryId: 'prod', subcategoryId: null, note: '', isRegular: false }, names).map((d) => [d.label, d.from, d.to]), [
    ['Категория', 'Питомец', 'Продукты'], ['Подкатегория', 'Корм', 'нет'], ['Сумма', formatRub(150050), formatRub(99900)], ['Комментарий', 'корм', 'нет'], ['Дата', '5 октября', '6 октября'], ['Регулярный', 'да', 'нет']]);
});

test('адрес правки: параметр и подсвеченная вкладка', () => {
  eq(routeFromHash('#/edit/abc'), 'edit'); eq(routeParam('#/edit/abc'), 'abc'); eq(routeParam('#/history'), null);
  eq(hashFor('edit', 'a b'), '#/edit/a%20b'); eq(routeParam(hashFor('edit', 'a b')), 'a b');
  eq([tabFor('edit'), tabFor('add')], ['history', 'add']);
});
