/* Сквозные проверки версии 2: поездки. Данные выдуманные. */
import { test, eq, ok } from './harness.js';
import { openApp, withStore, waitFor, sleep, today } from './helpers.js';
import { toRub } from '../js/trips.js';
import { formatRub } from '../js/money.js';
const norm = (s) => s.replace(/[\s ]/g, '');

const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv'); };
const START = () => shift(0), END = () => shift(4);

/** Поездка «Турция» (TRY, курс 2,35) с билетами за 10 дней до начала (в рублях) и двумя тратами в валюте. */
const seedTrip = async (s) => {
  const t = await s.addTrip({ name: 'Турция', start: START(), end: END(), currency: 'TRY', rate: '2,35' });
  await s.addTripExpense({ tripId: t.id, categoryId: 'tc.tkt', amount: 2840000, isRub: true, date: shift(-10), note: 'билеты' });
  await s.addTripExpense({ tripId: t.id, categoryId: 'tc.sty', amount: 950000, date: shift(0), note: 'отель' });
  await s.addTripExpense({ tripId: t.id, categoryId: 'tc.res', amount: 125000, date: shift(1) });
  return t;
};
const RUB_TOTAL = () => 2840000 + toRub(950000, 23500) + toRub(125000, 23500);
const setDate = (a, el, v) => { el.value = v; el.dispatchEvent(new a.win.Event('change', { bubbles: true })); };
const firstTrip = async () => (await withStore((s) => s.trips()))[0];

test('вкладка «Поездки»: пустое состояние, создание поездки, проверка полей', async () => {
  const a = await openApp({ route: '#/trips' });
  try {
    await waitFor(() => a.q('.heroc'), 'пусто');
    ok(a.q('.heroc').textContent.includes('Поездок пока нет'));
    eq(a.q('.tabs [aria-current="page"]').textContent.trim(), 'Поездки');
    a.click(a.q('.heroc [data-act="new"]')); await waitFor(() => a.h1() === 'Новая поездка', 'форма');
    ok(a.q('.notice').textContent.includes('нельзя изменить'), 'предупреждение о датах');
    a.click(a.q('[data-act="save"]')); await waitFor(() => a.q('.err'), 'ошибка названия'); ok(a.q('.err').textContent.includes('название'));
    a.input(a.q('#tname'), 'Стамбул'); setDate(a, a.q('#tstart'), '2027-02-16'); setDate(a, a.q('#tend'), '2027-02-12');
    a.input(a.q('#trate'), '2,35'); a.click(a.q('[data-act="save"]')); await waitFor(() => a.q('.err'), 'даты'); ok(a.q('.err').textContent.includes('раньше'));
    setDate(a, a.q('#tend'), '2027-02-20'); a.input(a.q('#trate'), 'abc'); a.click(a.q('[data-act="save"]'));
    await waitFor(() => a.q('.err') && a.q('.err').textContent.includes('Курс'), 'курс');
    a.input(a.q('#trate'), '2,35'); a.click(a.q('[data-act="save"]'));
    await waitFor(() => a.h1() === 'Стамбул', 'экран поездки');
    const t = await firstTrip(); eq([t.name, t.currency, t.rateE4, t.start, t.end], ['Стамбул', 'TRY', 23500, '2027-02-16', '2027-02-20']);
    await a.go('#/trips', () => a.q('.tripcard'));
    ok(a.q('.tripcard').textContent.includes('Стамбул') && a.q('.tripcard').textContent.includes('5 дн.'));
  } finally { a.close(); }
});

test('валюта: рубль не требует курса, другая валюта вводится кодом', async () => {
  const a = await openApp({ route: '#/tripedit/new' });
  try {
    await waitFor(() => a.q('#tcur'), 'форма');
    ok(a.q('#trate'), 'для лиры курс нужен');
    a.change(a.q('#tcur'), 'RUB'); await sleep(40); ok(!a.q('#trate'), 'для рубля курса нет');
    a.change(a.q('#tcur'), 'OTHER'); await sleep(40); ok(a.q('#tother'), 'поле для кода');
    a.input(a.q('#tname'), 'Швейцария'); setDate(a, a.q('#tstart'), '2027-03-01'); setDate(a, a.q('#tend'), '2027-03-05');
    a.input(a.q('#tother'), 'ch'); a.click(a.q('[data-act="save"]')); await waitFor(() => a.q('.err'), 'код'); ok(a.q('.err').textContent.includes('три латинские'));
    a.input(a.q('#tother'), 'chf'); await sleep(30); a.input(a.q('#trate'), '90,5'); a.click(a.q('[data-act="save"]'));
    await waitFor(() => a.h1() === 'Швейцария', 'создана');
    const t = await firstTrip(); eq([t.currency, t.rateE4], ['CHF', 905000]);
  } finally { a.close(); }
});

