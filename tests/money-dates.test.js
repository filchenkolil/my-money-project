import { test, eq, ok } from './harness.js';
import { parseAmount, formatAmount, formatRub, formatInput, toInputString, convert, MAX_KOPECKS } from '../js/money.js';
import * as D from '../js/dates.js';

/* ---------- деньги ---------- */
test('сумма: целые, с копейками, с пробелами и с точкой', () => {
  eq(parseAmount('1500'), { ok: true, kopecks: 150000 });
  eq(parseAmount('1 500'), { ok: true, kopecks: 150000 });
  eq(parseAmount('1 500,50'), { ok: true, kopecks: 150050 });
  eq(parseAmount('1500.5'), { ok: true, kopecks: 150050 });
  eq(parseAmount('0,05'), { ok: true, kopecks: 5 });
  eq(parseAmount('12 500,5'), { ok: true, kopecks: 1250050 });
});

test('сумма: неверный формат, ноль, отрицательная, слишком большая', () => {
  for (const bad of ['15оо', '', ' ', 'abc', '-5', '1,234', '1.2.3', '1,', ',5', '1 5 0,5,0', '1e3']) eq(parseAmount(bad).reason, 'format', `«${bad}»`);
  eq(parseAmount('0').reason, 'zero');
  eq(parseAmount('0,00').reason, 'zero');
  eq(parseAmount('10 000 000,01').reason, 'too_big');
  eq(parseAmount('99999999999999').reason, 'too_big');
  eq(parseAmount('10 000 000'), { ok: true, kopecks: MAX_KOPECKS });
});

test('сумма: копейки без ошибок плавающей точки', () => {
  // 0,1 + 0,2 в обычных числах даёт 0.30000000000000004; в копейках всё точно
  eq(parseAmount('0,1').kopecks + parseAmount('0,2').kopecks, parseAmount('0,3').kopecks);
  eq(parseAmount('19,99').kopecks * 3, 5997);
  eq(parseAmount('1,15').kopecks, 115);
});

test('форматирование суммы', () => {
  eq(formatAmount(150000), '1 500');
  eq(formatAmount(150050), '1 500,50');
  eq(formatAmount(5), '0,05');
  eq(formatAmount(0), '0');
  eq(formatAmount(1234567890), '12 345 678,90');
  eq(formatAmount(-250000), '−2 500');
  eq(formatRub(12345600), '123 456 ₽');
});

test('живой ввод: пробелы по ходу набора, неверный текст не трогаем', () => {
  eq(formatInput('1000'), '1 000');
  eq(formatInput('12500,5'), '12 500,5');
  eq(formatInput('1 0000'), '10 000');
  eq(formatInput('1500,567'), '1500,567'); // третья цифра после запятой не принимается, текст остаётся для ошибки
  eq(formatInput('15оо'), '15оо');
  eq(formatInput(''), '');
  eq(toInputString(150050), '1 500,50');
  eq(toInputString(100), '1');
});

test('пересчёт валюты округляется до копейки', () => {
  eq(convert(100000, 2.35), 235000);
  eq(convert(333, 2.3456), 781); // 781.0 → 781 копеек
  eq(convert(1, 0.4999), 0);
  eq(convert(1, 0.5), 1);
});

/* ---------- даты ---------- */
test('проверка даты', () => {
  ok(D.isValidDate('2026-11-05'));
  ok(D.isValidDate('2028-02-29'));
  ok(!D.isValidDate('2026-02-29'));
  ok(!D.isValidDate('2026-13-01'));
  ok(!D.isValidDate('2026-4-5'));
  ok(!D.isValidDate(''));
});

test('неделя начинается с понедельника', () => {
  eq(D.weekOf('2026-11-04'), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  eq(D.weekOf('2026-11-08')[0], '2026-11-02'); // воскресенье относится к неделе, которая началась в понедельник
  eq(D.weekOf('2026-11-02')[0], '2026-11-02');
  eq(D.weekOf('2026-12-31'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
});

test('границы месяцев и года', () => {
  eq(D.addMonths('2026-12', 1), '2027-01');
  eq(D.addMonths('2027-01', -1), '2026-12');
  eq(D.addMonths('2026-10', -13), '2025-09');
  eq(D.monthRange('2026-09', '2027-01'), ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
  eq(D.daysInMonth('2026-02'), 28);
  eq(D.daysInMonth('2028-02'), 29);
  eq(D.daysInMonth('2026-11'), 30);
  eq(D.monthBounds('2026-12'), ['2026-12-01', '2027-01-01']);
  eq(D.addDays('2026-03-01', -1), '2026-02-28');
  eq(D.addDays('2028-03-01', -1), '2028-02-29');
});

test('«сегодня» берётся по местному времени', () => {
  eq(D.todayISO(new Date(2026, 10, 5, 23, 59)), '2026-11-05');
  eq(D.todayISO(new Date(2026, 10, 5, 0, 1)), '2026-11-05');
  eq(D.todayISO(new Date(2027, 0, 1, 0, 0)), '2027-01-01');
});

test('подписи дат по-русски', () => {
  eq(D.monthLabel('2026-10'), 'Октябрь 2026');
  eq(D.monthShort('2027-01'), 'Янв');
  eq(D.dayShort('2026-11-05'), '5 ноября');
  eq(D.dayLong('2026-11-05'), 'четверг, 5 ноября');
});

test('прогресс месяца: идёт, закончился, ещё не наступил', () => {
  eq(D.monthProgress('2026-11-05', '2026-11'), { day: 5, days: 30, complete: false, future: false });
  eq(D.monthProgress('2026-11-05', '2026-10'), { day: 31, days: 31, complete: true, future: false });
  eq(D.monthProgress('2026-11-05', '2026-12'), { day: 0, days: 31, complete: false, future: true });
});

test('напоминание об экспорте: последние 3 дня месяца и первые 3 дня следующего', () => {
  ok(!D.exportReminderDue('2026-11-05', null));
  ok(!D.exportReminderDue('2026-11-27', null));
  ok(D.exportReminderDue('2026-11-28', null));
  ok(D.exportReminderDue('2026-11-30', '2026-10-31'));
  ok(!D.exportReminderDue('2026-11-30', '2026-11-29'));      // экспорт уже сделан в этом окне
  ok(D.exportReminderDue('2026-12-02', '2026-11-20'));       // не успели в конце ноября
  ok(!D.exportReminderDue('2026-12-02', '2026-11-30'));
  ok(!D.exportReminderDue('2026-12-04', null));
  ok(D.exportReminderDue('2027-01-01', null));               // переход через год
  ok(D.exportReminderDue('2028-02-27', null));               // 29 февраля: последние три дня 27–29
  ok(!D.exportReminderDue('2028-02-26', null));
});
