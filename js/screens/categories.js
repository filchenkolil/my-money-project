/* Категории: дерево с порядком, правка (название, цвет, значок), удаление с переносом расходов. */
import { formatRub } from '../money.js';
import { dayShort } from '../dates.js';
import { expenseWord } from '../form.js';
import { PALETTE, ICONS } from '../seed.js';
import { StoreError } from '../store.js';
import { moveId, nextHue, diffCategory, transferOptions, transferPlan, subsOf, topsOf, expensesIn } from '../categories.js';
import { icon, UI } from '../ui/icons.js';
import { esc, dotHTML, hueColor, header, sheetHTML } from '../ui/dom.js';
import { hashFor } from '../router.js';

const fail = (e) => (e instanceof StoreError ? e.message : 'Не удалось сохранить. Данные не изменились, попробуйте ещё раз.');
const pluralSub = (n) => `${n} подкат.`;

/* ---------- дерево ---------- */
export function mountCategories(root, ctx) {
  let sheet = null; // { id } — правка подкатегории или { parentId } — новая
  let name = '', error = '';

  function html() {
    const tops = topsOf(ctx.categories);
    let h = header('Категории', '', true) + '<div class="pad tree">';
    tops.forEach((c, i) => {
      const subs = subsOf(ctx.categories, c.id);
      h += `<div class="cat"><button type="button" class="catname" data-act="edit" data-id="${c.id}">${dotHTML({ ...c, icon: c.icon })}<span class="sp"><b>${esc(c.name)}</b>${subs.length ? `<span class="small muted"> · ${pluralSub(subs.length)}</span>` : ''}</span></button>${arrows('top', c.id, i, tops.length)}</div>`;
      h += '<div class="subs">' + subs.map((s, j) => `<div class="sub"><button type="button" class="subname" data-act="subedit" data-id="${s.id}">${esc(s.name)}</button>${arrows('sub', s.id, j, subs.length, c.id)}</div>`).join('') +
        `<button type="button" class="subadd" data-act="subnew" data-id="${c.id}">+ подкатегория</button></div>`;
    });
    h += '<button type="button" class="btn big" style="margin-top:16px" data-act="new">+ Добавить категорию</button></div>';
    if (sheet) {
      const isNew = !sheet.id, sub = isNew ? null : ctx.categories.find((c) => c.id === sheet.id);
      h += sheetHTML(`<h3>${isNew ? 'Новая подкатегория' : 'Подкатегория'}</h3><input class="inp" id="subname" maxlength="30" aria-label="Название" placeholder="Название" value="${esc(name)}">${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}<div class="sheetbtns"><button type="button" class="btn primary big" data-act="subsave">Сохранить</button>${isNew ? '' : '<button type="button" class="btn danger big" data-act="subdel">Удалить подкатегорию</button>'}<button type="button" class="btn big" data-act="sheetclose">Отмена</button></div>`);
      void sub;
    }
    return h;
  }
  function arrows(kind, id, i, n, parent = '') {
    return `<span class="arrows"><button type="button" class="ibtn" data-act="move" data-kind="${kind}" data-id="${id}" data-parent="${parent}" data-dir="-1" aria-label="Выше"${i === 0 ? ' disabled' : ''}>${UI.up}</button><button type="button" class="ibtn" data-act="move" data-kind="${kind}" data-id="${id}" data-parent="${parent}" data-dir="1" aria-label="Ниже"${i === n - 1 ? ' disabled' : ''}>${UI.down}</button></span>`;
  }
  function render() { const t = root.scrollTop; root.innerHTML = html(); root.scrollTop = t; if (sheet) root.querySelector('#subname')?.focus(); }

  async function saveSub() {
    try {
      if (sheet.id) await ctx.store.updateCategory(sheet.id, { name }); else await ctx.store.addSubcategory(sheet.parentId, name);
      await ctx.reload(); sheet = null; error = ''; render(); ctx.toast('Сохранено');
    } catch (e) { error = fail(e); render(); }
  }
  root.onclick = async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const v = b.dataset;
    if (v.act === 'sheetbg' && ev.target !== b) return;
    switch (v.act) {
      case 'back': location.hash = hashFor('settings'); break;
      case 'edit': location.hash = hashFor('catedit', v.id); break;
      case 'new': location.hash = hashFor('catedit', 'new'); break;
      case 'subnew': sheet = { parentId: v.id }; name = ''; error = ''; render(); break;
      case 'subedit': sheet = { id: v.id }; name = ctx.categories.find((c) => c.id === v.id).name; error = ''; render(); break;
      case 'sheetclose': case 'sheetbg': sheet = null; render(); break;
      case 'subsave': saveSub(); break;
      case 'subdel': { const id = sheet.id; sheet = null; location.hash = hashFor('catdel', id); break; }
      case 'move': {
        const parent = v.kind === 'top' ? null : v.parent;
        const ids = (parent === null ? topsOf(ctx.categories) : subsOf(ctx.categories, parent)).map((c) => c.id);
        try { await ctx.store.reorder(parent, moveId(ids, v.id, +v.dir)); await ctx.reload(); render(); } catch (e) { ctx.toast(fail(e)); }
        break;
      }
    }
  };
  root.oninput = (ev) => { if (ev.target.id === 'subname') name = ev.target.value; };
  root.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target.id === 'subname') { ev.preventDefault(); saveSub(); } };
  render();
  return {};
}

