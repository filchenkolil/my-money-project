/* Деньги: сумма хранится целым числом копеек, чтобы не копить ошибки округления. */

export const MAX_KOPECKS = 10_000_000 * 100; // верхняя граница одного расхода: 10 000 000 ₽
const SPACES = /[\s  ]/g;

/** Разбор введённой суммы. Возвращает { ok: true, kopecks } или { ok: false, reason: 'format' | 'zero' | 'too_big' }. */
export function parseAmount(text) {
  const s = String(text ?? '').replace(SPACES, '');
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return { ok: false, reason: 'format' };
  if (m[1].replace(/^0+/, '').length > 9) return { ok: false, reason: 'too_big' };
  const kopecks = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  if (kopecks === 0) return { ok: false, reason: 'zero' };
  if (kopecks > MAX_KOPECKS) return { ok: false, reason: 'too_big' };
  return { ok: true, kopecks };
}

export const AMOUNT_ERRORS = {
  format: 'Сумма введена в неверном формате. Введите число, например 1 500 или 1 500,50.',
  zero: 'Сумма должна быть больше нуля.',
  too_big: 'Сумма слишком большая. Проверьте, нет ли лишних цифр.',
};

/** Группировка разрядов пробелом: 1500 → «1 500». */
function group(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Копейки → «1 500» или «1 500,50» (копейки показываются, только если они есть). */
export function formatAmount(kopecks) {
  const sign = kopecks < 0 ? '−' : '';
  const abs = Math.abs(Math.round(kopecks));
  const rub = Math.floor(abs / 100), kop = abs % 100;
  return sign + group(String(rub)) + (kop ? ',' + String(kop).padStart(2, '0') : '');
}

/** Копейки → «1 500,50 ₽» (неразрывный пробел перед знаком рубля). */
export function formatRub(kopecks) {
  return formatAmount(kopecks) + ' ₽';
}

/** Живое форматирование поля ввода: расставляет пробелы по ходу набора, неверный текст оставляет как есть. */
export function formatInput(value) {
  const raw = String(value).replace(SPACES, '');
  const m = /^(\d*)([.,]\d{0,2})?$/.exec(raw);
  if (!m) return String(value);
  return group(m[1]) + (m[2] ?? '');
}

/** Копейки → строка для поля ввода («1 500,5» → «1 500,50»). */
export function toInputString(kopecks) {
  return formatInput(String(Math.floor(kopecks / 100)) + (kopecks % 100 ? ',' + String(kopecks % 100).padStart(2, '0') : ''));
}

/** Пересчёт валюты (v2): сумма в копейках × курс (до 4 знаков), округление до копейки. */
export function convert(kopecks, rate) {
  return Math.round(kopecks * rate);
}
