/* Аналитика v1.0: «Обзор», «Месяц к месяцу», «Категория во времени» и детализация категории. Месяц общий с «Историей». */
import { formatRub, formatAmount, compactRub, formatPct } from '../money.js';
import { monthName, monthShort, monthLabel, dayShort, addMonths } from '../dates.js';
import { monthStripKeys } from '../history.js';
import { overview, compare, categoryView, categoryDetail, tripsDashboard, regularView, paceView } from '../analytics.js';
import { UI } from '../ui/icons.js';
import { rangeLabel } from '../dates.js';
import { topsOf, subsOf } from '../categories.js';
import { PALETTE } from '../seed.js';
import { share } from '../stats.js';
import { esc, hueColor, header } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { monthStripHTML, centerSelected } from '../ui/monthstrip.js';
import { hashFor } from '../router.js';

export const DASHBOARDS = [['overview', 'Обзор'], ['compare', 'Месяц к месяцу'], ['category', 'Категория'], ['regular', 'Регулярные'], ['pace', 'Темп месяца'], ['trips', 'Поездки']];
const dashFromParam = (p) => (DASHBOARDS.some((d) => d[0] === p) ? p : 'overview');
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** Строка изменения: рост оранжевым ▲, снижение зелёным ▼ (малиновый оставлен для действий). Идущий месяц помечается серым. */
function deltaLine({ delta, hasPrev, prevKey, prevTotal, complete, noPrevText }) {
  if (!hasPrev) return `<div class="dl muted">${noPrevText}</div>`;
  const up = delta.diff > 0, same = delta.diff === 0;
  const cls = complete ? (same ? 'muted' : up ? 'up' : 'down') : 'muted';
  const arrow = same ? '' : up ? '▲ ' : '▼ ';
  return `<div class="dl ${cls}">${arrow}${formatPct(Math.abs(delta.pct ?? 0))} к ${esc(monthShort(prevKey).toLowerCase())} (${formatRub(prevTotal)})${complete ? '' : ' · месяц не закончен'}</div>`;
}

function legendDelta(it) {
  if (it.delta.pct === null || it.delta.diff === 0) return '';
  return `<span class="delta ${it.delta.diff > 0 ? 'up' : 'down'}">${it.delta.diff > 0 ? '▲ ' : '▼ '}${formatPct(Math.round(Math.abs(it.delta.pct)))}</span>`;
}

function donut(items, total, center) {
  const r = 78, w = 20, C = 2 * Math.PI * r;
  let off = 0, s = '';
  for (const it of items) {
    const len = (it.amount / total) * C;
    s += `<circle cx="100" cy="100" r="${r}" fill="none" stroke-width="${w}" style="stroke:${it.color}" stroke-dasharray="${Math.max(len - 1.6, 0.6).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 100 100)"/>`;
    off += len;
  }
  return `<div class="donutbox"><svg viewBox="0 0 200 200" class="donut" role="img" aria-label="Диаграмма расходов по категориям">${s}</svg><div class="donutc">${center}</div></div>`;
}

function categoriesWord(n) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? 'категория' : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'категории' : 'категорий';
}

/** Столбцы по месяцам с подписью суммы сверху и месяцем снизу. Нажатие выбирает месяц. */
function monthCols(keys, values, selected, subLabels = null, topLabels = null) {
  const mx = Math.max(...values, 1) * 1.08;
  return `<div class="mscroll" role="group" aria-label="Месяцы">${keys.map((k, i) =>
    `<button type="button" class="mcol" data-act="month" data-v="${k}" aria-pressed="${k === selected}" aria-label="${esc(monthLabel(k))}"><b class="num">${topLabels ? topLabels[i] : compactRub(values[i])}</b><span class="mbar"><i style="height:${Math.max((values[i] / mx) * 100, 0)}%"></i></span><span class="ml">${monthShort(k)}</span><span class="ms num">${subLabels ? subLabels[i] : ''}</span></button>`).join('')}</div>`;
}