test('форма расхода: без поездок предлагает создать её, с поездкой пересчитывает по курсу по ходу ввода', async () => {
  const none = await openApp();
  try {
    const a = none; a.click(a.qa('.seg button')[1]); await sleep(40);
    ok(a.q('.pad').textContent.includes('Сначала создайте поездку')); ok(!a.q('.savebar'), 'сохранять пока нечего');
    a.click(a.q('[data-act="newtrip"]')); await waitFor(() => a.h1() === 'Новая поездка', 'создание');
  } finally { none.close(); }
  const a = await openApp({ seed: seedTrip });
  try {
    a.click(a.qa('.seg button')[1]); await sleep(60);
    eq(a.q('.seg [aria-pressed="true"]').textContent, 'Поездки');
    eq(a.qa('.tiles .tile').map((t) => t.textContent.trim()), ['Экскурсии', 'Связь', 'Транспорт', 'Сувениры', 'Рестораны', 'Продукты', 'Проживание', 'Билеты', 'Прочее']);
    eq(a.qa('.chips .chip').slice(0, 2).map((c) => c.textContent), ['TRY', '₽']);
    ok(a.q('#conv').textContent.includes('по курсу поездки (2,35)'), a.q('#conv').textContent);
    a.typeAmount('100'); ok(a.q('#conv').textContent.includes('≈') && a.q('#conv').textContent.includes('235') && a.q('#conv').textContent.includes('2,35 ₽ за 1 TRY'), a.q('#conv').textContent);
    a.click(a.qa('.chips .chip')[1]); await sleep(40);
    ok(a.q('#conv').textContent.includes('пересчёт не нужен'), 'в рублях пересчёта нет');
    ok(a.q('#tripsel').selectedOptions[0].textContent.includes('Турция'), 'поездка выбрана по дате');
  } finally { a.close(); }
});

test('расход поездки: сохраняется в валюте поездки, ввод пачкой оставляет поездку, валюту и дату, «Отменить»', async () => {
  const a = await openApp({ seed: seedTrip });
  try {
    a.click(a.qa('.seg button')[1]); await sleep(60);
    const day = a.qa('.wk button').find((b) => b.dataset.v === shift(2)); a.click(day); await sleep(40);
    a.click(a.qa('.tile').find((t) => t.textContent.trim() === 'Рестораны')); await sleep(40);
    a.typeAmount('300,50'); a.click(a.q('#save'));
    await waitFor(() => a.q('.toast.show'), 'сохранено');
    const added = (await withStore((s) => s.tripExpenses())).find((e) => e.date === shift(2));
    eq([added.amount, added.isRub, added.categoryId], [30050, false, 'tc.res']);
    eq(a.q('#amt').value, ''); eq(a.qa('.tile[aria-pressed="true"]').length, 0, 'категория сброшена');
    eq(a.q('.wk [aria-pressed="true"]').dataset.v, shift(2), 'дата осталась');
    ok(a.q('#tripsel').selectedOptions[0].textContent.includes('Турция'), 'поездка осталась');
    // рублёвая трата
    a.click(a.qa('.chips .chip')[1]); await sleep(30);
    a.click(a.qa('.tile').find((t) => t.textContent.trim() === 'Билеты')); a.typeAmount('5 000'); a.click(a.q('#save'));
    await waitFor(async () => (await withStore((s) => s.tripExpenses())).length === 5, 'вторая запись');
    const rub = (await withStore((s) => s.tripExpenses())).find((e) => e.amount === 500000);
    eq([rub.isRub, rub.categoryId], [true, 'tc.tkt']);
    eq(a.qa('.chips .chip')[1].getAttribute('aria-pressed'), 'true', 'валюта (₽) осталась выбранной');
    a.click(a.q('[data-undo]')); await waitFor(async () => (await withStore((s) => s.tripExpenses())).length === 4, 'отмена');
    // ошибки: без категории
    a.typeAmount('10'); a.click(a.q('#save')); await waitFor(() => a.q('.err'), 'ошибка'); eq(a.q('.err').textContent, 'Выберите категорию поездки.');
    eq(a.q('#amt').value, '10');
  } finally { a.close(); }
});

