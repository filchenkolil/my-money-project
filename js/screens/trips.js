/* Поездки (v2): список, экран поездки с полной стоимостью, создание и правка, удаление с переносом расходов. */
import { formatRub, formatAmount } from '../money.js';
import { dayShort, rangeLabel, monthName } from '../dates.js';
import { share } from '../stats.js';
import { StoreError } from '../store.js';
import { CURRENCIES, tripSummary, formatRate, formatRateFull, parseRate, RATE_ERRORS, previewRateChange, tripTransferOptions, parseTripTarget, expenseRub, checkTrip } from '../trips.js';
import { subsOf, topsOf } from '../categories.js';
import { expenseWord } from '../form.js';
import { icon } from '../ui/icons.js';
import { esc, hueColor, header, sheetHTML } from '../ui/dom.js';
import { hashFor } from '../router.js';

const fail = (e) => (e instanceof StoreError ? e.message : 'Не удалось сохранить. Данные не изменились, попробуйте ещё раз.');
const tcat = (ctx, id) => ctx.tripCategories.find((c) => c.id === id);
const colorOf = (ctx, id) => hueColor(tcat(ctx, id)?.hue ?? 200);
export const tripDot = (c, size = 40) => `<span class="dot" style="--h:${c?.hue ?? 200};width:${size}px;height:${size}px">${icon(c?.icon ?? 'tag')}</span>`;

/** Сумма расхода поездки для списков: в валюте (если не рубли) и рядом рубли. */
export function tripAmountHTML(e, trip) {
  if (e.isRub || trip.currency === 'RUB') return `<span class="a num">${formatRub(e.amount)}</span>`;
  return `<span class="a num">${formatAmount(e.amount)} ${esc(trip.currency)}<br><span class="muted small" style="font-weight:400">${formatRub(expenseRub(e, trip))}</span></span>`;
}

/* ---------- список поездок ---------- */
export function mountTrips(root, ctx) {
  let disposed = false;
  function html() {
    const btn = '<button type="button" class="btn" style="padding:8px 12px" data-act="new">Новая поездка</button>';
    let h = header('Поездки', btn);
    if (!ctx.trips.length) {
      return h + '<div class="pad"><div class="heroc"><svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true"><circle cx="48" cy="48" r="38" fill="#fff" fill-opacity=".55" stroke="#111" stroke-width="2"/><path d="M30 50l36-17-12 34-6-14z" fill="#E8499A"/></svg><h2>Поездок пока нет</h2><p>Расходы в поездке копятся отдельно и не смешиваются с обычными. Билеты, купленные заранее, тоже войдут в стоимость.</p><button type="button" class="btn primary big" data-act="new">Создать первую поездку</button></div></div>';
    }
    h += '<div class="pad">';
    for (const t of ctx.trips) {
      const s = tripSummary(t, ctx.tripExpenses);
      h += `<button type="button" class="card tripcard" data-act="open" data-id="${esc(t.id)}"><div class="row"><b style="flex:1;text-align:left">${esc(t.name)}</b><span class="small muted">${s.days} дн.</span></div><div class="small muted" style="text-align:left">${esc(rangeLabel(t.start, t.end))} · ${esc(t.currency)}</div><div class="total num" style="margin:4px 0;text-align:left">${formatRub(s.totalRub)}</div>`;
      if (s.beforeStartRub > 0) h += `<div class="small muted num" style="text-align:left">из них до начала поездки: ${formatRub(s.beforeStartRub)}</div>`;
      h += `<div class="small muted num" style="text-align:left">${s.count ? formatRub(s.perDay) + ' в день' : 'расходов пока нет'}</div></button>`;
    }
    return h + '</div>';
  }
  function render() { if (disposed) return; root.innerHTML = html(); }
  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'new') location.hash = hashFor('tripedit', 'new');
    else if (b.dataset.act === 'open') location.hash = hashFor('trip', b.dataset.id);
  };
  render();
  return { dispose() { disposed = true; } };
}

