import { test, eq, ok } from './harness.js';
import { newForm, expenseWord, tileList, checkForm, afterSave, FORM_ERRORS } from '../js/form.js';
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