test('экран поездки: полная стоимость с билетами до начала, влияние на месяцы, категории, список с пометкой «до начала»', async () => {
  const a = await openApp({ seed: seedTrip, route: '#/trips' });
  try {
    await waitFor(() => a.q('.tripcard'), 'список');
    ok(a.q('.tripcard').textContent.includes('до начала поездки'), 'на карточке видно «из них до начала»');
    a.click(a.q('.tripcard')); await waitFor(() => a.h1() === 'Турция', 'поездка');
    const card = a.q('.card').textContent.replace(/\s/g, ' ');
    ok(card.includes('курс 2,35') && card.includes('TRY'), card);
    eq(norm(a.q('.card .total').textContent), norm(formatRub(RUB_TOTAL())), 'полная стоимость с билетами до начала');
    eq(a.qa('.rec').length, 3);
    ok(a.qa('.rec').some((r) => r.textContent.includes('(до начала)') && r.textContent.includes('билеты')));
    ok(a.qa('.rec').some((r) => r.textContent.includes('TRY') && r.textContent.includes('₽')), 'в валюте и в рублях');
    ok(a.q('.pad').textContent.includes('Влияние на месяцы') && a.q('.pad').textContent.includes('Месячная аналитика учитывает каждый расход по его дате'));
    eq(a.qa('.bar').length >= 4, true);
    a.click(a.qa('.rec')[0]); await waitFor(() => a.h1() === 'Редактирование', 'правка расхода');
    a.click(a.q('[data-act="back"]')); await waitFor(() => a.h1() === 'Турция', 'назад ведёт на экран поездки');
    a.click(a.q('[data-act="add"]')); await waitFor(() => a.q('#tripsel'), 'добавление в поездку');
    eq(a.q('.seg [aria-pressed="true"]').textContent, 'Поездки', 'форма сразу в режиме поездки');
  } finally { a.close(); }
});

test('правка расхода поездки: «было → стало», смена категории и суммы, удаление с подтверждением', async () => {
  const a = await openApp({ seed: seedTrip, route: '#/trips' });
  try {
    await waitFor(() => a.q('.tripcard'), 'список'); a.click(a.q('.tripcard')); await waitFor(() => a.h1() === 'Турция', 'поездка');
    a.click(a.qa('.rec').find((r) => r.textContent.includes('отель'))); await waitFor(() => a.h1() === 'Редактирование', 'правка');
    eq(a.q('#amt').value, '9 500'); eq(a.q('.tile[aria-pressed="true"] .nm').textContent, 'Проживание');
    a.click(a.q('#save')); await sleep(60); ok(!a.q('.sheet') && a.q('.toast').textContent.includes('Изменений нет'));
    a.typeAmount('10 000'); a.click(a.qa('.tile').find((t) => t.textContent.trim() === 'Прочее')); a.click(a.q('#save'));
    await waitFor(() => a.q('.sheet'), 'карточка');
    const t = a.q('.diff').textContent; ok(t.includes('Категория поездки') && t.includes('Проживание') && t.includes('Прочее') && t.includes('9 500 TRY') && t.includes('10 000 TRY'), t);
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.h1() === 'Турция', 'возврат на экран поездки');
    const e = (await withStore((s) => s.tripExpenses())).find((x) => x.note === 'отель'); eq([e.amount, e.categoryId], [1000000, 'tc.oth']);
    a.click(a.qa('.rec').find((r) => r.textContent.includes('отель'))); await waitFor(() => a.q('[data-act="del"]'), 'правка');
    a.click(a.q('[data-act="del"]')); await waitFor(() => a.q('.sheet'), 'подтверждение'); ok(a.q('.sheet').textContent.includes('будет удалена'));
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.h1() === 'Турция', 'после удаления');
    eq((await withStore((s) => s.tripExpenses())).length, 2);
  } finally { a.close(); }
});