/* ---------- экран поездки ---------- */
export function mountTrip(root, ctx, id) {
  let disposed = false;
  const t = ctx.trips.find((x) => x.id === id);
  function html() {
    const s = tripSummary(t, ctx.tripExpenses), own = ctx.tripExpenses.filter((e) => e.tripId === id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
    let h = header(t.name, '<button type="button" class="btn" style="padding:8px 12px" data-act="edit">Изменить</button>', true) + '<div class="pad">';
    h += `<div class="card"><div class="small muted">Вся поездка · ${esc(rangeLabel(t.start, t.end))}</div><div class="total num">${formatRub(s.totalRub)}</div>`;
    if (t.currency !== 'RUB') h += `<div class="small muted num">${s.localSum ? formatAmount(s.localSum) + ' ' + esc(t.currency) : ''}${s.localSum && s.rubSum ? ' + ' : ''}${s.rubSum ? formatRub(s.rubSum) : ''}${s.count ? ' · ' : ''}курс ${formatRate(t.rateE4)}</div>`;
    if (s.beforeStartRub > 0) h += `<div class="small muted num">из них до начала поездки: ${formatRub(s.beforeStartRub)}</div>`;
    if (s.count) h += `<div class="small muted num">${formatRub(s.perDay)} в день · ${s.days} дн.</div>`;
    h += '</div>';
    if (s.byMonth.length) {
      h += '<div class="lbl">Влияние на месяцы</div>' + s.byMonth.map((m) => `<div class="row" style="margin:6px 0"><span style="width:96px">${esc(monthName(m.key))} ${m.key.slice(0, 4)}</span><div class="bar" style="flex:1"><i style="width:${share(m.amount, s.totalRub)}%;background:var(--accent)"></i></div><b class="num" style="width:104px;text-align:right">${formatRub(m.amount)}</b></div>`).join('');
      h += '<div class="small muted">Месячная аналитика учитывает каждый расход по его дате.</div>';
      h += '<div class="lbl">По категориям поездки</div>' + s.byCategory.map((c) => `<div style="margin:8px 0"><div class="row"><span class="dot sm" style="background:${colorOf(ctx, c.categoryId)}"></span><span style="flex:1">${esc(tcat(ctx, c.categoryId)?.name ?? '')}</span><b class="num">${formatRub(c.amount)}</b></div><div class="bar" style="margin-top:4px"><i style="width:${share(c.amount, s.totalRub)}%;background:${colorOf(ctx, c.categoryId)}"></i></div></div>`).join('');
      h += `<div class="lbl"><span>Все расходы</span><span class="num">${own.length}</span></div>` + own.map((e) =>
        `<button type="button" class="rec" data-act="expense" data-id="${esc(e.id)}">${tripDot(tcat(ctx, e.categoryId))}<span class="sp"><span class="t">${esc(tcat(ctx, e.categoryId)?.name ?? '')}</span><span class="muted small"> · ${esc(dayShort(e.date))}${e.date < t.start ? ' (до начала)' : ''}</span>${e.note ? `<br><span class="n">${esc(e.note)}</span>` : ''}</span>${tripAmountHTML(e, t)}</button>`).join('');
    } else h += '<div class="empty"><p>Расходов в этой поездке пока нет.</p></div>';
    h += '<button type="button" class="btn primary big" style="margin-top:16px" data-act="add">Добавить расход в поездку</button></div>';
    return h;
  }
  function render() { if (disposed) return; const top = root.scrollTop; root.innerHTML = html(); root.scrollTop = top; }
  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    switch (b.dataset.act) {
      case 'back': location.hash = hashFor('trips'); break;
      case 'edit': location.hash = hashFor('tripedit', id); break;
      case 'expense': location.hash = hashFor('edit', b.dataset.id); break;
      case 'add': ctx.state.presetTrip = id; location.hash = hashFor('add'); break;
    }
  };
  render();
  return { dispose() { disposed = true; } };
}

