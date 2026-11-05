/* Минимальный тестовый каркас для браузера. Результат пишется на страницу и в консоль. */

const tests = [];
export const test = (name, fn) => tests.push({ name, fn });

const norm = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? v.map(norm) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]))) : v);
const show = (v) => JSON.stringify(norm(v));
export function eq(actual, expected, msg = '') {
  if (show(actual) !== show(expected)) throw new Error(`${msg} ожидалось ${show(expected)}, получено ${show(actual)}`.trim());
}
export function ok(cond, msg = 'условие не выполнено') { if (!cond) throw new Error(msg); }
export async function rejects(promiseFn, code) {
  try { await promiseFn(); } catch (e) { if (code && e.code !== code) throw new Error(`ожидалась ошибка «${code}», получена «${e.code ?? e.message}»`); return; }
  throw new Error('ожидалась ошибка, но её не было');
}

export async function runAll(container) {
  let pass = 0; const fails = [];
  for (const t of tests) {
    try { await t.fn(); pass++; } catch (e) { fails.push(`${t.name}: ${e.message}`); }
  }
  const lines = [`ИТОГО: ${pass} из ${tests.length} прошли, ошибок ${fails.length}`, ...fails.map((f) => 'ОШИБКА ' + f)];
  container.textContent = lines.join('\n');
  container.dataset.done = '1';
  lines.forEach((l) => console.log(l));
  return fails.length;
}
