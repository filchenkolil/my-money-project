/* Курс валюты к рублю по данным ЦБ РФ (открытый JSON cbr-xml-daily.ru, доступен браузеру без ключа).
   Курс на дату поездки берётся из архива; если на эту дату курса нет (выходной), берётся ближайший предыдущий. Для будущих дат берётся самый свежий. */
const BASE = 'https://www.cbr-xml-daily.ru';
const cache = new Map();

/** Курс в десятитысячных долях рубля за единицу валюты из ответа ЦБ или null. */
export function rateFromCbr(json, code) {
  const v = json?.Valute?.[String(code).toUpperCase()];
  if (!v || !(v.Value > 0) || !(v.Nominal > 0)) return null;
  const e4 = Math.round((v.Value / v.Nominal) * 10000);
  return e4 > 0 ? e4 : null;
}

const addDay = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function getJson(url, fetcher) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), 7000) : null;
  try { const r = await fetcher(url, ctl ? { signal: ctl.signal } : undefined); return r.ok ? await r.json() : null; } catch { return null; } finally { if (timer) clearTimeout(timer); }
}

/**
 * Курс валюты на дату. Возвращает { rateE4, date, latest } или null, если получить не удалось (нет сети, неизвестная валюта).
 * Для подмены в автотестах: globalThis.__mymoneyRates = (code, dateISO) => ({ rateE4, date, latest }) | null.
 */
export async function fetchRate(code, dateISO, todayISO, fetcher = (u, o) => fetch(u, o)) {
  const c = String(code).toUpperCase();
  if (globalThis.__mymoneyRates) return globalThis.__mymoneyRates(c, dateISO);
  if (!/^[A-Z]{3}$/.test(c) || c === 'RUB') return null;
  const latest = !dateISO || dateISO >= todayISO, key = c + '|' + (latest ? 'latest:' + todayISO : dateISO);
  if (cache.has(key)) return cache.get(key);
  let res = null;
  if (latest) {
    const j = await getJson(BASE + '/daily_json.js', fetcher), e4 = rateFromCbr(j, c);
    if (e4) res = { rateE4: e4, date: todayISO, latest: true };
  } else {
    for (let i = 0; i < 8 && !res; i++) {
      const d = addDay(dateISO, -i), j = await getJson(`${BASE}/archive/${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}/daily_json.js`, fetcher);
      const e4 = rateFromCbr(j, c);
      if (e4) res = { rateE4: e4, date: d, latest: false };
      else if (j) break; // архив ответил, но такой валюты в нём нет: дальше искать незачем
    }
  }
  if (res) cache.set(key, res);
  return res;
}