test('правка поездки: даты заблокированы; смена курса показывает пересчёт, подтверждение и пересчитывает всё', async () => {
  const a = await openApp({ seed: seedTrip, route: '#/add' });
  try {
    const trip = await firstTrip(); a.win.location.hash = '#/tripedit/' + trip.id;
    await waitFor(() => a.q('#trate'), 'форма');
    ok(a.q('#tstart').disabled && a.q('#tend').disabled, 'даты заблокированы');
    ok(a.q('.pad').textContent.includes('Даты после создания менять нельзя'));
    eq(a.q('#trate').value, '2,3500');
    a.input(a.q('#trate'), '3'); await sleep(40);
    const prev = a.q('#prev').textContent;
    ok(prev.includes('после пересчёта'), prev);
    const after = 2840000 + toRub(950000, 30000) + toRub(125000, 30000);
    eq(norm(a.q('#prev .total').textContent), norm(formatRub(after)));
    a.input(a.q('#trate'), '3,'); await sleep(40); ok(a.q('#prev').textContent.includes('неверном формате'));
    a.input(a.q('#trate'), '3'); a.input(a.q('#tname'), 'Анталья'); a.click(a.q('[data-act="save"]'));
    await waitFor(() => a.q('.sheet'), 'карточка'); const d = a.q('.diff').textContent;
    ok(d.includes('Название') && d.includes('Курс') && d.includes('2,35') && d.includes('3,00') && d.includes('Стоимость поездки'), d);
    a.click(a.q('[data-act="unreview"]')); await sleep(40);
    eq((await firstTrip()).rateE4, 23500, 'пока не применено');
    a.click(a.q('[data-act="save"]')); await waitFor(() => a.q('.sheet'), 'карточка'); a.click(a.q('[data-act="confirm"]'));
    await waitFor(() => a.h1() === 'Анталья', 'экран поездки');
    eq((await firstTrip()).rateE4, 30000);
    eq(norm(a.q('.card .total').textContent), norm(formatRub(after)), 'итог пересчитан');
  } finally { a.close(); }
});

test('удаление поездки: пока не выбрано, куда перенести, кнопка недоступна; перенос в обычные расходы в рублях', async () => {
  const a = await openApp({ seed: seedTrip });
  try {
    const trip = await firstTrip(); await a.go('#/tripdel/' + trip.id, () => a.q('#moveall'));
    ok(a.q('.notice').textContent.includes('3 расхода'), a.q('.notice').textContent);
    eq(a.qa('.imp').length, 3); ok(a.q('[data-act="delete"]').disabled);
    ok([...a.q('#moveall').options].some((o) => o.value.startsWith('c:rest|')), 'обычные категории в списке');
    a.change(a.q('#moveall'), 'c:rest|'); await sleep(50);
    a.change(a.qa('.imp select')[0], 'c:home|'); await sleep(50);
    a.click(a.q('[data-act="delete"]')); await waitFor(() => a.q('.sheet'), 'подтверждение'); a.click(a.q('[data-act="confirm"]'));
    await waitFor(() => a.h1() === 'Поездки', 'список поездок');
    const [trips, te, reg] = await withStore(async (s) => [await s.trips(), await s.tripExpenses(), await s.allExpenses()]);
    eq([trips.length, te.length, reg.length], [0, 0, 3]);
    eq(reg.reduce((s, e) => s + e.amount, 0), RUB_TOTAL(), 'рубли сохранены по курсу поездки');
    eq(reg.filter((e) => e.categoryId === 'home').length, 1); eq(reg.filter((e) => e.categoryId === 'rest').length, 2);
  } finally { a.close(); }
});