/* ---------- правка и создание категории ---------- */
export function mountCategoryEdit(root, ctx, id) {
  const isNew = id === 'new', old = isNew ? null : ctx.categories.find((c) => c.id === id);
  let f = isNew ? { name: '', hue: nextHue(ctx.categories), icon: 'tag' } : { name: old.name, hue: old.hue, icon: old.icon };
  let review = null, error = '';

  function html() {
    let h = header(isNew ? 'Новая категория' : 'Изменить категорию', '', true) + '<div class="pad">';
    h += `<div class="row" style="margin-top:4px"><span class="dot" style="background:${hueColor(f.hue)};width:56px;height:56px">${icon(f.icon)}</span><input class="inp" id="cename" maxlength="30" value="${esc(f.name)}" aria-label="Название" placeholder="Название" style="flex:1;min-width:0"></div>`;
    if (error) h += `<div class="err" role="alert">${esc(error)}</div>`;
    h += '<div class="lbl">Цвет</div><div class="pal">' + PALETTE.map((hh) => `<button type="button" data-act="hue" data-h="${hh}" style="background:${hueColor(hh)}" aria-pressed="${f.hue === hh}" aria-label="Цвет ${hh}"></button>`).join('') + '</div>';
    h += '<div class="lbl">Значок</div><div class="icons">' + ICONS.map((k) => `<button type="button" class="icb" data-act="icon" data-v="${k}" aria-pressed="${f.icon === k}" aria-label="Значок ${k}">${icon(k)}</button>`).join('') + '</div>';
    h += '<button type="button" class="btn primary big" style="margin-top:24px" data-act="save">Сохранить</button>';
    if (!isNew) h += '<button type="button" class="btn danger big" style="margin-top:8px" data-act="delete">Удалить категорию</button>';
    h += '</div>';
    if (review) h += sheetHTML(`<h3>Проверьте изменения</h3><div class="diff">${review.map((c) => `<div class="d"><span class="small muted">${esc(c.label)}</span><span><s>${esc(c.from)}</s> → <b>${esc(c.to)}</b></span></div>`).join('')}</div><div class="sheetbtns"><button type="button" class="btn primary big" data-act="confirm">Применить изменения</button><button type="button" class="btn big" data-act="unreview">Вернуться к редактированию</button></div>`);
    return h;
  }
  function render() { const t = root.scrollTop; root.innerHTML = html(); root.scrollTop = t; }

  async function apply() {
    try {
      if (isNew) await ctx.store.addCategory({ name: f.name, icon: f.icon, hue: f.hue });
      else await ctx.store.updateCategory(id, { name: f.name, icon: f.icon, hue: f.hue });
      await ctx.reload();
      location.hash = hashFor('categories');
      ctx.toast(isNew ? 'Категория добавлена' : 'Категория сохранена');
    } catch (e) { review = null; error = fail(e); render(); }
  }
  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const v = b.dataset;
    if (v.act === 'sheetbg' && ev.target !== b) return;
    switch (v.act) {
      case 'back': location.hash = hashFor('categories'); break;
      case 'hue': f.hue = +v.h; render(); break;
      case 'icon': f.icon = v.v; render(); break;
      case 'save': {
        error = '';
        if (isNew) { apply(); break; }
        const changes = diffCategory(old, { ...f, name: f.name.trim() });
        if (!changes.length) { ctx.toast('Изменений нет'); break; }
        review = changes; render(); break;
      }
      case 'confirm': apply(); break;
      case 'unreview': case 'sheetbg': review = null; render(); break;
      case 'delete': location.hash = hashFor('catdel', id); break;
    }
  };
  root.oninput = (ev) => { if (ev.target.id === 'cename') f.name = ev.target.value; };
  render();
  return {};
}

