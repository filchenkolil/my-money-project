/* Миграции схемы. Новую версию добавляем в конец массива, существующие не правим. */

export const MIGRATIONS = [
  // 1: категории (и подкатегории), расходы, настройки
  function v1(db) {
    db.createObjectStore('categories', { keyPath: 'id' });
    const exp = db.createObjectStore('expenses', { keyPath: 'id' });
    exp.createIndex('date', 'date');
    exp.createIndex('categoryId', 'categoryId');
    db.createObjectStore('meta', { keyPath: 'key' });
  },
  // 2 (v2, «Поездки»): поездки, расходы поездок, отдельный набор категорий поездок. Данные версии 1 не меняются.
  function v2(db, tx) {
    db.createObjectStore('trips', { keyPath: 'id' });
    const te = db.createObjectStore('tripExpenses', { keyPath: 'id' });
    te.createIndex('tripId', 'tripId');
    te.createIndex('date', 'date');
    te.createIndex('categoryId', 'categoryId');
    const tc = db.createObjectStore('tripCategories', { keyPath: 'id' });
    // стартовый набор (копия на момент выпуска v2, чтобы миграция не зависела от будущих правок seed.js)
    [['tc.exc', 'Экскурсии', 'camera', 188], ['tc.com', 'Связь', 'phone', 252], ['tc.trn', 'Транспорт', 'bus', 0], ['tc.sou', 'Сувениры', 'gift', 52], ['tc.res', 'Рестораны', 'fork', 325],
      ['tc.fod', 'Продукты', 'cart', 228], ['tc.sty', 'Проживание', 'bed', 275], ['tc.tkt', 'Билеты', 'ticket', 18], ['tc.oth', 'Прочее', 'dots', 345]]
      .forEach(([id, name, icon, hue], order) => tc.put({ id, name, icon, hue, order }));
    void tx;
  },
];

/** Версия схемы данных: попадает в файл экспорта. */
export const SCHEMA_VERSION = MIGRATIONS.length;