test('аналитика: поездка отдельным сегментом месяца, «Поездки» в сравнении, дашборд «Поездки»', async () => {
  const a = await openApp({ seed: async (s) => { await seedTrip(s); await s.addExpense({ amount: 100000, date: shift(0), categoryId: 'prod' }); }, route: '#/analytics' });
  try {
    await waitFor(() => a.q('.legrow'), 'обзор');
    ok(a.qa('.legrow').some((r) => r.textContent.includes('Турция')), 'сегмент поездки');
    ok(a.q('.pad').textContent.includes('Поездки') && a.qa('.donut circle').length >= 2);
    const all = [[shift(-10), 2840000], [shift(0), toRub(950000, 23500)], [shift(1), toRub(125000, 23500)]];
    const total = 100000 + all.filter(([d]) => d.slice(0, 7) === today().slice(0, 7)).reduce((s, [, v]) => s + v, 0);
    eq(norm(a.q(".hero .big").textContent), norm(formatRub(total)), "итог месяца включает поездку по датам расходов");
    a.click(a.qa('.legrow').find((r) => r.textContent.includes('Турция'))); await waitFor(() => a.h1() === 'Турция', 'экран поездки');
    await a.go('#/analytics/compare', () => a.q('.mcol'));
    // дашборд «Поездки»
    a.click(a.qa('.dchip')[3]); await waitFor(() => a.q('.tripcard'), 'дашборд');
    ok(a.q('.tripcard').textContent.includes('Турция') && a.q('.tripcard .stack') && a.q('.tripcard').textContent.includes('в день'));
    a.click(a.q('.tripcard')); await waitFor(() => a.h1() === 'Турция', 'переход');
  } finally { a.close(); }
});

test('история: расходы поездок не попадают в список, но месяц показывает строку про поездки', async () => {
  const a = await openApp({ seed: async (s) => { await seedTrip(s); await s.addExpense({ amount: 100000, date: shift(0), categoryId: 'prod' }); }, route: '#/history' });
  try {
    await waitFor(() => a.q('.rec'), 'список');
    eq(a.qa('.rec').length, 1);
    ok(a.q('.card').textContent.includes('Поездки в этом месяце'), a.q('.card').textContent);
  } finally { a.close(); }
});

test('категории поездок: добавить, переименовать, порядок, удалить с переносом расходов', async () => {
  const a = await openApp({ seed: seedTrip, route: '#/categories' });
  try {
    await waitFor(() => a.q('.tcatrow'), 'список');
    eq(a.qa('.tcatrow .catname b').map((b) => b.textContent), ['Экскурсии', 'Связь', 'Транспорт', 'Сувениры', 'Рестораны', 'Продукты', 'Проживание', 'Билеты', 'Прочее']);
    a.click(a.q('[data-act="tnew"]')); await waitFor(() => a.h1() === 'Новая категория поездки', 'новая');
    a.input(a.q('#cename'), 'Страховка'); a.click(a.qa('.icb')[3]); a.click(a.q('[data-act="save"]')); await waitFor(() => a.h1() === 'Категории', 'список');
    eq(a.qa('.tcatrow').length, 10);
    a.click(a.qa('.tcatrow [data-act="move"][data-dir="-1"]')[9]); await waitFor(() => a.qa('.tcatrow .catname b')[8].textContent === 'Страховка', 'порядок');
    eq((await withStore((s) => s.tripCategories()))[8].name, 'Страховка');
    a.click(a.qa('.tcatrow .catname').find((b) => b.textContent.includes('Страховка'))); await waitFor(() => a.h1() === 'Изменить категорию поездки', 'правка');
    a.input(a.q('#cename'), 'Медицина'); a.click(a.q('[data-act="save"]')); await waitFor(() => a.h1() === 'Категории', 'список');
    ok(a.qa('.tcatrow .catname b').some((b) => b.textContent === 'Медицина'));
    // удаление категории с расходами
    a.click(a.qa('.tcatrow .catname').find((b) => b.textContent.includes('Проживание'))); await waitFor(() => a.h1() === 'Изменить категорию поездки', 'правка');
    a.click(a.q('[data-act="delete"]')); await waitFor(() => a.q('#moveall'), 'перенос');
    ok(a.q('[data-act="delete"]').disabled); eq(a.qa('.imp').length, 1);
    a.change(a.q('#moveall'), 'tc.oth'); await sleep(50); a.click(a.q('[data-act="delete"]')); await waitFor(() => a.q('.sheet'), 'подтверждение'); a.click(a.q('[data-act="confirm"]'));
    await waitFor(() => a.h1() === 'Категории', 'готово');
    const [cats, te] = await withStore(async (s) => [await s.tripCategories(), await s.tripExpenses()]);
    ok(!cats.some((c) => c.id === 'tc.sty')); eq(te.find((e) => e.note === 'отель').categoryId, 'tc.oth');
  } finally { a.close(); }
});