/* ---------- удаление с переносом расходов ---------- */
export function mountCategoryDelete(root, ctx, id) {
  const target = ctx.categories.find((c) => c.id === id);
  const isSub = target.parentId !== null, parent = isSub ? ctx.categories.find((c) => c.id === target.parentId) : null;
  const list = expensesIn(ctx.expenses, target).sort((a, b) => (a.date < b.date ? 1 : -1));
  const options = transferOptions(ctx.categories, target);
  const PER_LIMIT = 100; // для больших категорий выбор по одному расходу не показываем: только «перенести все»
  const perItem = list.length <= PER_LIMIT;
  let all = '', per = {}, confirm = false, error = '';
  const total = list.reduce((s, e) => s + e.amount, 0);
  const title = (isSub ? 'Удаление «' + parent.name + ' › ' : 'Удаление «') + target.name + '»';
  const lastCategory = !isSub && topsOf(ctx.categories).length <= 1;
  const optHTML = (sel) => '<option value="">Выберите…</option>' + options.map((o) => `<option value="${esc(o.value)}"${sel === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('');

  function html() {
    const plan = transferPlan(list, per, all);
    let h = header(title, '', true) + '<div class="pad">';
    if (lastCategory) return h + '<div class="notice">Нельзя удалить последнюю категорию: расходам некуда будет переехать. Сначала добавьте другую категорию.</div></div>';
    if (list.length) {
      h += `<div class="notice">${isSub ? 'В подкатегории' : 'В категории'} <b>${expenseWord(list.length)} на ${formatRub(total)}</b>. Выберите, куда ${list.length === 1 ? 'его' : 'их'} перенести, прежде чем удалить.</div>`;
      h += `<div class="lbl">Перенести все</div><select class="inp" id="moveall" aria-label="Перенести все">${optHTML(all)}</select>`;
      if (perItem) h += '<div class="lbl">Расходы</div>' + list.map((e) => `<div class="imp"><div><b class="num">${formatRub(e.amount)}</b> <span class="muted small">${esc(dayShort(e.date))}</span>${e.note ? `<br><span class="muted small">${esc(e.note)}</span>` : ''}</div><select class="inp" data-id="${esc(e.id)}" aria-label="Куда перенести расход">${optHTML(per[e.id] ?? '')}</select></div>`).join('');
      else h += `<p class="muted small" style="margin-top:12px">Расходов много, поэтому все они переносятся в одно место.</p>`;
    } else h += `<div class="card">${isSub ? 'Подкатегория' : 'Категория'} пустая, расходов в ней нет.</div>`;
    if (error) h += `<div class="err" role="alert">${esc(error)}</div>`;
    h += `<div class="savebar" style="margin:16px -16px -32px"><button type="button" class="btn danger big" data-act="delete"${plan.ready ? '' : ' disabled'}>${list.length ? 'Перенести и удалить' : 'Удалить'}</button></div></div>`;
    if (confirm) h += sheetHTML(`<h3>Удалить «${esc(target.name)}»?</h3><div class="card">${list.length ? `Расходов к переносу: ${list.length}. ` : ''}${isSub ? 'подкатегория' : 'категория'} исчезнет. Это нельзя отменить.</div><div class="sheetbtns"><button type="button" class="btn danger big" data-act="confirm">Удалить</button><button type="button" class="btn big" data-act="cancel">Отмена</button></div>`);
    return h;
  }
  function render() { const t = root.scrollTop; root.innerHTML = html(); root.scrollTop = t; }

  async function run() {
    const plan = transferPlan(list, per, all);
    try {
      if (isSub) await ctx.store.deleteSubcategory(id, { transfers: plan.transfers, allTo: plan.allTo });
      else await ctx.store.deleteCategory(id, { transfers: plan.transfers, allTo: plan.allTo });
      await ctx.reload();
      if (ctx.state.filters.categoryId === id || ctx.state.filters.subcategoryId === id) ctx.state.filters = { categoryId: '', subcategoryId: '', regularOnly: false };
      location.hash = hashFor('categories');
      ctx.toast('Удалено');
    } catch (e) { confirm = false; error = fail(e); render(); }
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
  root.onchange = (ev) => {
    const t = ev.target;
    if (t.id === 'moveall') all = t.value; else if (t.dataset.id) per[t.dataset.id] = t.value; else return;
    render();
  };
  render();
  return {};
}