export function mountAnalytics(root, ctx, param) {
  const { state } = ctx, dash = dashFromParam(param), expanded = new Set();
  const cat =(id) => ctx.categories.find((c) => c.id === id);
  const keys = () => monthStripKeys([...ctx.expenses, ...ctx.tripExpenses], state.today);
  const td = () => ({ trips: ctx.trips, tripExpenses: ctx.tripExpenses });
  const tripColor = (id) => hueColor(PALETTE[Math.max(0, ctx.trips.findIndex((t) => t.id === id)) % PALETTE.length]);

  function head() {
    return header('Аналитика', `<button type="button" class="ib" data-act="ai" aria-label="Обсуждение AI">${UI.spark}</button>`) + `<div class="dstrip" role="tablist" aria-label="Дашборды">${DASHBOARDS.map(([id, name]) =>
      `<button type="button" class="dchip" role="tab" data-act="dash" data-v="${id}"${id === dash ? ' aria-current="true"' : ''}>${name}</button>`).join('')}</div>`;
  }

  function overviewHTML() {
    const o = overview(ctx.expenses, state.month, state.today, td());
    let h = head() + monthStripHTML(keys(), state.month) + `<div class="pad"><div class="hero"><div class="small muted">Расходы · ${esc(monthLabel(state.month))}</div><div class="big num">${formatAmount(o.total)}<span class="cur">₽</span></div>`;
    if (!o.progress.complete && !o.progress.future) h += `<div class="small muted" style="margin-top:4px">Месяц идёт: ${o.progress.day} из ${o.progress.days} дней</div>`;
    h += deltaLine({ ...o, complete: o.progress.complete, noPrevText: `За ${esc(lower(monthName(o.prevKey)))} данных нет, сравнивать не с чем` }) + '</div>';
    if (!o.items.length) return h + `<div class="empty"><p>В этом месяце расходов пока нет.</p></div></div>`;
    const items = o.items.map((i) => (i.type === 'trip' ? { ...i, label: `${i.name}, ${monthShort(state.month).toLowerCase()} ${state.month.slice(0, 4)}`, color: tripColor(i.tripId) } : { ...i, label: cat(i.categoryId).name, color: hueColor(cat(i.categoryId).hue) }));
    h += donut(items, o.total, `<div class="total num">${items.length}</div><div class="small muted">${categoriesWord(items.length)}</div>`);
    const row = (i) => i.type === 'trip'
      ? `<button type="button" class="legrow" data-act="trip" data-id="${esc(i.tripId)}"><span class="dot sm" style="background:${i.color}"></span><span class="nm">${esc(i.label)}</span><span class="pc num">${formatPct(i.share)}</span><span class="am num">${formatRub(i.amount)}</span></button>`
      : `<button type="button" class="legrow" data-act="cat" data-id="${i.categoryId}"><span class="dot sm" style="background:${i.color}"></span><span class="nm">${esc(i.label)}</span><span class="pc num">${formatPct(i.share)}</span><span class="am num">${formatRub(i.amount)}${legendDelta(i)}</span></button>`;
    const tripItems = items.filter((i) => i.type === 'trip');
    if (tripItems.length) h += '<div class="lbl">Поездки</div><div>' + tripItems.map(row).join('') + '</div>';
    h += '<div class="lbl">Все категории</div><div>' + items.filter((i) => i.type !== 'trip').map(row).join('') + '</div></div>';
    return h;
  }

  function compareHTML() {
    const ks = keys(), c = compare(ctx.expenses, ks, state.month, td());
    let h = head() + '<div class="pad"><div class="hero"><div class="small muted">Расходы · ' + esc(monthLabel(state.month)) + `</div><div class="big num">${formatAmount(c.total)}<span class="cur">₽</span></div>`;
    h += deltaLine({ ...c, complete: state.month < state.today.slice(0, 7), noPrevText: ks[0] === state.month ? 'Первый месяц в данных' : `За ${esc(lower(monthName(c.prevKey)))} данных нет, сравнивать не с чем` }) + '</div>';
    h += monthCols(ks, c.months.map((m) => m.total), state.month);
    if (!c.hasPrev) return h + '<div class="empty"><p>Для сравнения нужны расходы за соседний месяц.</p></div></div>';
    h += `<div class="lbl">По категориям</div><table class="tbl num"><tr><th>Категория</th><th>${monthShort(c.prevKey)}</th><th>${monthShort(state.month)}</th><th>Разница</th></tr>` +
      c.rows.map((r) => `<tr><td>${esc(r.categoryId === '__trips' ? 'Поездки' : cat(r.categoryId)?.name ?? '')}</td><td>${formatAmount(r.prev)}</td><td>${formatAmount(r.cur)}</td><td class="${r.diff > 0 ? 'up' : r.diff < 0 ? 'down' : ''}">${r.diff > 0 ? '+' : r.diff < 0 ? '−' : ''}${formatAmount(Math.abs(r.diff))}</td></tr>`).join('') + '</table></div>';
    return h;
  }

  function categoryHTML() {
    const tops = topsOf(ctx.categories);
    const valid = (v) => { const [k, c, s] = String(v ?? '').split(':'); return (k === 'c' && !!cat(c)) || (k === 's' && cat(s)?.parentId === c && !!cat(c)); }; // категория или подкатегория могли быть удалены
    if (!valid(state.dashCat)) state.dashCat = 'c:' + (tops[0]?.id ?? '');
    const [kind, categoryId, subcategoryId] = state.dashCat.split(':');
    const sel = kind === 's' ? { categoryId, subcategoryId } : { categoryId };
    const name = cat(categoryId).name + (subcategoryId ? ' › ' + cat(subcategoryId).name : '');
    const quick = ['prod', 'inv'].map((id) => cat(id)).filter(Boolean).concat(tops).filter((c, i, a) => a.indexOf(c) === i).slice(0, 2);
    const opts = tops.map((c) => `<option value="c:${c.id}"${state.dashCat === 'c:' + c.id ? ' selected' : ''}>${esc(c.name)}</option>` + subsOf(ctx.categories, c.id).map((s) => `<option value="s:${c.id}:${s.id}"${state.dashCat === `s:${c.id}:${s.id}` ? ' selected' : ''}>${esc(c.name)} › ${esc(s.name)}</option>`).join('')).join('');
    let h = head() + `<div class="pad"><div class="chips" style="margin-top:4px">${quick.map((c) => `<button type="button" class="chip" data-act="quick" data-v="c:${c.id}" aria-pressed="${state.dashCat === 'c:' + c.id}">${esc(c.name)}</button>`).join('')}</div><select class="inp" id="dcat" style="margin-top:8px" aria-label="Категория">${opts}</select>`;
    const ks = keys(), v = categoryView(ctx.expenses, ks, state.month, sel, td());
    if (!v.stats.total) return h + `<div class="empty"><p>В категории «${esc(name)}» расходов пока нет.</p></div></div>`;
    h += `<div class="hero" style="margin-top:16px"><div class="small muted">${esc(name)} · ${esc(monthLabel(state.month))}</div><div class="big num">${formatAmount(v.cur)}<span class="cur">₽</span></div>`;
    if (v.hasPrev) h += deltaLine({ delta: v.delta, hasPrev: true, prevKey: addMonths(state.month, -1), prevTotal: v.prev, complete: state.month < state.today.slice(0, 7) });
    h += '</div>';
    h += monthCols(ks, v.values, state.month, v.shares.map((s, i) => (v.values[i] ? formatPct(Math.round(s)) : '')));
    h += `<div class="grid2" style="margin-top:16px"><div class="stat"><span class="small muted">Среднее в месяц</span><b class="num">${formatRub(v.stats.avg)}</b></div><div class="stat"><span class="small muted">Всего за период</span><b class="num">${formatRub(v.stats.total)}</b></div><div class="stat"><span class="small muted">Минимум</span><b class="num">${formatRub(v.stats.min)}</b></div><div class="stat"><span class="small muted">Максимум</span><b class="num">${formatRub(v.stats.max)}</b></div></div>`;
    if (kind === 'c') h += `<button type="button" class="btn big" style="margin-top:16px" data-act="cat" data-id="${categoryId}">Расходы категории за ${esc(lower(monthName(state.month)))}</button>`;
    return h + '</div>';
  }

  /** «Регулярные»: сумма и изменение, доля регулярных по месяцам (столбцы), категории с разворотом до подкатегорий. */
  function regularHTML() {
    const ks = keys(), v = regularView(ctx.expenses, ks, state.month, td());
    const complete = state.month < state.today.slice(0, 7);
    let h = head() + monthStripHTML(ks, state.month) + `<div class="pad"><div class="hero"><div class="small muted">Регулярные · ${esc(monthLabel(state.month))}</div><div class="big num">${formatAmount(v.cur)}<span class="cur">₽</span></div>`;
    h += deltaLine({ delta: v.delta, hasPrev: v.hasPrev, prevKey: v.prevKey, prevTotal: v.prev, complete, noPrevText: `В ${esc(lower(monthName(v.prevKey)))} регулярных расходов не было` });
    if (v.cur) h += `<div class="small" style="margin-top:4px"><b class="num">${formatPct(v.pct)}</b> <span class="muted">всех расходов месяца</span></div>`;
    h += '</div>';
    if (!v.months.some((m) => m.regular > 0)) return h + '<div class="empty"><p>Регулярных расходов пока нет. Отметьте «Регулярный» при добавлении расхода.</p></div></div>';
    h += '<div class="lbl">Доля регулярных по месяцам</div>' + monthCols(v.months.map((m) => m.key), v.months.map((m) => m.pct), state.month, v.months.map((m) => (m.regular ? compactRub(m.regular) : '')), v.months.map((m) => (m.regular ? formatPct(Math.round(m.pct)) : '—')));
    if (!v.cats.length) return h + '<div class="empty"><p>В этом месяце регулярных расходов нет.</p></div></div>';
    h += '<div class="lbl">Категории регулярных</div>';
    const mx = (c) => Math.max(...c.values, 1);
    for (const c of v.cats) {
      const open = expanded.has(c.categoryId), cc = cat(c.categoryId);
      h += `<button type="button" class="legrow" data-act="rexp" data-id="${esc(c.categoryId)}" aria-expanded="${open}"><span class="dot sm" style="background:${hueColor(cc?.hue)}"></span><span class="nm">${esc(cc?.name ?? '')}</span><span class="mini" aria-hidden="true">${c.values.slice(-6).map((x, i, a) => `<i style="height:${Math.max(Math.round((x / mx(c)) * 100), x ? 12 : 4)}%"${i === a.length - 1 && ks.at(-1) === state.month ? ' class="sel"' : ''}></i>`).join('')}</span><span class="am num">${formatRub(c.cur)}${legendDelta(c)}</span></button>`;
      if (open) h += '<div class="subs">' + c.subs.map((s) => `<div class="subrow"><span class="nm">${esc(s.id ? (cat(s.id)?.name ?? '') : 'Без подкатегории')}</span><span class="small muted num">${formatAmount(s.prev)} → </span><b class="num">${formatAmount(s.cur)}</b></div>`).join('') + '</div>';
    }
    return h + '</div>';
  }

  /** «Темп месяца»: накопленные расходы по дням, выбранный месяц на фоне прошлого. */
  function paceHTML() {
    const ks = keys(), p = paceView(ctx.expenses, state.month, state.today, td());
    let h = head() + monthStripHTML(ks, state.month) + `<div class="pad"><div class="hero"><div class="small muted">Накоплено · ${esc(monthLabel(state.month))}${p.running ? ` · ${p.day}-й день` : ''}</div><div class="big num">${formatAmount(p.total)}<span class="cur">₽</span></div>`;
    if (p.prevAtSame > 0 && p.day > 0) {
      const up = p.delta.diff > 0, same = p.delta.diff === 0;
      h += `<div class="dl ${same ? 'muted' : up ? 'up' : 'down'}">${same ? '' : up ? '▲ ' : '▼ '}${formatPct(Math.abs(p.delta.pct ?? 0))} к ${esc(monthShort(p.prevKey).toLowerCase())} на тот же день (${formatRub(p.prevAtSame)})</div>`;
    } else h += `<div class="dl muted">За ${esc(lower(monthName(p.prevKey)))} данных нет, сравнивать не с чем</div>`;
    h += '</div>';
    if (!p.total && !p.prevTotal) return h + '<div class="empty"><p>Ни в этом, ни в прошлом месяце расходов нет.</p></div></div>';
    const W = 320, H = 180, L = 4, R = 4, T = 8, B = 20, n = Math.max(p.days, p.prevDays), mxv = Math.max(p.total, p.prevTotal, p.projection ?? 0, 1) * 1.08;
    const X = (d) => L + ((d - 1) / Math.max(n - 1, 1)) * (W - L - R), Y = (v) => T + (1 - v / mxv) * (H - T - B);
    const pts = (a) => a.map((v, i) => `${X(i + 1).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const last = p.cur.length ? [X(p.cur.length), Y(p.cur.at(-1))] : null;
    h += `<svg viewBox="0 0 ${W} ${H}" class="pace" role="img" aria-label="Накопленные расходы по дням">` +
      [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${Y(mxv / 1.08 * f).toFixed(1)}" y2="${Y(mxv / 1.08 * f).toFixed(1)}" class="grid"/>`).join('') +
      (p.prev.length ? `<polyline points="${pts(p.prev)}" class="lprev"/>` : '') +
      (p.cur.length > 1 ? `<polyline points="${pts(p.cur)}" class="lcur"/>` : '') +
      (last ? `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4.5" class="dotcur"/>` : '') +
      [1, Math.round(n / 2), n].map((d) => `<text x="${X(d).toFixed(1)}" y="${H - 4}" text-anchor="${d === 1 ? 'start' : d === n ? 'end' : 'middle'}" class="ax">${d}</text>`).join('') + '</svg>';
    h += `<div class="legend"><span><i class="sw cur"></i>${esc(monthShort(p.key))}</span><span><i class="sw prev"></i>${esc(monthShort(p.prevKey))}</span></div>`;
    h += `<div class="grid2" style="margin-top:16px"><div class="stat"><span class="small muted">В среднем в день</span><b class="num">${formatRub(p.perDay)}</b></div><div class="stat"><span class="small muted">${p.running ? 'К концу месяца' : 'Весь месяц'}</span><b class="num">${formatRub(p.running ? p.projection : p.total)}</b></div></div>`;
    if (p.running) h += '<p class="small muted" style="margin:8px 0 0">Прогноз: средний расход в день умножен на число дней месяца. Крупные разовые траты он не учитывает.</p>';
    return h + '</div>';
  }

  /** Дашборд «Поездки»: сравнение поездок между собой (стоимость, дни, стоимость в день, структура по категориям). */
  function tripsHTML() {
    const list = tripsDashboard(td());
    let h = head() + '<div class="pad">';
    if (!list.length) return h + '<div class="empty"><p>Поездок пока нет. Создайте первую на вкладке «Поездки».</p><button type="button" class="btn primary big" data-act="newtrip">Создать поездку</button></div></div>';
    const tc = (id) => ctx.tripCategories.find((c) => c.id === id);
    for (const s of list) {
      h += `<button type="button" class="card tripcard" data-act="trip" data-id="${esc(s.trip.id)}"><div class="row"><b style="flex:1;text-align:left">${esc(s.trip.name)}</b><span class="small muted">${s.days} дн.</span></div><div class="small muted" style="text-align:left">${esc(rangeLabel(s.trip.start, s.trip.end))}</div><div class="total num" style="margin:4px 0;text-align:left">${formatRub(s.totalRub)}</div><div class="small muted num" style="text-align:left">${s.count ? formatRub(s.perDay) + ' в день' : 'расходов пока нет'}</div>`;
      if (s.byCategory.length) {
        h += `<div class="stack" style="margin:10px 0 8px">${s.byCategory.map((c) => `<i style="width:${share(c.amount, s.totalRub)}%;background:${hueColor(tc(c.categoryId)?.hue ?? 200)}"></i>`).join('')}</div>`;
        h += `<div class="chips" style="gap:4px 10px">${s.byCategory.slice(0, 4).map((c) => `<span class="small"><span class="dot sm" style="background:${hueColor(tc(c.categoryId)?.hue ?? 200)};display:inline-block"></span> ${esc(tc(c.categoryId)?.name ?? '')} ${formatPct(Math.round(share(c.amount, s.totalRub)))}</span>`).join('')}</div>`;
      }
      h += '</button>';
    }
    return h + '</div>';
  }

  function render() {
    const t = root.scrollTop, scroller = root.querySelector('.mscroll, .mstrip'), sl = scroller?.scrollLeft;
    root.innerHTML = dash === 'compare' ? compareHTML() : dash === 'category' ? categoryHTML() : dash === 'trips' ? tripsHTML() : dash === 'regular' ? regularHTML() : dash === 'pace' ? paceHTML() : overviewHTML();
    root.scrollTop = t;
    centerSelected(root);
    if (sl != null) { const s = root.querySelector('.mscroll, .mstrip'); if (s) s.scrollLeft = sl; }
    const d = root.querySelector('.dchip[aria-current]'), strip = root.querySelector('.dstrip');
    if (d && strip) strip.scrollLeft = Math.max(0, d.offsetLeft - 40);
  }

  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const v = b.dataset;
    if (v.act === 'dash') location.hash = hashFor('analytics', v.v === 'overview' ? '' : v.v);
    else if (v.act === 'month') state.setMonth(v.v);
    else if (v.act === 'cat') location.hash = hashFor('cat', v.id);
    else if (v.act === 'trip') location.hash = hashFor('trip', v.id);
    else if (v.act === 'newtrip') location.hash = hashFor('tripedit', 'new');
    else if (v.act === 'ai') location.hash = hashFor('ai');
    else if (v.act === 'rexp') { if (!expanded.delete(v.id)) expanded.add(v.id); render(); }
    else if (v.act === 'quick') { state.dashCat = v.v; render(); }
  };
  root.onchange = (ev) => { if (ev.target.id === 'dcat') { state.dashCat = ev.target.value; render(); } };

  // Свайп по экрану переключает дашборды (не мешая прокрутке лент и столбцов)
  let sx = 0, sy = 0, ignore = false;
  root.ontouchstart = (ev) => { const t = ev.touches[0]; sx = t.clientX; sy = t.clientY; ignore = !!ev.target.closest('.mscroll, .mstrip, .dstrip, select, input'); };
  root.ontouchend = (ev) => {
    if (ignore) return;
    const t = ev.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45) return;
    const i = DASHBOARDS.findIndex((d) => d[0] === dash), j = i + (dx < 0 ? 1 : -1);
    if (j >= 0 && j < DASHBOARDS.length) location.hash = hashFor('analytics', j === 0 ? '' : DASHBOARDS[j][0]);
  };

  const off = state.subscribe((what) => { if (what === 'month') render(); });
  if (!ctx.expenses.length && !ctx.tripExpenses.length) {
    root.innerHTML = header('Аналитика') + '<div class="pad"><div class="empty"><h2>Расходов пока нет</h2><p>Диаграммы появятся, когда вы добавите первые расходы.</p><button type="button" class="btn primary big" data-act="addfirst">Добавить расход</button></div></div>';
    root.onclick = (ev) => { if (ev.target.closest('[data-act="addfirst"]')) location.hash = hashFor('add'); };
    return { dispose: off };
  }
  render();
  return { dispose: off };
}

