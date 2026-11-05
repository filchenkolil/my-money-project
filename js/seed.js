/* Стартовый набор категорий (по PROJECT.md). Оттенок цвета берётся из палитры, значок из набора значков. */

export const PALETTE = [0, 18, 35, 52, 80, 110, 145, 168, 188, 208, 228, 252, 275, 300, 325, 345];
export const ICONS = ['cart', 'bus', 'paw', 'health', 'gift', 'star', 'fork', 'repeat', 'phone', 'home', 'shirt', 'book', 'dumbbell', 'trend', 'coffee', 'heart', 'bag', 'plane', 'camera', 'bed', 'ticket', 'tag', 'dots'];
export const DEFAULT_ICON = 'tag';

// [id, название, значок, оттенок, подкатегории]
export const DEFAULT_CATEGORIES = [
  ['prod', 'Продукты', 'cart', 228, []],
  ['trans', 'Транспорт', 'bus', 0, ['Автобус', 'Такси', 'Трамвай', 'Самокат']],
  ['pet', 'Питомец', 'paw', 110, ['Корм', 'Уход', 'Ветеринар', 'Груминг']],
  ['gifts', 'Подарки', 'gift', 52, []],
  ['rest', 'Рестораны', 'fork', 325, []],
  ['home', 'Дом и коммуналка', 'home', 18, []],
  ['cloth', 'Одежда и уход', 'shirt', 145, ['Одежда', 'Уход']],
  ['health', 'Здоровье', 'health', 275, []],
  ['fun', 'Развлечения', 'star', 188, []],
  ['subs', 'Подписки', 'repeat', 80, ['Claude', 'Яндекс', 'Иви', 'Карьерный клуб', 'iCloud']],
  ['mobile', 'Мобильная связь', 'phone', 252, []],
  ['edu', 'Образование', 'book', 300, []],
  ['sport', 'Спорт', 'dumbbell', 168, []],
  ['inv', 'Инвестиции', 'trend', 208, []],
  ['other', 'Прочее', 'dots', 345, []],
];

/** Развёртывает стартовый набор в записи категорий и подкатегорий для хранилища. */
export function buildDefaultCategories() {
  const out = [];
  DEFAULT_CATEGORIES.forEach(([id, name, icon, hue, subs], i) => {
    out.push({ id, name, icon, hue, order: i, parentId: null });
    subs.forEach((s, j) => out.push({ id: `${id}.${j + 1}`, name: s, icon: null, hue: null, order: j, parentId: id }));
  });
  return out;
}

/** Порядок категорий на главном экране, пока истории использования нет. */
export const DEFAULT_FREQUENT_ORDER = ['prod', 'trans', 'pet', 'gifts', 'rest', 'home', 'cloth', 'health', 'fun', 'subs', 'mobile', 'edu', 'sport', 'other', 'inv'];
