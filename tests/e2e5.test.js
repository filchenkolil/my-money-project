/* Сквозные проверки этапа 5: категории. */
import { test, eq, ok } from './harness.js';
import { openApp, withStore, waitFor, sleep, today } from './helpers.js';

const seed = async (s) => {
  const d = today();
  await s.addExpense({ amount: 10000, date: d, categoryId: 'pet', subcategoryId: 'pet.1', note: 'корм' });
  await s.addExpense({ amount: 20000, date: d, categoryId: 'pet', subcategoryId: 'pet.2' });
  await s.addExpense({ amount: 30000, date: d, categoryId: 'pet' });
  await s.addExpense({ amount: 40000, date: d, categoryId: 'prod' });
};

test('настройки → категории: дерево с подкатегориями, порядок стрелками', async () => {
  const a = await openApp({ route: '#/settings' });
  try {
    await waitFor(() => a.q('.setrow'), 'настройки');
    eq(a.qa('.setrow').length, 3);
    a.click(a.qa('.setrow')[0]); await waitFor(() => a.h1() === 'Категории', 'категории');
    eq(a.qa('.tree .cat').length, 15);
    const names = () => a.qa('.catname b').map((b) => b.textContent);
    eq(names().slice(0, 2), ['Продукты', 'Транспорт']);
    ok(a.q('.catname').textContent.includes('Продукты'));
    a.click(a.qa('[data-act="move"][data-kind="top"][data-dir="1"]')[0]);
    await waitFor(() => names()[0] === 'Транспорт', 'порядок изменился');
    eq(names().slice(0, 2), ['Транспорт', 'Продукты']);
    eq((await withStore((s) => s.categories())).filter((c) => c.parentId === null)[0].id, 'trans', 'порядок сохранён в базе');
    ok(a.qa('[data-act="move"][data-dir="-1"]')[0].disabled, 'первая категория не поднимается выше');
    // порядок виден на главном экране (после перезапуска порядка плиток по частоте он не меняется, а список «Ещё» идёт по порядку)
  } finally { a.close(); }
});

test('новая категория: цвет, значок, уникальность названия', async () => {
  const a = await openApp({ route: '#/categories' });
  try {
    await waitFor(() => a.q('.tree'), 'дерево');
    a.click(a.q('[data-act="new"]')); await waitFor(() => a.h1() === 'Новая категория', 'новая');
    a.input(a.q('#cename'), 'продукты'); a.click(a.q('[data-act="save"]'));
    await waitFor(() => a.q('.err'), 'ошибка'); ok(a.q('.err').textContent.includes('уже есть'));
    a.input(a.q('#cename'), 'Книги'); a.click(a.qa('.icb')[11]); a.click(a.qa('.pal button')[3]);
    a.click(a.q('[data-act="save"]'));
    await waitFor(() => a.h1() === 'Категории', 'список');
    eq(a.qa('.tree .cat').length, 16);
    const c = (await withStore((s) => s.categories())).find((x) => x.name === 'Книги');
    eq([c.icon, c.hue, c.parentId], ['book', 52, null]);
    a.click(a.q('[data-act="new"]')); await waitFor(() => a.h1() === 'Новая категория', 'новая');
    a.input(a.q('#cename'), '   '); a.click(a.q('[data-act="save"]'));
    await waitFor(() => a.q('.err'), 'пустое название'); ok(a.q('.err').textContent.includes('Введите название'));
  } finally { a.close(); }
});

test('правка категории: «было → стало», цвет и значок видны на главном экране', async () => {
  const a = await openApp({ route: '#/categories' });
  try {
    await waitFor(() => a.q('.tree'), 'дерево');
    a.click(a.qa('.catname')[0]); await waitFor(() => a.h1() === 'Изменить категорию', 'правка');
    eq(a.q('#cename').value, 'Продукты');
    a.click(a.q('[data-act="save"]')); await sleep(60); ok(!a.q('.sheet'), 'без изменений карточки нет');
    a.input(a.q('#cename'), 'Еда'); a.click(a.qa('.icb')[10]); a.click(a.q('[data-act="save"]'));
    await waitFor(() => a.q('.sheet'), 'карточка');
    const t = a.q('.diff').textContent; ok(t.includes('Продукты') && t.includes('Еда') && t.includes('Значок'), t);
    a.click(a.q('[data-act="unreview"]')); await sleep(60);
    eq((await withStore((s) => s.categories())).find((c) => c.id === 'prod').name, 'Продукты', 'пока не применено');
    a.click(a.q('[data-act="save"]')); await waitFor(() => a.q('.sheet'), 'карточка');
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.h1() === 'Категории', 'список');
    ok(a.q('.catname').textContent.includes('Еда'));
    await a.go('#/add', () => a.q('#amt'));
    ok(a.tile('Еда'), 'новое название на главном экране');
  } finally { a.close(); }
});

