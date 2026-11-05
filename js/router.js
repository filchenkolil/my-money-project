/* Разделы приложения и разбор адреса. Адрес вида #/history. */
export const ROUTES = ['add', 'history', 'analytics', 'settings'];
export const DEFAULT_ROUTE = 'add';

export function routeFromHash(hash) {
  const name = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES.includes(name) ? name : DEFAULT_ROUTE;
}
export const hashFor = (route) => '#/' + route;
