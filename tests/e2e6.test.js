/* Сквозные проверки этапа 6: аналитика. */
import { test, eq, ok } from './harness.js';
import { openApp, waitFor, sleep, today, monthsAgo } from './helpers.js';

const cur = () => today().slice(0, 7), prev = () => monthsAgo(-1).slice(0, 7);
const seed = async (s) => {
  const add = (date, amount, categoryId, extra = {}) => s.addExpense({ amount, date, categoryId, ...extra });
  await add(prev() + '-10', 100000, 'prod'); await add(prev() + '-12', 50000, 'pet', { subcategoryId: 'pet.1' });
  await add(cur() + '-01', 300000, 'prod', { note: 'большая закупка' }); await add(cur() + '-01', 150000, 'pet', { subcategoryId: 'pet.1' });
  await add(cur() + '-01', 50000, 'pet'); await add(cur() + '-01', 100000, 'gifts');
};

test('аналитика без данных: пустое состояние с кнопкой', async () => {
  const a = await openApp({ route: '#/analytics' });
  try {
    await waitFor(() => a.q('.empty'), 'пусто');
    ok(a.q('.empty').textContent.includes('Расходов пока нет'));
    a.click(a.q('[data-act="addfirst"]')); await waitFor(() => a.q('#amt'), 'главная');
  } finally { a.close(); }
});

test('обзор: итог месяца, идущий месяц, изменение к прошлому, диаграмма и категории по убыванию', async () => {
  const a = await openApp({ seed, route: '#/analytics' });
  try {
    await waitFor(() => a.q('.hero'), 'обзор');
    ok(a.q('.hero .big').textContent.includes('6 000'), a.q('.hero .big').textContent);
    ok(a.q('.hero').textContent.includes('Месяц идёт'), 'пометка идущего месяца');
    ok(a.q('.dl').textContent.includes('не закончен'), 'изменение серое, пока месяц не закончен');
    ok(a.q('.dl').classList.contains('muted'));
    ok(a.q('svg.donut'), 'диаграмма');
    eq(a.qa('.donut circle').length, 3);
    const rows = a.qa('.legrow').map((r) => r.querySelector('.nm').textContent);
    eq(rows, ['Продукты', 'Питомец', 'Подарки']);
    ok(a.qa('.legrow')[0].querySelector('.pc').textContent.includes('50%'));
    ok(a.qa('.legrow')[0].querySelector('.delta.up'), 'рост оранжевым со стрелкой');
    eq(a.qa('.dchip').map((d) => d.textContent), ['Обзор', 'Месяц к месяцу', 'Категория']);
    // прошлый месяц закончен: цветная стрелка и нет пометки
    a.click(a.qa('.mchip').find((c) => !c.hasAttribute('aria-current'))); await sleep(80);
    ok(a.q('.hero .big').textContent.includes('1 500'));
    ok(!a.q('.hero').textContent.includes('Месяц идёт'));
    ok(a.q('.dl').textContent.includes('нет') || a.q('.dl').textContent.includes('данных'), a.q('.dl').textContent);
  } finally { a.close(); }
});

test('месяц общий: выбор в аналитике виден в истории', async () => {
  const a = await openApp({ seed, route: '#/analytics' });
  try {
    await waitFor(() => a.q('.mchip'), 'лента');
    a.click(a.qa('.mchip').find((c) => !c.hasAttribute('aria-current'))); await sleep(80);
    await a.go('#/history', () => a.h1() === 'История');
    ok(a.q('.total').textContent.includes('1 500'), 'в истории тот же месяц');
    eq(a.qa('.rec').length, 2);
  } finally { a.close(); }
});

test('детализация категории: итог, подкатегории, расходы с комментариями, переход к правке', async () => {
  const a = await openApp({ seed, route: '#/analytics' });
  try {
    await waitFor(() => a.q('.legrow'), 'обзор');
    a.click(a.qa('.legrow').find((r) => r.textContent.includes('Питомец'))); await waitFor(() => a.h1() === 'Питомец', 'детализация');
    ok(a.q('.card .total').textContent.includes('2 000'));
    ok(a.q('.card').textContent.includes('не закончен') || a.q('.card').textContent.includes('%'));
    ok(a.qa('.bar').length === 2, 'подкатегория «Корм» и «Без подкатегории»');
    ok(a.q('.pad').textContent.includes('Без подкатегории'));
    eq(a.qa('.rec').length, 2);
    a.click(a.q('.rec')); await waitFor(() => a.h1() === 'Редактирование', 'правка');
    a.click(a.q('[data-act="back"]')); await waitFor(() => a.h1() === 'История', 'назад ведёт в историю');
  } finally { a.close(); }
});

test('месяц к месяцу: столбцы, таблица с разницей, заметные изменения сверху', async () => {
  const a = await openApp({ seed, route: '#/analytics/compare' });
  try {
    await waitFor(() => a.q('.mcol'), 'столбцы');
    eq(a.qa('.mcol').length, 2);
    eq(a.q('.mcol[aria-pressed="true"] .ml').textContent.length > 0, true);
    ok(a.q('.mcol[aria-pressed="true"] b').textContent === '6к', a.q('.mcol[aria-pressed="true"] b').textContent);
    const rows = a.qa('.tbl tr').slice(1);
    eq(rows[0].children[0].textContent, 'Продукты');
    ok(rows[0].children[3].textContent.includes('+2 000'), rows[0].children[3].textContent);
    ok(rows.some((r) => r.children[0].textContent === 'Подарки' && r.children[3].classList.contains('up')));
    a.click(a.qa('.mcol')[0]); await sleep(80);
    ok(a.q('.empty'), 'у первого месяца данных сравнивать не с чем');
  } finally { a.close(); }
});

test('категория во времени: выбор из списка, среднее, минимум, максимум, подкатегория', async () => {
  const a = await openApp({ seed, route: '#/analytics/category' });
  try {
    await waitFor(() => a.q('#dcat'), 'выбор категории');
    eq(a.q('#dcat').value, 'c:prod');
    ok(a.q('.hero').textContent.includes('3 000'));
    const stats = a.qa('.stat b').map((b) => b.textContent.replace(/\s/g, ' '));
    eq(stats.length, 4);
    ok(stats[0].includes('2 000'), 'среднее по двум месяцам: 2 000 ₽');
    a.change(a.q('#dcat'), 's:pet:pet.1'); await sleep(80);
    ok(a.q('.hero').textContent.includes('Питомец › Корм') && a.q('.hero').textContent.includes('1 500'));
    a.click(a.qa('.chip').find((c) => c.textContent === 'Продукты')); await sleep(60);
    eq(a.q('#dcat').value, 'c:prod');
    a.change(a.q('#dcat'), 'c:inv'); await sleep(60);
    ok(a.q('.empty').textContent.includes('расходов пока нет'));
  } finally { a.close(); }
});

test('переключение дашбордов нажатием на вкладки', async () => {
  const a = await openApp({ seed, route: '#/analytics' });
  try {
    await waitFor(() => a.q('.dchip'), 'вкладки');
    a.click(a.qa('.dchip')[1]); await waitFor(() => a.q('.mcol'), 'сравнение');
    eq(a.q('.dchip[aria-current]').textContent, 'Месяц к месяцу');
    a.click(a.qa('.dchip')[2]); await waitFor(() => a.q('#dcat'), 'категория');
    a.click(a.qa('.dchip')[0]); await waitFor(() => a.q('.donut'), 'обзор');
  } finally { a.close(); }
});
