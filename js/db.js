/* Тонкая обёртка над IndexedDB и механизм миграций.
   Версия базы = число миграций: каждая миграция поднимает схему на единицу и не теряет данные. */

/** Имя базы зависит от канала, чтобы тестовая версия не трогала настоящие данные (одна «страница» GitHub Pages = один origin). */
export function dbNameFor(pathname) {
  return /\/beta(\/|$)/.test(pathname) ? 'mymoney-beta' : 'mymoney';
}

export const request = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
export const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Транзакция отменена')); });

/**
 * Открывает базу, применяя недостающие миграции.
 * migrations: массив функций (db, tx, oldVersion). Индекс i поднимает схему с версии i до i+1.
 */
export function openDb(name, migrations) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, migrations.length);
    req.onupgradeneeded = (ev) => {
      const db = req.result, tx = req.transaction;
      for (let v = ev.oldVersion; v < migrations.length; v++) migrations[v](db, tx, ev.oldVersion);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('База занята другой вкладкой. Закройте её и повторите.'));
  });
}

export function deleteDb(name) {
  return new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); r.onblocked = () => resolve(); });
}
