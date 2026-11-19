/* Поездки (v2): курс и пересчёт в рубли, итоги поездки, вклад поездок в месяцы, проверки. Страницы здесь нет, поэтому всё проверяется тестами.
   Суммы расходов поездки хранятся в копейках (или центах и т.п.) своей валюты; рубли считаются по курсу поездки и не хранятся.
   Курс хранится целым числом десятитысячных (2,3500 → 23500), чтобы не копить ошибки округления. */
import { MAX_KOPECKS, parseAmount, AMOUNT_ERRORS, formatAmount, formatRub } from './money.js';
import { isValidDate, monthKey, daysBetween, dayShort } from './dates.js';

export const RATE_SCALE = 10000;
export const MAX_RATE_E4 = 10000 * RATE_SCALE; // 10 000 ₽ за единицу валюты — с запасом для любой реальной валюты
export const CURRENCIES = [['RUB', 'российский рубль'], ['TRY', 'турецкая лира'], ['EUR', 'евро'], ['USD', 'доллар США'], ['GEL', 'грузинский лари'], ['AED', 'дирхам ОАЭ']];

export const RATE_ERRORS = {
  format: 'Курс введён в неверном формате. Введите число, например 2,35 или 2,3500.',
  zero: 'Курс должен быть больше нуля.',
  too_big: 'Курс слишком большой. Проверьте, нет ли лишних цифр.',
};

/** «2,35» / «2.3500» / «2 3» → { ok, rateE4 } или { ok: false, reason }. */
export function parseRate(text) {
  const s = String(text ?? '').replace(/[\s ]/g, '');
  const m = /^(\d+)(?:[.,](\d{1,4}))?$/.exec(s);
  if (!m) return { ok: false, reason: 'format' };
  const rateE4 = Number(m[1]) * RATE_SCALE + Number((m[2] ?? '').padEnd(4, '0') || 0);
  if (!Number.isSafeInteger(rateE4) || rateE4 > MAX_RATE_E4) return { ok: false, reason: 'too_big' };
  if (rateE4 === 0) return { ok: false, reason: 'zero' };
  return { ok: true, rateE4 };
}

/** Курс для показа (две цифры после запятой) и для поля ввода (четыре). */
export const formatRate = (rateE4) => (Math.round(rateE4 / 100) / 100).toFixed(2).replace('.', ',');
export const formatRateFull = (rateE4) => (rateE4 / RATE_SCALE).toFixed(4).replace('.', ',');

/** Копейки валюты × курс → копейки рублей, с округлением половины вверх. Целые числа большой длины, без потерь точности. */
export function toRub(kopecks, rateE4) {
  const n = BigInt(Math.round(kopecks)) * BigInt(rateE4);
  return Number((n * 2n + BigInt(RATE_SCALE)) / BigInt(RATE_SCALE * 2));
}

/** Рубли расхода поездки: рублёвые траты остаются как есть, остальные пересчитываются по курсу поездки. */
export const expenseRub = (e, trip) => (e.isRub || trip.currency === 'RUB' ? e.amount : toRub(e.amount, trip.rateE4));

const sum = (a) => a.reduce((s, x) => s + x, 0);

/** Сводка по одной поездке: полная стоимость (с тратами до начала), в валюте и рублях, по категориям и месяцам. */
export function tripSummary(trip, expenses) {
  const own = expenses.filter((e) => e.tripId === trip.id);
  const rub = own.map((e) => expenseRub(e, trip));
  const byCat = {}, byMonth = {};
  own.forEach((e, i) => { byCat[e.categoryId] = (byCat[e.categoryId] ?? 0) + rub[i]; const k = monthKey(e.date); byMonth[k] = (byMonth[k] ?? 0) + rub[i]; });
  const totalRub = sum(rub), days = daysBetween(trip.start, trip.end).length;
  return {
    count: own.length, totalRub, days, perDay: days ? Math.round(totalRub / days) : 0,
    localSum: sum(own.filter((e) => !e.isRub && trip.currency !== 'RUB').map((e) => e.amount)),
    rubSum: sum(own.filter((e, i) => e.isRub || trip.currency === 'RUB').map((e) => e.amount)),
    beforeStartRub: sum(own.map((e, i) => (e.date < trip.start ? rub[i] : 0))),
    byCategory: Object.entries(byCat).map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount),
    byMonth: Object.entries(byMonth).map(([key, amount]) => ({ key, amount })).sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
}

