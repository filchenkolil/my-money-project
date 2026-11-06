/* История: лента месяцев (общая с аналитикой), сумма месяца, список по дням, фильтры. */
import { formatRub } from '../money.js';
import { monthName, monthKey, addDays, dayLong, exportReminderDue } from '../dates.js';
import { selectMonth, groupByDay, monthStripKeys, filtersActive, NO_FILTERS } from '../history.js';
import { UI } from '../ui/icons.js';
import { esc, dotHTML, header, installNotice, sheetHTML } from '../ui/dom.js';
import { hashFor } from '../router.js';
import { monthStripHTML, centerSelected } from '../ui/monthstrip.js';

export function mountHistory(root, ctx) {
  const { state } = ctx;
  let sheet = false, banner = false;
  const cat = (id) => ctx.categories.find((c) => c.id === id);
  const tops = () => ctx.categories.filter((c) => c.parentId === null);
  // Напоминание об экспорте: последние 3 дня месяца и первые 3 дня следующего, пока экспорта в этом окне не было.
  const windowKey = monthKey(addDays(state.today, 3));
  (async () => {
    const [last, dismissed] = await Promise.all([ctx.store.getMeta('lastExportDate'), ctx.store.getMeta('exportBannerDismissed')]);
    banner = exportReminderDue(state.today, last) && dismissed !== windowKey;
    if (banner) render();
  })();

  function recRow(e) {
    const c = cat(e.categoryId), s = e.subcategoryId ? cat(e.subcategoryId) : null;
    return `<button type="button" class="rec" data-act="edit" data-id="${esc(e.id)}">${dotHTML(c)}<span class="sp"><span class="t">${esc(c.name)}${s ? ` <span class="muted" style="font-weight:400">· ${esc(s.name)}</span>` : ''}${e.isRegular ? '<span class="badge">рег.</span>' : ''}</span>${e.note ? `<br><span class="n">${esc(e.note)}</span>` : ''}</span><span class="a num">${formatRub(e.amount)}</span></button>`;
  }


  function listHTML() {
    const f = state.filters, active = filtersActive(f), list = selectMonth(ctx.expenses, state.month, f);
    if (!list.length) {
      return `<div class="empty" style="padding-top:32px"><p>${active ? 'По этим условиям ничего не найдено.' : 'В этом месяце расходов пока нет.'}</p>${active ? '<button type="button" class="btn" data-act="fltreset">Сбросить фильтры</button>' : '<button type="button" class="btn primary" data-act="add">Добавить расход</button>'}</div>`;
    }
    return groupByDay(list).map((g) => `<div class="day"><span>${esc(dayLong(g.date))}</span><span class="num">${formatRub(g.total)}</span></div>${g.items.map(recRow).join('')}`).join('');
  }

  function filterSheet() {
    const f = state.filters, subs = f.categoryId ? ctx.categories.filter((c) => c.parentId === f.categoryId) : [];
    const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
    return sheetHTML(`<div class="row" style="margin-bottom:6px"><h3 style="flex:1;margin:0">Фильтры</h3><button type="button" class="ibtn" data-act="closesheet">Закрыть</button></div>
      <div class="lbl">Категория</div><select class="inp" id="fcat">${opt('', 'Все категории', !f.categoryId)}${tops().map((c) => opt(c.id, c.name, f.categoryId === c.id)).join('')}</select>
      <div class="lbl">Подкатегория</div><select class="inp" id="fsub"${subs.length ? '' : ' disabled'}>${opt('', f.categoryId ? (subs.length ? 'Все подкатегории' : 'У категории нет подкатегорий') : 'Сначала выберите категорию', !f.subcategoryId)}${subs.map((s) => opt(s.id, s.name, f.subcategoryId === s.id)).join('')}</select>
      <div class="row" style="margin-top:16px"><span style="flex:1"><b>Только регулярные</b></span><button type="button" class="tog${f.regularOnly ? ' on' : ''}" data-act="fltreg" role="switch" aria-checked="${f.regularOnly}" aria-label="Только регулярные"></button></div>
      <div class="sheetbtns" style="grid-template-columns:1fr 1fr"><button type="button" class="btn" data-act="fltreset">Сбросить</button><button type="button" class="btn primary" data-act="closesheet">Применить</button></div>`);
  }

  function html() {
    if (!ctx.expenses.length) {
      return header('История') + `<div class="pad">${installNotice(false)}<div class="heroc"><svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true"><circle cx="48" cy="48" r="38" fill="#fff" fill-opacity=".55" stroke="#111" stroke-width="2"/><circle cx="48" cy="48" r="22" fill="#E8499A"/><path d="M48 38v20M38 48h20" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg><h2>Расходов пока нет</h2><p>Первая запись займёт несколько секунд: сумма, категория, готово.</p><button type="button" class="btn primary big" data-act="add">Добавить первый расход</button></div></div>`;
    }
    const f = state.filters, active = filtersActive(f);
    const monthSum = selectMonth(ctx.expenses, state.month).reduce((s, e) => s + e.amount, 0);
    const shown = active ? selectMonth(ctx.expenses, state.month, f).reduce((s, e) => s + e.amount, 0) : null;
    const filterBtn = `<button type="button" class="ib${active ? ' on' : ''}" data-act="opensheet" aria-label="Фильтры">${UI.filter}</button>`;
    return header('История', filterBtn) + monthStripHTML(monthStripKeys(ctx.expenses, state.today), state.month) + '<div class="pad">' +
      (banner ? '<div class="banner"><span style="flex:1">Пора сделать экспорт за месяц</span><button type="button" class="ibtn" data-act="bannerx" aria-label="Скрыть напоминание">✕</button></div>' : '') +
      `<div class="card"><div class="small muted">Всего за ${esc(monthName(state.month).toLowerCase())}</div><div class="total num">${formatRub(monthSum)}</div>${active ? `<div class="small muted" style="margin-top:4px">По фильтрам: <b class="num">${formatRub(shown)}</b></div>` : ''}</div>` +
      `<div id="hlist">${listHTML()}</div></div>` + (sheet ? filterSheet() : '');
  }

  function render() {
    const top = root.scrollTop, strip = root.querySelector('.mstrip'), sl = strip ? strip.scrollLeft : null;
    root.innerHTML = html();
    root.scrollTop = top;
    const s = root.querySelector('.mstrip'), cur = root.querySelector('.mchip[aria-current]');
    if (s && cur) s.scrollLeft = sl ?? Math.max(0, cur.offsetLeft - 140);
  }

  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const v = b.dataset;
    if (v.act === 'sheetbg' && ev.target !== b) return;
    switch (v.act) {
      case 'edit': location.hash = hashFor('edit', v.id); break;
      case 'add': location.hash = hashFor('add'); break;
      case 'month': state.setMonth(v.v); break;
      case 'opensheet': sheet = true; render(); break;
      case 'closesheet': case 'sheetbg': sheet = false; render(); break;
      case 'fltreg': state.filters = { ...state.filters, regularOnly: !state.filters.regularOnly }; render(); break;
      case 'fltreset': state.filters = { ...NO_FILTERS }; render(); break;
      case 'bannerx': banner = false; ctx.store.setMeta('exportBannerDismissed', windowKey); render(); break;
    }
  };
  root.onchange = (ev) => {
    if (ev.target.id === 'fcat') state.filters = { ...state.filters, categoryId: ev.target.value, subcategoryId: '' };
    else if (ev.target.id === 'fsub') state.filters = { ...state.filters, subcategoryId: ev.target.value };
    else return;
    render();
  };
  const off = state.subscribe((what) => { if (what === 'month') { render(); const c = root.querySelector('.mchip[aria-current]'); c?.scrollIntoView({ inline: 'center', block: 'nearest' }); } });
  render();
  return { dispose: off };
}