/** Детализация категории за выбранный месяц: итог, подкатегории, расходы с комментариями. */
export function mountCategoryDetail(root, ctx, id) {
  const { state } = ctx, c = ctx.categories.find((x) => x.id === id);
  const subName = (sid) => ctx.categories.find((x) => x.id === sid)?.name ?? '';
  function render() {
    const d = categoryDetail(ctx.expenses, state.month, id, subName);
    const prevKey = addMonths(state.month, -1);
    const prev = categoryView(ctx.expenses, [prevKey, state.month], state.month, { categoryId: id });
    let h = header(c.name, `<span class="dot" style="background:${hueColor(c.hue)};width:44px;height:44px">${icon(c.icon)}</span>`, true) + '<div class="pad">';
    h += `<div class="card"><div class="small muted">${esc(monthLabel(state.month))}</div><div class="total num">${formatRub(d.total)}</div>`;
    if (prev.hasPrev) h += deltaLine({ delta: prev.delta, hasPrev: true, prevKey, prevTotal: prev.prev, complete: state.month < state.today.slice(0, 7) });
    h += '</div>';
    if (d.subs.length) h += '<div class="lbl">Подкатегории</div>' + d.subs.map((s) => `<div style="margin:8px 0"><div class="row"><span style="flex:1">${esc(s.name)}</span><b class="num">${formatRub(s.amount)}</b></div><div class="bar" style="margin-top:4px"><i style="width:${share(s.amount, d.total)}%;background:${hueColor(c.hue)}"></i></div></div>`).join('');
    if (!d.list.length) return void (root.innerHTML = h + '<div class="empty"><p>В этом месяце расходов в категории нет.</p></div></div>');
    h += `<div class="lbl"><span>Расходы</span><span class="num opt">${d.list.length}</span></div>` + d.list.map((e) =>
      `<button type="button" class="rec" data-act="edit" data-id="${esc(e.id)}"><span class="sp"><span class="t num">${formatRub(e.amount)}</span>${e.note ? `<br><span class="n">${esc(e.note)}</span>` : ''}</span><span class="muted small" style="white-space:nowrap">${esc(dayShort(e.date))}</span></button>`).join('');
    root.innerHTML = h + '</div>';
  }
  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'back') location.hash = hashFor('analytics');
    else if (b.dataset.act === 'edit') location.hash = hashFor('edit', b.dataset.id);
  };
  const off = state.subscribe((w) => { if (w === 'month') render(); });
  render();
  return { dispose: off };
}
