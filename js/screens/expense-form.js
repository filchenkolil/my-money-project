/* Форма расхода: «Новый расход» (главный экран) и «Редактирование» (та же форма, с проверкой изменений).
   Порядок сверху вниз: сумма, дата, категория, подкатегория, комментарий и «Регулярный», «Сохранить». */
import { formatInput, formatRub } from '../money.js';
import { dayShort, monthKey, shiftMonthsISO } from '../dates.js';
import { dayTotal, frequentCategories } from '../stats.js';
import { newForm, afterSave, checkForm, tileList, expenseWord, expenseToForm, diffExpense } from '../form.js';
import { StoreError } from '../store.js';
import { icon, UI } from '../ui/icons.js';
import { esc, dotHTML, header, scrollToEl, reducedMotion, installNotice, sheetHTML } from '../ui/dom.js';
import { stripHTML, mountStrip } from '../ui/datestrip.js';

/** expense: если задан, экран работает как правка этого расхода. */
export function mountExpenseForm(root, ctx, { expense = null } = {}) {
  const edit = !!expense;
  let f = edit ? expenseToForm(expense) : newForm(ctx.state.today), addSub = false, newSub = '', review = null;
  const tops = () => ctx.categories.filter((c) => c.parentId === null);
  // Порядок плиток считаем один раз за открытие экрана: во время ввода пачкой плитки не должны прыгать.
  const order = frequentCategories(ctx.expenses, tops().map((c) => c.id), ctx.state.today);
  const cat = (id) => ctx.categories.find((c) => c.id === id);
  const name = (id) => cat(id)?.name ?? '';

  function dayLine() {
    const d = dayTotal(ctx.expenses, f.date);
    const label = f.date === ctx.state.today ? 'За сегодня' : 'За ' + dayShort(f.date);
    return d.count ? `<div class="dateline">${label}: ${expenseWord(d.count)} · <b class="num">${formatRub(d.total)}</b></div>` : '';
  }

  function tile(id) {
    const c = cat(id);
    return `<button type="button" class="tile" data-act="cat" data-id="${id}" aria-pressed="${f.categoryId === id}">${dotHTML(c)}<span class="nm">${esc(c.name)}</span></button>`;
  }

  function reviewHTML() {
    if (!review) return '';
    const del = review.kind === 'del';
    const body = del
      ? `<div class="card"><b>Запись будет удалена</b><div class="small muted" style="margin-top:8px">${esc(name(expense.categoryId))} · ${formatRub(expense.amount)}${expense.note ? ' · ' + esc(expense.note) : ''} · ${esc(dayShort(expense.date))}</div></div>`
      : `<div class="diff">${review.changes.map((c) => `<div class="d"><span class="small muted">${esc(c.label)}</span><span><s>${esc(c.from)}</s> → <b>${esc(c.to)}</b></span></div>`).join('')}</div>`;
    return sheetHTML(`<h3>${del ? 'Удалить запись?' : 'Проверьте изменения'}</h3>${body}<div class="sheetbtns"><button type="button" class="btn ${del ? 'danger' : 'primary'} big" data-act="confirm">${del ? 'Удалить' : 'Применить изменения'}</button><button type="button" class="btn big" data-act="unreview">Вернуться к редактированию</button></div>`);
  }

  function html() {
    const { ids, hidden } = tileList(order, f.categoryId, f.expanded);
    const subs = f.categoryId ? ctx.categories.filter((c) => c.parentId === f.categoryId) : [];
    const note = f.note || f.showNote;
    const range = edit ? '' : ` min="${shiftMonthsISO(ctx.state.today, -2)}" max="${shiftMonthsISO(ctx.state.today, 2)}"`;
    let h = header(edit ? 'Редактирование' : 'Новый расход', `<label class="ib" aria-label="Выбрать другую дату">${UI.cal}<input class="dpick" type="date" id="date" value="${f.date}"${range} tabindex="-1"></label>`, edit);
    h += '<div class="pad">';
    if (!edit) h += installNotice(ctx.expenses.length > 0);
    h += `<input class="inp amt num" id="amt" inputmode="decimal" autocomplete="off" aria-label="Сумма" placeholder="Введите сумму" value="${esc(f.amount)}">`;
    h += f.error ? `<div class="err" role="alert" id="err">${esc(f.error)}</div>` : '<div class="hint" id="hint">Например, 1 500 или 1 500,50</div>';
    h += stripHTML(ctx.state.today, f.date) + (edit ? '' : dayLine());
    h += '<div class="lbl"><span>Категория</span><span class="opt">частые сверху</span></div><div class="tiles">' + ids.map(tile).join('');
    if (hidden || f.expanded) h += `<button type="button" class="tile more" data-act="more" aria-expanded="${f.expanded}"><span class="dot">${icon('dots')}</span><span class="nm">${f.expanded ? 'Свернуть' : 'Ещё ' + hidden}</span></button>`;
    h += '</div>';
    if (f.categoryId) {
      h += '<div id="subs"><div class="lbl">Подкатегория <span class="opt">необязательно</span></div><div class="chips">' +
        subs.map((s) => `<button type="button" class="chip" data-act="sub" data-id="${s.id}" aria-pressed="${f.subcategoryId === s.id}">${esc(s.name)}</button>`).join('') +
        (addSub ? '' : '<button type="button" class="chip dashed" data-act="addsub">+ Добавить подкатегорию</button>') + '</div>';
      if (addSub) h += `<div class="row" style="margin-top:8px"><input class="inp" id="newsub" maxlength="30" placeholder="Название подкатегории" value="${esc(newSub)}" style="flex:1;min-width:0"><button type="button" class="btn primary" data-act="addsubok">Добавить</button><button type="button" class="btn" data-act="addsubno">Отмена</button></div>`;
      h += '</div>';
    }
    h += `<div class="chips" id="extras" style="margin-top:16px"><button type="button" class="chip" data-act="note" aria-pressed="${!!note}">${note ? 'Комментарий' : '+ Комментарий'}</button><button type="button" class="chip" data-act="reg" aria-pressed="${f.isRegular}">Регулярный</button></div>`;
    if (note) h += `<input class="inp" id="note" maxlength="200" style="margin-top:8px" aria-label="Комментарий" placeholder="на что потратила" value="${esc(f.note)}">`;
    if (edit) h += '<button type="button" class="btn danger big" style="margin-top:24px" data-act="del">Удалить запись</button>';
    h += `</div><div class="savebar"><button type="button" class="btn primary big" data-act="save" id="save">${edit ? 'Сохранить изменения' : 'Сохранить'}</button></div>`;
    return h + reviewHTML();
  }

  function render({ keepScroll = true } = {}) {
    const top = keepScroll ? root.scrollTop : 0;
    root.innerHTML = html();
    mountStrip(root, f.date);
    root.scrollTop = top;
  }

  const focusAmt = () => { const a = root.querySelector('#amt'); if (a) { try { a.focus({ preventScroll: true }); } catch { a.focus(); } } };

  /* ---------- ввод суммы: пробелы разрядов по ходу набора, курсор не прыгает ---------- */
  function onAmountInput(el) {
    const caret = el.selectionStart ?? el.value.length;
    const digitsBefore = el.value.slice(0, caret).replace(/\s/g, '').length;
    const formatted = formatInput(el.value);
    if (formatted !== el.value) {
      el.value = formatted;
      let n = 0, pos = 0;
      while (pos < formatted.length && n < digitsBefore) { if (!/\s/.test(formatted[pos])) n++; pos++; }
      try { el.setSelectionRange(pos, pos); } catch { /* поле не поддерживает выделение */ }
    }
    f.amount = el.value;
    if (f.error) { f.error = null; const e = root.querySelector('#err'); if (e) e.outerHTML = '<div class="hint" id="hint">Например, 1 500 или 1 500,50</div>'; }
  }

  const fail = (e) => (e instanceof StoreError ? e.message : 'Не удалось сохранить. Данные не изменились, попробуйте ещё раз.');

  async function save() {
    const r = checkForm(f);
    if (!r.ok) {
      f.error = r.message;
      if (r.field === 'amount') f.amount = '';
      render();
      if (r.field === 'amount') focusAmt(); else scrollToEl(root, '#err');
      return;
    }
    if (edit) {
      const changes = diffExpense(expense, r.expense, name);
      if (!changes.length) { ctx.toast('Изменений нет'); return; }
      review = { kind: 'edit', changes, patch: r.expense }; render(); return;
    }
    try {
      const rec = await ctx.store.addExpense(r.expense);
      await ctx.reload();
      ctx.state.setMonth(monthKey(rec.date)); // история и аналитика сразу покажут месяц, куда попал расход
      f = afterSave(f); addSub = false;
      render({ keepScroll: false });
      root.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      focusAmt();
      ctx.toast('Сохранено', async () => {
        await ctx.store.deleteExpense(rec.id);
        await ctx.reload();
        render();
        ctx.toast('Расход отменён');
      });
    } catch (e) { f.error = fail(e); render(); }
  }

  async function confirm() {
    try {
      if (review.kind === 'del') await ctx.store.deleteExpense(expense.id);
      else await ctx.store.updateExpense(expense.id, review.patch);
      const deleted = review.kind === 'del';
      await ctx.reload();
      ctx.state.setMonth(monthKey(deleted ? expense.date : review.patch.date));
      location.hash = '#/history';
      ctx.toast(deleted ? 'Запись удалена' : 'Изменения сохранены');
    } catch (e) { review = null; f.error = fail(e); render(); }
  }

  async function saveSub() {
    try {
      const rec = await ctx.store.addSubcategory(f.categoryId, newSub);
      await ctx.reload();
      f.subcategoryId = rec.id; addSub = false; newSub = '';
      render(); ctx.toast('Подкатегория добавлена');
    } catch (e) { ctx.toast(e instanceof StoreError ? e.message : 'Не удалось добавить подкатегорию.'); }
  }

  /* ---------- события ---------- */
  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const v = b.dataset;
    if (v.act === 'sheetbg' && ev.target !== b) return; // нажатие внутри карточки не закрывает её
    switch (v.act) {
      case 'back': location.hash = '#/history'; break;
      case 'day': f.date = v.v; render(); break;
      case 'more': f.expanded = !f.expanded; render(); break;
      case 'cat':
        f.categoryId = v.id; f.subcategoryId = null; f.error = null; addSub = false; render();
        // Вниз к подкатегориям (или к «Комментарию», если подкатегорий нет). Наверх и в поле суммы не возвращаем.
        scrollToEl(root, ctx.categories.some((c) => c.parentId === v.id) ? '#subs' : '#extras'); break;
      case 'sub': f.subcategoryId = f.subcategoryId === v.id ? null : v.id; render(); scrollToEl(root, '#extras'); break;
      case 'addsub': addSub = true; newSub = ''; render(); root.querySelector('#newsub')?.focus(); break;
      case 'addsubno': addSub = false; render(); break;
      case 'addsubok': saveSub(); break;
      case 'note': f.showNote = !(f.showNote && !f.note); render(); root.querySelector('#note')?.focus(); break;
      case 'reg': f.isRegular = !f.isRegular; render(); break;
      case 'save': save(); break;
      case 'del': review = { kind: 'del' }; render(); break;
      case 'confirm': confirm(); break;
      case 'unreview': case 'sheetbg': review = null; render(); break;
    }
  };
  root.oninput = (ev) => {
    const t = ev.target;
    if (t.id === 'amt') onAmountInput(t);
    else if (t.id === 'note') f.note = t.value;
    else if (t.id === 'newsub') newSub = t.value;
  };
  root.onchange = (ev) => { if (ev.target.id === 'date' && ev.target.value) { f.date = ev.target.value; render(); } };
  root.onkeydown = (ev) => { if (ev.key === 'Enter' && ev.target.id === 'newsub') { ev.preventDefault(); saveSub(); } };

  render({ keepScroll: false });
  if (!edit) focusAmt();
  return {
    /** Приложение вернулось на экран: если сутки сменились, а форма нетронута, дата становится сегодняшней. */
    resume(prevToday) { if (!edit && !f.amount && f.date === prevToday && ctx.state.today !== prevToday) { f.date = ctx.state.today; render(); } },
  };
}