/* ---------- создание и правка поездки ---------- */
export function mountTripEdit(root, ctx, id) {
  let disposed = false, saving = false, review = null, error = '', errField = '';
  const isNew = id === 'new', old = isNew ? null : ctx.trips.find((x) => x.id === id);
  const known = CURRENCIES.some((c) => c[0] === (old?.currency ?? 'TRY'));
  let f = isNew ? { name: '', start: '', end: '', cur: 'TRY', other: '', rate: '' } : { name: old.name, start: old.start, end: old.end, cur: known ? old.currency : 'OTHER', other: known ? '' : old.currency, rate: formatRateFull(old.rateE4) };
  const currency = () => (f.cur === 'OTHER' ? f.other.trim().toUpperCase() : f.cur);

  function previewHTML() {
    if (isNew || currency() === 'RUB') return '';
    const r = parseRate(f.rate);
    if (!r.ok) return `<div class="card" style="margin-top:12px" id="prev"><span class="muted">${f.rate ? esc(RATE_ERRORS[r.reason]) : 'Введите курс числом, например 2,3500.'}</span></div>`;
    const p = previewRateChange(old, ctx.tripExpenses, r.rateE4);
    return `<div class="card" style="margin-top:12px" id="prev"><div class="small muted">Стоимость поездки после пересчёта</div><div class="row"><s class="muted num">${formatRub(p.before)}</s><b class="total num" style="font-size:22px">${formatRub(p.after)}</b></div><div class="small muted">Рублёвые расходы (например, билеты) не меняются.</div></div>`;
  }
  function html() {
    const err = (field) => (errField === field && error ? `<div class="err" role="alert">${esc(error)}</div>` : '');
    let h = header(isNew ? 'Новая поездка' : old.name, '', true) + '<div class="pad">';
    h += `<div class="lbl" style="margin-top:4px">Название</div><input class="inp" id="tname" maxlength="30" placeholder="Например, Стамбул" aria-label="Название" value="${esc(f.name)}">${err('name')}`;
    h += `<div class="grid2"><div><div class="lbl">Начало</div><input class="inp" type="date" id="tstart" aria-label="Начало поездки" value="${esc(f.start)}"${isNew ? '' : ' disabled'}></div><div><div class="lbl">Конец</div><input class="inp" type="date" id="tend" aria-label="Окончание поездки" value="${esc(f.end)}"${isNew ? '' : ' disabled'}></div></div>${err('dates')}`;
    h += isNew ? '<div class="notice" style="margin-top:12px">Даты нельзя изменить после создания. Проверьте их.</div>' : '<div class="small muted" style="margin-top:8px">Даты после создания менять нельзя.</div>';
    h += `<div class="lbl">Валюта</div><select class="inp" id="tcur" aria-label="Валюта">${CURRENCIES.map(([c, n]) => `<option value="${c}"${f.cur === c ? ' selected' : ''}>${c} — ${n}</option>`).join('')}<option value="OTHER"${f.cur === 'OTHER' ? ' selected' : ''}>Другая (код ISO)…</option></select>`;
    if (f.cur === 'OTHER') h += `<input class="inp" id="tother" maxlength="3" style="margin-top:8px" placeholder="Три буквы, например CHF" aria-label="Код валюты" value="${esc(f.other)}">`;
    h += err('currency');
    if (currency() !== 'RUB') h += `<div class="lbl">Курс к рублю</div><input class="inp amt num" id="trate" inputmode="decimal" autocomplete="off" aria-label="Курс к рублю" placeholder="например, 2,3500" value="${esc(f.rate)}"><div class="small muted" style="margin-top:6px">1 единица валюты = ? ₽. Вводится вручную.</div>${err('rate')}`;
    h += `<div id="prevbox">${previewHTML()}</div>`;
    h += `<button type="button" class="btn primary big" style="margin-top:16px" data-act="save">${isNew ? 'Создать поездку' : 'Сохранить'}</button>`;
    if (!isNew) h += '<button type="button" class="btn danger big" style="margin-top:8px" data-act="delete">Удалить поездку</button>';
    h += '</div>';
    if (review) h += sheetHTML(`<h3>Проверьте изменения</h3><div class="diff">${review.rows.map((r) => `<div class="d"><span class="small muted">${esc(r.label)}</span><span><s>${esc(r.from)}</s> → <b>${esc(r.to)}</b></span></div>`).join('')}</div><div class="sheetbtns"><button type="button" class="btn primary big" data-act="confirm">Применить изменения</button><button type="button" class="btn big" data-act="unreview">Вернуться к редактированию</button></div>`);
    return h;
  }
  function render() { if (disposed) return; const t = root.scrollTop; root.innerHTML = html(); root.scrollTop = t; }
  const rawTrip = () => ({ name: f.name, start: f.start, end: f.end, currency: currency(), rate: f.rate });

  async function apply(patch) {
    if (saving) return; saving = true;
    try {
      if (isNew) { const rec = await ctx.store.addTrip(patch); await ctx.reload(); location.hash = hashFor('trip', rec.id); ctx.toast('Поездка создана'); }
      else { await ctx.store.updateTrip(id, patch); await ctx.reload(); location.hash = hashFor('trip', id); ctx.toast('Изменения сохранены'); }
    } catch (e) { review = null; error = fail(e); errField = 'name'; render(); } finally { saving = false; }
  }
  function save() {
    error = ''; errField = '';
    const r = checkTrip(rawTrip(), ctx.trips, isNew ? null : id);
    if (!r.ok) { error = r.message; errField = r.field; render(); return; }
    if (isNew) { apply(rawTrip()); return; }
    const rows = [];
    if (r.trip.name !== old.name) rows.push({ label: 'Название', from: old.name, to: r.trip.name });
    if (r.trip.currency !== old.currency) rows.push({ label: 'Валюта', from: old.currency, to: r.trip.currency });
    if (r.trip.rateE4 !== old.rateE4) { const p = previewRateChange(old, ctx.tripExpenses, r.trip.rateE4); rows.push({ label: 'Курс', from: formatRate(old.rateE4), to: formatRate(r.trip.rateE4) }); if (p.before !== p.after) rows.push({ label: 'Стоимость поездки', from: formatRub(p.before), to: formatRub(p.after) }); }
    if (!rows.length) { ctx.toast('Изменений нет'); return; }
    review = { rows, patch: { name: r.trip.name, currency: r.trip.currency, rate: r.trip.currency === 'RUB' ? '1' : f.rate } }; render();
  }

  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'sheetbg' && ev.target !== b) return;
    switch (b.dataset.act) {
      case 'back': location.hash = isNew ? hashFor('trips') : hashFor('trip', id); break;
      case 'save': save(); break;
      case 'delete': location.hash = hashFor('tripdel', id); break;
      case 'confirm': apply(review.patch); break;
      case 'unreview': case 'sheetbg': review = null; render(); break;
    }
  };
  root.oninput = (ev) => {
    const t = ev.target;
    if (t.id === 'tname') f.name = t.value; else if (t.id === 'tother') f.other = t.value; else if (t.id === 'trate') {
      f.rate = t.value; const box = root.querySelector('#prevbox'); if (box) box.innerHTML = previewHTML();
    }
  };
  root.onchange = (ev) => {
    const t = ev.target;
    if (t.id === 'tstart') f.start = t.value; else if (t.id === 'tend') f.end = t.value;
    else if (t.id === 'tcur') { f.cur = t.value; render(); }
  };
  render();
  return { dispose() { disposed = true; } };
}

