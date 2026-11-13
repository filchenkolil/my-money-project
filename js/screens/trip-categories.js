/* Категории поездок (v2): правка и удаление с переносом расходов. Общий набор для всех поездок. */
import { formatRub, formatAmount } from '../money.js';
import { dayShort } from '../dates.js';
import { PALETTE, ICONS } from '../seed.js';
import { StoreError } from '../store.js';
import { nextHue } from '../categories.js';
import { expenseRub } from '../trips.js';
import { expenseWord } from '../form.js';
import { icon } from '../ui/icons.js';
import { esc, hueColor, header, sheetHTML } from '../ui/dom.js';
import { hashFor } from '../router.js';

const fail = (e) => (e instanceof StoreError ? e.message : 'Не удалось сохранить. Данные не изменились, попробуйте ещё раз.');

export function mountTripCategoryEdit(root, ctx, id) {
  let disposed = false, applying = false, error = '';
  const isNew = id === 'new', old = isNew ? null : ctx.tripCategories.find((c) => c.id === id);
  // для нового цвета берём первый свободный оттенок палитры среди категорий поездок
  const f = isNew ? { name: '', icon: 'tag', hue: nextHue(ctx.tripCategories.map((c) => ({ parentId: null, hue: c.hue, order: c.order }))) } : { name: old.name, icon: old.icon, hue: old.hue };

  function html() {
    let h = header(isNew ? 'Новая категория поездки' : 'Изменить категорию поездки', '', true) + '<div class="pad">';
    h += `<div class="row" style="margin-top:4px"><span class="dot" style="background:${hueColor(f.hue)};width:56px;height:56px">${icon(f.icon)}</span><input class="inp" id="cename" maxlength="30" value="${esc(f.name)}" aria-label="Название" placeholder="Название" style="flex:1;min-width:0"></div>`;
    if (error) h += `<div class="err" role="alert">${esc(error)}</div>`;
    h += '<div class="lbl">Цвет</div><div class="pal">' + PALETTE.map((hh) => `<button type="button" data-act="hue" data-h="${hh}" style="background:${hueColor(hh)}" aria-pressed="${f.hue === hh}" aria-label="Цвет ${hh}"></button>`).join('') + '</div>';
    h += '<div class="lbl">Значок</div><div class="icons">' + ICONS.map((k) => `<button type="button" class="icb" data-act="icon" data-v="${k}" aria-pressed="${f.icon === k}" aria-label="Значок ${k}">${icon(k)}</button>`).join('') + '</div>';
    h += '<button type="button" class="btn primary big" style="margin-top:24px" data-act="save">Сохранить</button>';
    if (!isNew) h += '<button type="button" class="btn danger big" style="margin-top:8px" data-act="delete">Удалить категорию поездки</button>';
    return h + '</div>';
  }
  function render() { if (disposed) return; const t = root.scrollTop; root.innerHTML = html(); root.scrollTop = t; }
  async function save() {
    if (applying) return; applying = true; error = '';
    try {
      if (isNew) await ctx.store.addTripCategory({ name: f.name, icon: f.icon, hue: f.hue }); else await ctx.store.updateTripCategory(id, { name: f.name, icon: f.icon, hue: f.hue });
      await ctx.reload(); location.hash = hashFor('categories'); ctx.toast(isNew ? 'Категория добавлена' : 'Категория сохранена');
    } catch (e) { error = fail(e); render(); } finally { applying = false; }
  }
  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const v = b.dataset;
    if (v.act === 'back') location.hash = hashFor('categories');
    else if (v.act === 'hue') { f.hue = +v.h; render(); } else if (v.act === 'icon') { f.icon = v.v; render(); }
    else if (v.act === 'save') save(); else if (v.act === 'delete') location.hash = hashFor('tcatdel', id);
  };
  root.oninput = (ev) => { if (ev.target.id === 'cename') f.name = ev.target.value; };
  render();
  return { dispose() { disposed = true; } };
}

