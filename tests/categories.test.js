import { test, eq, ok } from './harness.js';
import { transferOptions, transferPlan, moveId, nextHue, diffCategory, parseTarget, targetValue, expensesIn } from '../js/categories.js';
import { buildDefaultCategories, PALETTE } from '../js/seed.js';

test('перенос при удалении категории: другие категории и их подкатегории, себя нет', () => {
  const cats = buildDefaultCategories(), pet = cats.find((c) => c.id === 'pet');
  const o = transferOptions(cats, pet);
  ok(!o.some((x) => x.value.startsWith('pet|')));
  ok(o.some((x) => x.value === 'prod|' && x.label === 'Продукты'));
  ok(o.some((x) => x.value === 'trans|trans.2' && x.label === 'Транспорт › Такси'));
});

test('перенос при удалении подкатегории: соседи, «без подкатегории», затем другие категории', () => {
  const cats = buildDefaultCategories(), korm = cats.find((c) => c.id === 'pet.1');
  const o = transferOptions(cats, korm);
  eq(o.slice(0, 4).map((x) => x.value), ['pet|pet.2', 'pet|pet.3', 'pet|pet.4', 'pet|']);
  ok(!o.some((x) => x.value === 'pet|pet.1'));
  eq(o[3].label, 'Питомец (без подкатегории)');
  ok(o.some((x) => x.value === 'prod|'));
});

test('план переноса: готов, только когда у каждого расхода есть цель; свой выбор сильнее «для всех»', () => {
  const ex = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  eq(transferPlan(ex, {}, '').ready, false);
  eq(transferPlan(ex, { a: 'prod|' }, '').ready, false);
  const p = transferPlan(ex, { a: 'pet|pet.1' }, 'prod|');
  eq([p.ready, p.transfers, p.allTo], [true, { a: { categoryId: 'pet', subcategoryId: 'pet.1' } }, { categoryId: 'prod', subcategoryId: null }]);
  eq(transferPlan([], {}, '').ready, true, 'нечего переносить');
  eq(parseTarget('x|'), { categoryId: 'x', subcategoryId: null }); eq(parseTarget(''), null); eq(targetValue('a', 'b'), 'a|b');
});

test('порядок: сдвиг на место вверх и вниз, на краях без изменений', () => {
  eq(moveId(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  eq(moveId(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  eq(moveId(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  eq(moveId(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
  eq(moveId(['a', 'b'], 'x', 1), ['a', 'b']);
});

test('цвет новой категории из палитры; изменения для карточки; расходы категории', () => {
  const cats = buildDefaultCategories();
  ok(PALETTE.includes(nextHue(cats)));
  eq(nextHue([{ id: 'a', parentId: null, hue: 0, order: 0 }]), 18);
  eq(diffCategory({ name: 'А', hue: 1, icon: 'tag' }, { name: 'Б', hue: 1, icon: 'cart' }).map((d) => d.label), ['Название', 'Значок']);
  eq(diffCategory({ name: 'А', hue: 1, icon: 'tag' }, { name: 'А', hue: 1, icon: 'tag' }), []);
  const ex = [{ categoryId: 'pet', subcategoryId: 'pet.1' }, { categoryId: 'pet', subcategoryId: null }, { categoryId: 'prod', subcategoryId: null }];
  eq(expensesIn(ex, { id: 'pet', parentId: null }).length, 2);
  eq(expensesIn(ex, { id: 'pet.1', parentId: 'pet' }).length, 1);
});