/* ---------- удаление поездки ---------- */
export function mountTripDelete(root, ctx, id) {
  let disposed = false, running = false, all = '', per = {}, confirm = false, error = '';
  const trip = ctx.trips.find((t) => t.id === id);
  const list = ctx.tripExpenses.filter((e) => e.tripId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const regular = topsOf(ctx.categories).flatMap((c) => [{ value: `${c.id}|`, label: c.name }, ...subsOf(ctx.categories, c.id).map((s) => ({ value: `${c.id}|${s.id}`, label: `${c.name} › ${s.name}` }))]);
  const options = tripTransferOptions(ctx.trips, id, regular).map((o) => ({ ...o, label: o.value.startsWith('c:') ? 'Обычные расходы: ' + o.label : o.label }));
  const perItem = list.length <= 100;
  const toTarget = (v) => parseTripTarget(v);
  const plan = () => {
    const transfers = {}; for (const e of list) { const t = toTarget(per[e.id]); if (t) transfers[e.id] = t; }
    const allTo = toTarget(all);
    return { transfers, allTo, ready: list.every((e) => transfers[e.id] || allTo) };
  };
  const optHTML = (sel) => '<option value="">Выберите…</option>' + options.map((o) => `<option value="${esc(o.value)}"${sel === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  const total = tripSummary(trip, ctx.tripExpenses).totalRub;

  function html() {
    const p = plan();
    let h = header('Удаление «' + trip.name + '»', '', true) + '<div class="pad">';
    if (list.length) {
      h += `<div class="notice">В поездке <b>${expenseWord(list.length)} на ${formatRub(total)}</b>. Выберите, куда ${list.length === 1 ? 'его' : 'их'} перенести. Перенос в обычные расходы делает суммы рублёвыми по курсу поездки.</div>`;
      h += `<div class="lbl">Перенести все</div><select class="inp" id="moveall" aria-label="Перенести все">${optHTML(all)}</select>`;
      if (perItem) h += '<div class="lbl">Расходы</div>' + list.map((e) => `<div class="imp"><div><b class="num">${formatRub(expenseRub(e, trip))}</b> <span class="muted small">${esc(dayShort(e.date))} · ${esc(tcat(ctx, e.categoryId)?.name ?? '')}</span>${e.note ? `<br><span class="muted small">${esc(e.note)}</span>` : ''}</div><select class="inp" data-id="${esc(e.id)}" aria-label="Куда перенести расход">${optHTML(per[e.id] ?? '')}</select></div>`).join('');
    } else h += '<div class="card">Поездка пустая, расходов в ней нет.</div>';
    if (error) h += `<div class="err" role="alert">${esc(error)}</div>`;
    h += `<button type="button" class="btn danger big" style="margin-top:16px" data-act="delete"${p.ready ? '' : ' disabled'}>${list.length ? 'Перенести и удалить' : 'Удалить'}</button></div>`;
    if (confirm) h += sheetHTML(`<h3>Удалить «${esc(trip.name)}»?</h3><div class="card">${list.length ? `Расходов к переносу: ${list.length}. ` : ''}Поездка исчезнет. Это нельзя отменить.</div><div class="sheetbtns"><button type="button" class="btn danger big" data-act="confirm">Удалить</button><button type="button" class="btn big" data-act="cancel">Отмена</button></div>`);
    return h;
  }
  function render() { if (disposed) return; const t = root.scrollTop; root.innerHTML = html(); root.scrollTop = t; }
  async function run() {
    if (running) return; running = true;
    const p = plan();
    try {
      await ctx.store.deleteTrip(id, { transfers: p.transfers, allTo: p.allTo }); await ctx.reload();
      location.hash = hashFor('trips'); ctx.toast('Поездка удалена');
    } catch (e) { confirm = false; error = fail(e); render(); } finally { running = false; }
  }
  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'sheetbg' && ev.target !== b) return;
    switch (b.dataset.act) {
      case 'back': location.hash = hashFor('tripedit', id); break;
      case 'delete': if (!b.disabled) { confirm = true; render(); } break;
      case 'cancel': case 'sheetbg': confirm = false; render(); break;
      case 'confirm': run(); break;
    }
  };
  root.onchange = (ev) => { const t = ev.target; if (t.id === 'moveall') all = t.value; else if (t.dataset.id) per[t.dataset.id] = t.value; else return; render(); };
  render();
  return { dispose() { disposed = true; } };
}