test('смена вида расхода в правке: обычный → поездка и обратно, с карточкой «было → стало»', async () => {
  const a = await openApp({ seed: async (s) => { await seedTrip(s); await s.addExpense({ amount: 150000, date: shift(1), categoryId: 'rest', note: 'ужин' }); }, route: '#/history' });
  try {
    await waitFor(() => a.q('.rec'), 'список'); a.click(a.q('.rec')); await waitFor(() => a.h1() === 'Редактирование', 'правка');
    a.click(a.qa('.seg button')[1]); await sleep(60);
    ok(a.q('#tripsel')); a.click(a.qa('.chips .chip')[1]); await sleep(30); // рубли
    a.click(a.qa('.tile').find((t) => t.textContent.trim() === 'Рестораны')); a.click(a.q('#save')); await waitFor(() => a.q('.sheet'), 'карточка');
    ok(a.q('.diff').textContent.includes('Вид расхода') && a.q('.diff').textContent.includes('Расход поездки'), a.q('.diff').textContent);
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.h1() === 'Турция', 'экран поездки');
    eq([(await withStore((s) => s.allExpenses())).length, (await withStore((s) => s.tripExpenses())).length], [0, 4]);
    a.click(a.qa('.rec').find((r) => r.textContent.includes('ужин'))); await waitFor(() => a.h1() === 'Редактирование', 'правка поездочного расхода');
    a.click(a.qa('.seg button')[0]); await sleep(60);
    eq(a.q('#amt').value, '1 500', 'сумма показана в рублях');
    a.click(a.qa('.tile').find((t) => t.textContent.trim() === 'Рестораны')); a.click(a.q('#save')); await waitFor(() => a.q('.sheet'), 'карточка');
    ok(a.q('.diff').textContent.includes('Обычный расход'));
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.h1() === 'История', 'история');
    eq([(await withStore((s) => s.allExpenses())).length, (await withStore((s) => s.tripExpenses())).length], [1, 3]);
  } finally { a.close(); }
});

test('экспорт и восстановление с поездками: JSON, CSV поездок, возврат в чистое приложение с теми же итогами', async () => {
  const src = await openApp({ seed: seedTrip, route: '#/backup' });
  let json, csv;
  try {
    await waitFor(() => src.q('#period'), 'экран'); const saved = []; src.win.__mymoneyFiles = { save: async (n, t) => { saved.push({ n, t }); return 'shared'; }, read: (f) => f.text() };
    ok(src.q('[data-act="tripscsv"]'), 'кнопка CSV поездок есть, когда поездки созданы');
    src.click(src.q('[data-act="json"]')); await waitFor(() => saved.length === 1, 'json'); json = saved[0].t;
    await sleep(300); // экспорт завершён, кнопки снова доступны
    src.click(src.q('[data-act="tripscsv"]')); await waitFor(() => saved.length === 2, 'csv'); csv = saved[1];
    eq(csv.n, 'mymoney-trips-all.csv'); eq(csv.t.trim().split('\r\n').length, 4); ok(csv.t.includes('Турция;') && csv.t.includes(';TRY;') && csv.t.includes(';RUB;'));
  } finally { src.close(); }
  const a = await openApp({ route: '#/backup' });
  try {
    await waitFor(() => a.q('#file'), 'экран'); ok(!a.q('[data-act="tripscsv"]'), 'без поездок кнопки нет');
    const dt = new a.win.DataTransfer(); dt.items.add(new a.win.File([json], 'b.json', { type: 'application/json' }));
    const input = a.q('#file'); input.files = dt.files; input.dispatchEvent(new a.win.Event('change', { bubbles: true }));
    await waitFor(() => a.q('.sheet'), 'подтверждение'); ok(a.q('.sheet').textContent.includes('3 расхода поездок') && a.q('.sheet').textContent.includes('новых поездок: 1'), a.q('.sheet').textContent);
    a.click(a.q('[data-act="restore"]')); await waitFor(() => a.q('.toast.show') && a.q('.toast').textContent.includes('Добавлено'), 'готово');
    const [trips, te, tcats] = await withStore(async (s) => [await s.trips(), await s.tripExpenses(), await s.tripCategories()]);
    eq([trips.length, te.length, tcats.length], [1, 3, 9]);
    eq(te.reduce((s, e) => s + (e.isRub ? e.amount : toRub(e.amount, trips[0].rateE4)), 0), RUB_TOTAL());
  } finally { a.close(); }
});