test('подкатегории: добавить, переименовать, повтор названия отклоняется', async () => {
  const a = await openApp({ route: '#/categories' });
  try {
    await waitFor(() => a.q('.tree'), 'дерево');
    const add = a.qa('[data-act="subnew"]').find((b) => b.dataset.id === 'pet');
    a.click(add); await waitFor(() => a.q('#subname'), 'окно');
    a.input(a.q('#subname'), 'Игрушки'); a.click(a.q('[data-act="subsave"]'));
    await waitFor(() => !a.q('.sheet') && a.qa('.subname').some((b) => b.textContent === 'Игрушки'), 'добавлена');
    a.click(a.qa('.subname').find((b) => b.textContent === 'Корм')); await waitFor(() => a.q('#subname'), 'окно');
    a.input(a.q('#subname'), 'игрушки'); a.click(a.q('[data-act="subsave"]'));
    await waitFor(() => a.q('.err'), 'дубль'); ok(a.q('.err').textContent.includes('уже есть'));
    a.input(a.q('#subname'), 'Лакомства'); a.click(a.q('[data-act="subsave"]'));
    await waitFor(() => a.qa('.subname').some((b) => b.textContent === 'Лакомства'), 'переименована');
  } finally { a.close(); }
});

test('удаление пустой категории: подтверждение и удаление', async () => {
  const a = await openApp({ route: '#/catedit/inv' });
  try {
    await waitFor(() => a.q('[data-act="delete"]'), 'правка');
    a.click(a.q('[data-act="delete"]')); await waitFor(() => a.h1()?.includes('Удаление'), 'удаление');
    ok(a.q('.card').textContent.includes('пустая'));
    a.click(a.q('[data-act="delete"]')); await waitFor(() => a.q('.sheet'), 'подтверждение');
    a.click(a.q('[data-act="cancel"]')); await sleep(60);
    eq((await withStore((s) => s.categories())).some((c) => c.id === 'inv'), true, 'отказ ничего не удалил');
    a.click(a.q('[data-act="delete"]')); await waitFor(() => a.q('.sheet'), 'подтверждение');
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.h1() === 'Категории', 'список');
    eq((await withStore((s) => s.categories())).some((c) => c.id === 'inv'), false);
    eq(a.qa('.tree .cat').length, 14);
  } finally { a.close(); }
});

test('удаление категории с расходами: пока не выбрано, куда, кнопка недоступна; «перенести все»; свой выбор сильнее', async () => {
  const a = await openApp({ seed, route: '#/catdel/pet' });
  try {
    await waitFor(() => a.q('#moveall'), 'перенос');
    ok(a.q('.notice').textContent.includes('3 расхода') && a.q('.notice').textContent.includes('600'), a.q('.notice').textContent);
    eq(a.qa('.imp').length, 3);
    ok(a.q('[data-act="delete"]').disabled);
    ok(![...a.q('#moveall').options].some((o) => o.value.startsWith('pet|')), 'себя нет в списке');
    a.click(a.q('[data-act="delete"]')); await sleep(60); ok(!a.q('.sheet'), 'недоступная кнопка не открывает подтверждение');
    a.change(a.q('#moveall'), 'prod|'); await sleep(60);
    ok(!a.q('[data-act="delete"]').disabled);
    a.change(a.qa('.imp select')[0], 'gifts|'); await sleep(60); // самый новый из трёх (сортировка по дате и порядку)
    a.click(a.q('[data-act="delete"]')); await waitFor(() => a.q('.sheet'), 'подтверждение');
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.h1() === 'Категории', 'список');
    const [cats, exps] = await withStore(async (s) => [await s.categories(), await s.allExpenses()]);
    ok(!cats.some((c) => c.id === 'pet' || c.parentId === 'pet'), 'категория и подкатегории удалены');
    eq(exps.length, 4); ok(!exps.some((e) => e.categoryId === 'pet'));
    eq(exps.filter((e) => e.categoryId === 'gifts').length, 1);
    eq(exps.filter((e) => e.categoryId === 'prod').length, 3);
    eq(exps.reduce((s, e) => s + e.amount, 0), 100000, 'сумма расходов не изменилась');
  } finally { a.close(); }
});

test('удаление подкатегории: перенос в соседнюю подкатегорию, «без подкатегории» или другую категорию', async () => {
  const a = await openApp({ seed, route: '#/catdel/pet.1' });
  try {
    await waitFor(() => a.q('#moveall'), 'перенос');
    const values = [...a.q('#moveall').options].map((o) => o.value).filter(Boolean);
    eq(values.slice(0, 4), ['pet|pet.2', 'pet|pet.3', 'pet|pet.4', 'pet|']);
    a.change(a.q('#moveall'), 'pet|pet.2'); await sleep(60);
    a.click(a.q('[data-act="delete"]')); await waitFor(() => a.q('.sheet'), 'подтверждение');
    a.click(a.q('[data-act="confirm"]')); await waitFor(() => a.h1() === 'Категории', 'список');
    const [cats, exps] = await withStore(async (s) => [await s.categories(), await s.allExpenses()]);
    ok(!cats.some((c) => c.id === 'pet.1'));
    eq(exps.filter((e) => e.subcategoryId === 'pet.2').length, 2);
    eq(exps.length, 4);
  } finally { a.close(); }
});

test('последнюю категорию удалить нельзя', async () => {
  const a = await openApp({ seed: async (s) => { for (const c of (await s.categories()).filter((x) => x.parentId === null && x.id !== 'prod')) await s.deleteCategory(c.id); }, route: '#/catdel/prod' });
  try {
    await waitFor(() => a.q('.notice'), 'сообщение');
    ok(a.q('.notice').textContent.includes('последнюю'));
    ok(!a.q('[data-act="delete"]'));
  } finally { a.close(); }
});

test('устаревший адрес категории возвращает к списку', async () => {
  const a = await openApp({ route: '#/catedit/нет-такой' });
  try { await waitFor(() => a.h1() === 'Категории', 'список'); } finally { a.close(); }
});
