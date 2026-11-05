/* Даты: везде строка «ГГГГ-ММ-ДД» без времени и часового пояса. Неделя начинается с понедельника. */

const pad = (n) => String(n).padStart(2, '0');
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function isValidDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fromUTC = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Сегодня по местному времени телефона. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso, n) { const d = toUTC(iso); d.setUTCDate(d.getUTCDate() + n); return fromUTC(d); }

/** Семь дат недели, содержащей iso: понедельник … воскресенье. */
export function weekOf(iso) {
  const d = toUTC(iso), dow = (d.getUTCDay() + 6) % 7;
  const mon = addDays(iso, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/** «ГГГГ-ММ» для даты. */
export const monthKey = (iso) => iso.slice(0, 7);

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number), t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

/** Список месяцев от from до to включительно. */
export function monthRange(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}

export function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Границы месяца для запроса: первый день и первый день следующего месяца. */
export function monthBounds(key) { return [key + '-01', addMonths(key, 1) + '-01']; }

export const monthName = (key) => MONTHS_NOM[+key.slice(5, 7) - 1];
export const monthLabel = (key) => `${monthName(key)} ${key.slice(0, 4)}`;
export const monthShort = (key) => MONTHS_SHORT[+key.slice(5, 7) - 1];
export const monthYear = (key) => key.slice(0, 4);

/** «5 ноября» */
export function dayShort(iso) { return `${+iso.slice(8, 10)} ${MONTHS_GEN[+iso.slice(5, 7) - 1]}`; }
/** «среда, 5 ноября» */
export function dayLong(iso) { return `${WEEKDAYS[toUTC(iso).getUTCDay()]}, ${dayShort(iso)}`; }

/** Прогресс месяца: на какой день пришлось сегодня и закончился ли месяц. */
export function monthProgress(today, key) {
  const total = daysInMonth(key), cur = monthKey(today);
  if (cur < key) return { day: 0, days: total, complete: false, future: true };
  if (cur > key) return { day: total, days: total, complete: true, future: false };
  return { day: +today.slice(8, 10), days: total, complete: false, future: false };
}

/** Нужно ли показывать напоминание об экспорте: последние 3 дня месяца и первые 3 дня следующего. */
export function exportReminderDue(today, lastExportISO) {
  const day = +today.slice(8, 10), total = daysInMonth(monthKey(today));
  let periodStart;
  if (day >= total - 2) periodStart = monthKey(today) + '-' + pad(total - 2);
  else if (day <= 3) periodStart = addMonths(monthKey(today), -1) + '-' + pad(daysInMonth(addMonths(monthKey(today), -1)) - 2);
  else return false;
  return !lastExportISO || lastExportISO < periodStart;
}
