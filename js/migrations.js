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
];

/** Версия схемы данных: попадает в файл экспорта. */
export const SCHEMA_VERSION = MIGRATIONS.length;
