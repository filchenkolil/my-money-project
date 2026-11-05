/* Общее состояние приложения. Выбранный месяц один на всю аналитику и историю. */
import { monthKey, addMonths } from './dates.js';

export function createState(today) {
  const listeners = new Set();
  const s = {
    today,
    month: monthKey(today),
    get currentMonth() { return monthKey(this.today); },
    setMonth(key) { if (key === s.month) return; s.month = key; listeners.forEach((fn) => fn('month')); },
    shiftMonth(n) { s.setMonth(addMonths(s.month, n)); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return s;
}