test('сброс удаляет поездки, возвращает набор категорий поездок', async () => {
  const a = await openApp({ seed: seedTrip, route: '#/reset' });
  try {
    await waitFor(() => a.q('[data-act="ask"]'), 'экран'); a.click(a.q('[data-act="ask"]')); await waitFor(() => a.q('.sheet'), 'подтверждение'); a.click(a.q('[data-act="confirm"]'));
    await waitFor(() => a.q('#amt'), 'главный');
    const [trips, te, cats] = await withStore(async (s) => [await s.trips(), await s.tripExpenses(), await s.tripCategories()]);
    eq([trips.length, te.length, cats.length], [0, 0, 9]);
  } finally { a.close(); }
});

/* ---------- качество экранов поездок ---------- */
test('экраны поездок: нет горизонтальной прокрутки, зоны нажатия от 44 px, у всего есть подписи, тёмная тема без светлых пятен', async () => {
  const a = await openApp({ seed: seedTrip });
  try {
    const trip = await firstTrip(), bad = new Set(), tapBad = new Set(), nameBad = new Set(), lightBad = [];
    const lightBg = (rgb) => { const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(rgb); return !!m && (m[4] === undefined || +m[4] > 0.5) && (+m[1] + +m[2] + +m[3]) / 3 > 200; };
    const skip = '.dot, .wk button[aria-pressed="true"], .chip[aria-pressed="true"], .dchip[aria-current], .mchip[aria-current], .mcol, .updatebar, .toast, svg, .icb, .pal, .seg button[aria-pressed="true"], .tabs .ic, .tabs .fab, .badge, .heroc, .stack';
    for (const dark of [false, true]) {
      a.doc.documentElement.dataset.theme = dark ? 'dark' : 'light';
      for (const r of ['#/trips', '#/trip/' + trip.id, '#/tripedit/' + trip.id, '#/tripedit/new', '#/tripdel/' + trip.id, '#/tcatedit/tc.res', '#/tcatdel/tc.res', '#/analytics/trips', '#/categories', '#/add']) {
        a.win.location.hash = r; await sleep(250);
        if (r === '#/add') { a.click(a.qa('.seg button')[1]); await sleep(60); }
        const body = a.q('#body');
        if (a.doc.documentElement.scrollWidth > 391 || body.scrollWidth > body.clientWidth + 1) bad.add(`${r}: ${body.scrollWidth}/${body.clientWidth}`);
        if (dark) { for (const el of a.qa('#app *')) { if (el.closest(skip)) continue; const bg = a.win.getComputedStyle(el).backgroundColor; if (lightBg(bg) && el.getBoundingClientRect().width > 20) { lightBad.push(`${r}: ${el.tagName}.${el.className}`); break; } } }
        else {
          for (const el of a.qa('button, select, input:not([type=hidden]):not(.dpick), label.ib')) {
            if (el.matches('.tog, [hidden]')) continue; const rc = el.getBoundingClientRect(); if (rc.width < 1 || rc.height < 1) continue;
            if (rc.width < 43.5 || rc.height < 43.5) tapBad.add(`${r}: ${el.tagName}.${el.className} ${Math.round(rc.width)}×${Math.round(rc.height)}`);
            if (!(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim()) nameBad.add(`${r}: ${el.tagName}.${el.className}`);
          }
        }
      }
    }
    eq([...bad], []); eq([...tapBad], []); eq([...nameBad], []); eq(lightBad, []);
  } finally { a.close(); }
});