export function mountTripCategoryDelete(root, ctx, id) {
  let disposed = false, running = false, all = '', per = {}, confirm = false, error = '';
  const cat = ctx.tripCategories.find((c) => c.id === id);
  const list = ctx.tripExpenses.filter((e) => e.categoryId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const options = ctx.tripCategories.filter((c) => c.id !== id);
  const tripOf = (e) => ctx.trips.find((t) => t.id === e.tripId);
  const perItem = list.length <= 100, last = ctx.tripCategories.length <= 1;
  const plan = () => { const transfers = {}; for (const e of list) if (per[e.id]) transfers[e.id] = per[e.id]; return { transfers, allTo: all || null, ready: list.every((e) => transfers[e.id] || all) }; };
  const optHTML = (sel) => '<option value="">Выберите…</option>' + options.map((c) => `<option value="${esc(c.id)}"${sel === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  const total = list.reduce((s, e) => s + expenseRub(e, tripOf(e) ?? { currency: 'RUB', rateE4: 10000 }), 0);

  function html() {
    const p = plan();
    let h = header('Удаление «' + cat.name + '»', '', true) + '<div class="pad">';
    if (last) return h + '<div class="notice">Нельзя удалить последнюю категорию поездки: расходам некуда будет переехать. Сначала добавьте другую.</div></div>';
    if (list.length) {
      h += `<div class="notice">В категории <b>${expenseWord(list.length)} на ${formatRub(total)}</b>. Выберите, куда ${list.length === 1 ? 'его' : 'их'} перенести, прежде чем удалить.</div>`;
      h += `<div class="lbl">Перенести все</div><select class="inp" id="moveall" aria-label="Перенести все">${optHTML(all)}</select>`;
      if (perItem) h += '<div class="lbl">Расходы</div>' + list.map((e) => { const t = tripOf(e); return `<div class="imp"><div><b class="num">${t && !e.isRub && t.currency !== 'RUB' ? formatAmount(e.amount) + ' ' + esc(t.currency) : formatRub(e.amount)}</b> <span class="muted small">${esc(dayShort(e.date))}${t ? ' · ' + esc(t.name) : ''}</span>${e.note ? `<br><span class="muted small">${esc(e.note)}</span>` : ''}</div><select class="inp" data-id="${esc(e.id)}" aria-label="Куда перенести расход">${optHTML(per[e.id] ?? '')}</select></div>`; }).join('');
    } else h += '<div class="card">Категория пустая, расходов в ней нет.</div>';
    if (error) h += `<div class="err" role="alert">${esc(error)}</div>`;
    h += `<button type="button" class="btn danger big" style="margin-top:16px" data-act="delete"${p.ready ? '' : ' disabled'}>${list.length ? 'Перенести и удалить' : 'Удалить'}</button></div>`;
    if (confirm) h += sheetHTML(`<h3>Удалить «${esc(cat.name)}»?</h3><div class="card">Категория поездки исчезнет. Это нельзя отменить.</div><div class="sheetbtns"><button type="button" class="btn danger big" data-act="confirm">Удалить</button><button type="button" class="btn big" data-act="cancel">Отмена</button></div>`);
    return h;
  }
  function render() { if (disposed) return; const t = root.scrollTop; root.innerHTML = html(); root.scrollTop = t; }
  async function run() {
    if (running) return; running = true;
    const p = plan();
    try { await ctx.store.deleteTripCategory(id, { transfers: p.transfers, allTo: p.allTo }); await ctx.reload(); location.hash = hashFor('categories'); ctx.toast('Удалено'); }
    catch (e) { confirm = false; error = fail(e); render(); } finally { running = false; }
  }
  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'sheetbg' && ev.target !== b) return;
    switch (b.dataset.act) {
      case 'back': location.hash = hashFor('categories'); break;
      case 'delete': if (!b.disabled) { confirm = true; render(); } break;
      case 'cancel': case 'sheetbg': confirm = false; render(); break;
      case 'confirm': run(); break;
    }
  };
  root.onchange = (ev) => { const t = ev.target; if (t.id === 'moveall') all = t.value; else if (t.dataset.id) per[t.dataset.id] = t.value; else return; render(); };
  render();
  return { dispose() { disposed = true; } };
}
