/* Разделы приложения и разбор адреса. Адрес вида #/history или #/edit/<id>. */
export const ROUTES = ['add', 'history', 'analytics', 'settings', 'edit'];
export const DEFAULT_ROUTE = 'add';

const parts = (hash) => String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/');

export function routeFromHash(hash) {
  const name = parts(hash)[0];
  return ROUTES.includes(name) ? name : DEFAULT_ROUTE;
}
/** Параметр после названия раздела: #/edit/abc → «abc». */
export const routeParam = (hash) => { const p = parts(hash)[1]; return p ? decodeURIComponent(p) : null; };
export const hashFor = (route, param) => '#/' + route + (param ? '/' + encodeURIComponent(param) : '');
/** Какая вкладка нижней панели подсвечена на этом разделе. */
export const tabFor = (route) => (route === 'edit' ? 'history' : route);