/** Вклад поездок в месяцы строго по дате каждого расхода: { 'ГГГГ-ММ': рубли }. */
export function tripMonthTotals(trips, expenses) {
  const byId = new Map(trips.map((t) => [t.id, t])), out = {};
  for (const e of expenses) { const t = byId.get(e.tripId); if (!t) continue; const k = monthKey(e.date); out[k] = (out[k] ?? 0) + expenseRub(e, t); }
  return out;
}

/** Сегменты поездок в диаграмме месяца: по одному на поездку, только расходы с датами этого месяца. */
export function monthTripSegments(trips, expenses, key) {
  const out = [];
  for (const t of trips) {
    const amount = sum(expenses.filter((e) => e.tripId === t.id && monthKey(e.date) === key).map((e) => expenseRub(e, t)));
    if (amount > 0) out.push({ tripId: t.id, name: t.name, amount });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/** Стоимость поездки до и после смены курса (рублёвые траты не меняются). */
export function previewRateChange(trip, expenses, rateE4) {
  const own = expenses.filter((e) => e.tripId === trip.id);
  return { before: sum(own.map((e) => expenseRub(e, trip))), after: sum(own.map((e) => expenseRub(e, { ...trip, rateE4 }))) };
}

/* ---------- проверки ---------- */
export const MAX_TRIP_NAME = 30;
const clean = (s) => String(s ?? '').trim();

/** Проверка данных поездки. existing: уже созданные поездки (для уникальности названия), selfId: правка этой поездки. */
export function checkTrip(t, existing = [], selfId = null) {
  const name = clean(t.name), currency = clean(t.currency).toUpperCase();
  if (!name) return { ok: false, field: 'name', message: 'Введите название поездки.' };
  if (name.length > MAX_TRIP_NAME) return { ok: false, field: 'name', message: `Название не длиннее ${MAX_TRIP_NAME} знаков.` };
  if (existing.some((x) => x.id !== selfId && clean(x.name).toLowerCase() === name.toLowerCase() && x.start === t.start && x.end === t.end)) return { ok: false, field: 'name', message: 'Такая поездка с этими датами уже есть.' };
  if (!isValidDate(t.start) || !isValidDate(t.end)) return { ok: false, field: 'dates', message: 'Укажите даты начала и окончания.' };
  if (t.end < t.start) return { ok: false, field: 'dates', message: 'Окончание не может быть раньше начала.' };
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, field: 'currency', message: 'Валюта: три латинские буквы кода ISO, например TRY.' };
  let rateE4 = 10000;
  if (currency !== 'RUB') {
    const r = parseRate(t.rate);
    if (!r.ok) return { ok: false, field: 'rate', message: RATE_ERRORS[r.reason] };
    rateE4 = r.rateE4;
  }
  return { ok: true, trip: { name, start: t.start, end: t.end, currency, rateE4 } };
}

/** Проверка расхода поездки (сумма уже в копейках). */
export function checkTripExpense(e, trips, categories) {
  if (!Number.isInteger(e.amount) || e.amount <= 0 || e.amount > MAX_KOPECKS) return 'Некорректная сумма.';
  if (!isValidDate(e.date)) return 'Некорректная дата.';
  if (!trips.some((t) => t.id === e.tripId)) return 'Выберите поездку.';
  if (!categories.some((c) => c.id === e.categoryId)) return 'Выберите категорию поездки.';
  if (clean(e.note).length > 200) return 'Комментарий не длиннее 200 знаков.';
  return null;
}

/**
 * Куда перенести расходы удаляемой поездки: в другую поездку или в обычные категории (станут обычными расходами в рублях).
 * Значения: «t:<id поездки>» и «c:<категория>|<подкатегория>».
 */
export function tripTransferOptions(trips, removedId, regularOptions = []) {
  return [
    ...trips.filter((t) => t.id !== removedId).sort((a, b) => (a.start < b.start ? 1 : -1)).map((t) => ({ value: 't:' + t.id, label: 'Поездка «' + t.name + '»' })),
    ...regularOptions.map((o) => ({ value: 'c:' + o.value, label: o.label })),
  ];
}
export function parseTripTarget(value) {
  if (!value) return null;
  if (value.startsWith('t:')) return { tripId: value.slice(2) };
  if (value.startsWith('c:')) { const [categoryId, sub] = value.slice(2).split('|'); return categoryId ? { categoryId, subcategoryId: sub || null } : null; }
  return null;
}

/**
 * Что получится из расхода поездки при переносе: { kind: 'trip', record } (в другую поездку) или { kind: 'regular', record }.
 * Если валюты поездок совпадают, сумма остаётся в валюте; иначе фиксируется в рублях по курсу прежней поездки.
 */
export function moveTripExpense(e, fromTrip, target, toTrip = null) {
  if (target.tripId) {
    const same = toTrip.currency === fromTrip.currency;
    return { kind: 'trip', record: { ...e, tripId: toTrip.id, amount: same || e.isRub ? e.amount : expenseRub(e, fromTrip), isRub: same ? e.isRub : true } };
  }
  const amount = expenseRub(e, fromTrip);
  return { kind: 'regular', record: { id: e.id, amount, date: e.date, categoryId: target.categoryId, subcategoryId: target.subcategoryId ?? null, note: e.note ?? '', isRegular: false, createdAt: e.createdAt } };
}

/* ---------- форма расхода поездки ---------- */

export const TRIP_FORM_ERRORS = { trip: 'Выберите поездку.', category: 'Выберите категорию поездки.', ...AMOUNT_ERRORS };

/** Проверка формы расхода поездки. tf: { tripId, categoryId, rub }. Сначала поездка, затем категория, затем сумма. */
export function checkTripForm(f, tf, trips) {
  const trip = trips.find((t) => t.id === tf.tripId);
  if (!trip) return { ok: false, field: 'trip', message: TRIP_FORM_ERRORS.trip };
  if (!tf.categoryId) return { ok: false, field: 'category', message: TRIP_FORM_ERRORS.category };
  const a = parseAmount(f.amount);
  if (!a.ok) return { ok: false, field: 'amount', message: TRIP_FORM_ERRORS[a.reason] };
  return { ok: true, expense: { tripId: trip.id, categoryId: tf.categoryId, amount: a.kopecks, isRub: !!tf.rub || trip.currency === 'RUB', date: f.date, note: f.note.trim() } };
}

/** Какую поездку предложить: ту, чьи даты включают дату расхода; иначе последнюю использованную; иначе самую свежую. */
export function defaultTripId(trips, date, lastId = null) {
  const within = trips.filter((t) => t.start <= date && date <= t.end).sort((a, b) => (a.start < b.start ? 1 : -1));
  if (within.length) return within[0].id;
  if (lastId && trips.some((t) => t.id === lastId)) return lastId;
  return [...trips].sort((a, b) => (a.start < b.start ? 1 : -1))[0]?.id ?? null;
}

/** Строка под полем суммы: пересчёт по курсу поездки. */
export function conversionText(trip, amountText, rub) {
  if (!trip) return '';
  if (trip.currency === 'RUB' || rub) return 'Сумма в рублях, пересчёт не нужен.';
  const r = parseAmount(amountText), rate = formatRate(trip.rateE4);
  return r.ok ? `≈ ${formatRub(toRub(r.kopecks, trip.rateE4))} по курсу ${rate} ₽ за 1 ${trip.currency}` : `Сумма в ${trip.currency}, в аналитике пересчитается в рубли по курсу поездки (${rate}).`;
}

/** «было → стало» для расхода поездки. n: { trip(id) → название, cat(id) → название, tripOf(id) → поездка }. */
export function diffTripExpense(old, next, n) {
  const out = [], none = 'нет';
  const money = (e) => { const t = n.tripOf(e.tripId); return e.isRub || !t || t.currency === 'RUB' ? formatRub(e.amount) : `${formatAmount(e.amount)} ${t.currency}`; };
  if (old.tripId !== next.tripId) out.push({ label: 'Поездка', from: n.trip(old.tripId), to: n.trip(next.tripId) });
  if (old.categoryId !== next.categoryId) out.push({ label: 'Категория поездки', from: n.cat(old.categoryId), to: n.cat(next.categoryId) });
  if (old.amount !== next.amount || !!old.isRub !== !!next.isRub || old.tripId !== next.tripId) { const a = money(old), b = money(next); if (a !== b) out.push({ label: 'Сумма', from: a, to: b }); }
  if ((old.note ?? '') !== next.note) out.push({ label: 'Комментарий', from: old.note || none, to: next.note || none });
  if (old.date !== next.date) out.push({ label: 'Дата', from: dayShort(old.date), to: dayShort(next.date) });
  return out;
}

/**
 * Какую валюту предложить для нового расхода поездки (true = рубли, false = валюта поездки).
 * 1) как в последнем расходе этой же категории в этой поездке; 2) для билетов («tc.tkt») рубли; 3) иначе валюта поездки.
 * У рублёвой поездки валюта одна, всегда false. Пользователь может переключить вручную.
 */
export function suggestRub(trip, tripExpenses, categoryId) {
  if (!trip || trip.currency === 'RUB') return false;
  const same = tripExpenses.filter((e) => e.tripId === trip.id && e.categoryId === categoryId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0)));
  if (same.length) return !!same[0].isRub;
  return categoryId === 'tc.tkt';
}
