/* Форма расхода: «Новый расход» (главный экран) и «Редактирование» (та же форма, с проверкой изменений).
   Два вида расхода: «Ежедневные расходы» и «Поездки» (v2); переключатель вверху формы.
   Порядок сверху вниз: сумма, дата, категория, подкатегория (или поездка и категория поездки), комментарий, «Сохранить». */
import { formatInput, formatRub, toInputString } from '../money.js';
import { dayShort, monthKey, shiftMonthsISO, rangeLabel } from '../dates.js';
import { dayTotal, frequentCategories } from '../stats.js';
import { newForm, afterSave, checkForm, tileList, expenseWord, expenseToForm, diffExpense } from '../form.js';
import { checkTripForm, conversionText, defaultTripId, diffTripExpense, expenseRub, suggestRub, frequentTripCategories } from '../trips.js';
import { StoreError } from '../store.js';
import { icon, UI } from '../ui/icons.js';
import { esc, dotHTML, header, scrollToEl, installNotice, sheetHTML } from '../ui/dom.js';
import { stripHTML, mountStrip } from '../ui/datestrip.js';
import { hashFor } from '../router.js';

/**
 * expense: если задан, экран работает как правка этого расхода; kind: 'regular' (обычный) или 'trip' (расход поездки).
 */
export function mountExpenseForm(root, ctx, { expense = null, kind = 'regular' } = {}) {
  const edit = !!expense, origTrip = edit && kind === 'trip';
  const state = ctx.state;
  let mode = origTrip ? 'trip' : 'plain';
  let f = origTrip ? { ...newForm(expense.date), amount: toInputString(expense.amount), note: expense.note ?? '', showNote: !!expense.note }
    : edit ? expenseToForm(expense) : newForm(state.today);
  // выбор поездки: категория поездки, рубли или валюта поездки
  let tf = { tripId: origTrip ? expense.tripId : null, categoryId: origTrip ? expense.categoryId : null, rub: origTrip ? !!expense.isRub : false };
  if (!edit && state.presetTrip) { mode = 'trip'; tf.tripId = state.presetTrip; delete state.presetTrip; } // пришли с экрана поездки
  if (!tf.tripId) tf.tripId = defaultTripId(ctx.trips, f.date, state.lastTrip);
  let addSub = false, newSub = '', review = null;
  let disposed = false, saving = false, topTimers = [];
  const tops = () => ctx.categories.filter((c) => c.parentId === null);
  // Порядок плиток считаем один раз за открытие экрана: во время ввода пачкой плитки не должны прыгать.
  const order = frequentCategories(ctx.expenses, tops().map((c) => c.id), state.today);
  let tOrder = null; // порядок плиток категорий поездки: считаем при открытии и при смене поездки, чтобы плитки не прыгали во время ввода
  const tripTiles = () => { tOrder ??= frequentTripCategories(ctx.tripExpenses, tf.tripId, ctx.tripCategories.map((c) => c.id)); return tOrder.map(tcat).filter(Boolean); };
  const cat = (id) => ctx.categories.find((c) => c.id === id);
  const name = (id) => cat(id)?.name ?? '';
  const trip = () => ctx.trips.find((t) => t.id === tf.tripId) ?? null;
  const tcat = (id) => ctx.tripCategories.find((c) => c.id === id);
  const tripOf = (id) => ctx.trips.find((t) => t.id === id);
  const tripNames = { trip: (id) => tripOf(id)?.name ?? '', cat: (id) => tcat(id)?.name ?? '', tripOf };

  function dayLine() {
    const d = dayTotal(ctx.expenses, f.date);
    const label = f.date === state.today ? 'За сегодня' : 'За ' + dayShort(f.date);
    return d.count ? `<div class="dateline">${label}: ${expenseWord(d.count)} · <b class="num">${formatRub(d.total)}</b></div>` : '';
  }

  const tile = (id) => `<button type="button" class="tile" data-act="cat" data-id="${id}" aria-pressed="${f.categoryId === id}">${dotHTML(cat(id))}<span class="nm">${esc(name(id))}</span></button>`;
  const ttile = (c) => `<button type="button" class="tile" data-act="tcat" data-id="${c.id}" aria-pressed="${tf.categoryId === c.id}">${dotHTML(c)}<span class="nm">${esc(c.name)}</span></button>`;

  function reviewHTML() {
    if (!review) return '';
    const del = review.kind === 'del';
    const body = del
      ? `<div class="card"><b>Запись будет удалена</b><div class="small muted" style="margin-top:8px">${esc(review.summary)}</div></div>`
      : `<div class="diff">${review.changes.map((c) => `<div class="d"><span class="small muted">${esc(c.label)}</span><span><s>${esc(c.from)}</s> → <b>${esc(c.to)}</b></span></div>`).join('')}</div>`;
    return sheetHTML(`<h3>${del ? 'Удалить запись?' : 'Проверьте изменения'}</h3>${body}<div class="sheetbtns"><button type="button" class="btn ${del ? 'danger' : 'primary'} big" data-act="confirm">${del ? 'Удалить' : 'Применить изменения'}</button><button type="button" class="btn big" data-act="unreview">Вернуться к редактированию</button></div>`);
  }

  /** Переключатель вида расхода. */
  const modeSwitch = () => `<div class="seg" role="group" aria-label="Вид расхода" style="margin-top:8px"><button type="button" data-act="mode" data-v="plain" aria-pressed="${mode === 'plain'}">Ежедневные расходы</button><button type="button" data-act="mode" data-v="trip" aria-pressed="${mode === 'trip'}">Поездки</button></div>`;

  function plainBody() {
    const { ids, hidden } = tileList(order, f.categoryId, f.expanded);
    const subs = f.categoryId ? ctx.categories.filter((c) => c.parentId === f.categoryId) : [];
    const note = f.note || f.showNote;
    let h = `<input class="inp amt num" id="amt" inputmode="decimal" autocomplete="off" aria-label="Сумма" placeholder="Введите сумму" value="${esc(f.amount)}">`;
    h += f.error ? `<div class="err" role="alert" id="err">${esc(f.error)}</div>` : '<div class="hint" id="hint">Например, 1 500 или 1 500,50</div>';
    h += stripHTML(state.today, f.date) + (edit ? '' : dayLine());
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
    return h;
  }

  function tripBody() {
    const t = trip(), note = f.note || f.showNote;
    if (!ctx.trips.length) return '<div class="card" style="margin-top:12px"><b>Сначала создайте поездку.</b><p class="muted" style="margin:8px 0 12px">Расходы поездки копятся отдельно и не смешиваются с обычными.</p><button type="button" class="btn primary big" data-act="newtrip">Создать поездку</button></div>';
    const chips = t && t.currency !== 'RUB' ? `<span class="chips" style="gap:4px"><button type="button" class="chip" data-act="cur" data-v="local" aria-pressed="${!tf.rub}">${esc(t.currency)}</button><button type="button" class="chip" data-act="cur" data-v="rub" aria-pressed="${tf.rub}">₽</button></span>` : '';
    let h = `<div class="lbl" style="margin-top:8px"><span>Сумма</span>${chips}</div>`;
    h += `<input class="inp amt num" id="amt" inputmode="decimal" autocomplete="off" aria-label="Сумма" placeholder="Введите сумму" value="${esc(f.amount)}" style="margin-top:0">`;
    h += f.error ? `<div class="err" role="alert" id="err">${esc(f.error)}</div>` : `<div class="hint" id="conv">${esc(conversionText(t, f.amount, tf.rub))}</div>`;
    h += stripHTML(state.today, f.date);
    h += `<div class="lbl">Поездка</div><select class="inp" id="tripsel" aria-label="Поездка">${ctx.trips.map((x) => `<option value="${esc(x.id)}"${x.id === tf.tripId ? ' selected' : ''}>${esc(x.name + ', ' + rangeLabel(x.start, x.end))}</option>`).join('')}</select>`;
    h += '<div class="lbl">Категория поездки</div><div class="tiles">' + tripTiles().map(ttile).join('') + '</div>';
    h += `<div class="chips" id="extras" style="margin-top:16px"><button type="button" class="chip" data-act="note" aria-pressed="${!!note}">${note ? 'Комментарий' : '+ Комментарий'}</button></div>`;
    if (note) h += `<input class="inp" id="note" maxlength="200" style="margin-top:8px" aria-label="Комментарий" placeholder="на что потратила" value="${esc(f.note)}">`;
    return h;
  }

  function html() {
    const range = edit ? '' : ` min="${shiftMonthsISO(state.today, -2)}" max="${shiftMonthsISO(state.today, 2)}"`;
    let h = header(edit ? 'Редактирование' : 'Новый расход', `<label class="ib" aria-label="Выбрать другую дату">${UI.cal}<input class="dpick" type="date" id="date" aria-label="Выбрать другую дату" value="${f.date}"${range} tabindex="-1"></label>`, edit);
    h += '<div class="pad">';
    if (!edit) h += installNotice(ctx.expenses.length > 0 || ctx.tripExpenses.length > 0);
    h += modeSwitch() + (mode === 'trip' ? tripBody() : plainBody());
    if (edit) h += '<button type="button" class="btn danger big" style="margin-top:24px" data-act="del">Удалить запись</button>';
    const noSave = mode === 'trip' && !ctx.trips.length;
    h += noSave ? '</div>' : `</div><div class="savebar"><button type="button" class="btn primary big" data-act="save" id="save">${edit ? 'Сохранить изменения' : 'Сохранить'}</button></div>`;
    return h + reviewHTML();
  }

  function render({ keepScroll = true } = {}) {
    if (disposed) return; // экран уже закрыт: ответ из базы пришёл после ухода пользователя
    const top = keepScroll ? root.scrollTop : 0;
    root.innerHTML = html();
    mountStrip(root, f.date);
    root.scrollTop = top;
  }

  const focusAmt = () => { const a = root.querySelector('#amt'); if (a) { try { a.focus({ preventScroll: true }); } catch { a.focus(); } } };

  /* ---------- ввод суммы: пробелы разрядов по ходу набора, курсор не прыгает ---------- */
  const hintHTML = () => (mode === 'trip' ? `<div class="hint" id="conv">${esc(conversionText(trip(), f.amount, tf.rub))}</div>` : '<div class="hint" id="hint">Например, 1 500 или 1 500,50</div>');
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
    if (f.error) { f.error = null; const e = root.querySelector('#err'); if (e) e.outerHTML = hintHTML(); }
    else { const c = root.querySelector('#conv'); if (c) c.textContent = conversionText(trip(), f.amount, tf.rub); } // пересчёт обновляется по ходу ввода
  }

  const fail = (e) => (e instanceof StoreError ? e.message : 'Не удалось сохранить. Данные не изменились, попробуйте ещё раз.');
  const showError = (r) => {
    f.error = r.message;
    if (r.field === 'amount') f.amount = '';
    render();
    if (r.field === 'amount') focusAmt(); else scrollToEl(root, r.field === 'trip' ? '#tripsel' : '#err');
  };

  /** Расход поездки → запись; подпись для удаления и проверки. */
  const tripSummaryText = (e) => `${tcat(e.categoryId)?.name ?? ''} · ${tripOf(e.tripId)?.name ?? ''} · ${formatRub(expenseRub(e, tripOf(e.tripId) ?? { currency: 'RUB', rateE4: 10000 }))}${e.note ? ' · ' + e.note : ''} · ${dayShort(e.date)}`;

  async function save() {
    if (mode === 'trip') return saveTrip();
    const r = checkForm(f);
    if (!r.ok) return showError(r);
    if (edit) {
      if (origTrip) { // расход поездки становится обычным
        const rec = { id: expense.id, ...r.expense, createdAt: expense.createdAt };
        review = { kind: 'edit', changes: [{ label: 'Вид расхода', from: `Расход поездки «${tripOf(expense.tripId)?.name ?? ''}»`, to: 'Обычный расход' }, { label: 'Сумма', from: formatRub(expenseRub(expense, tripOf(expense.tripId) ?? { currency: 'RUB', rateE4: 10000 })), to: formatRub(rec.amount) }, { label: 'Категория', from: tcat(expense.categoryId)?.name ?? '', to: name(rec.categoryId) }],
          run: async () => { await ctx.store.convertExpense({ kind: 'trip', id: expense.id }, { kind: 'regular', record: rec }); return rec.date; }, after: '#/history' };
        render(); return;
      }
      const changes = diffExpense(expense, r.expense, name);
      if (!changes.length) { ctx.toast('Изменений нет'); return; }
      review = { kind: 'edit', changes, run: async () => { await ctx.store.updateExpense(expense.id, r.expense); return r.expense.date; }, after: '#/history' }; render(); return;
    }
    if (saving) return; // второе нажатие, пока идёт запись, не должно создать дубль
    saving = true;
    try {
      const rec = await ctx.store.addExpense(r.expense);
      await ctx.reload();
      state.setMonth(monthKey(rec.date)); // история и аналитика сразу покажут месяц, куда попал расход
      f = afterSave(f); addSub = false;
      finishAdd(async () => { await ctx.store.deleteExpense(rec.id); });
    } catch (e) { f.error = fail(e); render(); } finally { saving = false; }
  }

  async function saveTrip() {
    const r = checkTripForm(f, tf, ctx.trips);
    if (!r.ok) return showError(r);
    if (edit) {
      if (!origTrip) { // обычный расход становится расходом поездки
        const rec = { id: expense.id, ...r.expense, createdAt: expense.createdAt };
        review = { kind: 'edit', changes: [{ label: 'Вид расхода', from: 'Обычный расход', to: `Расход поездки «${tripOf(rec.tripId)?.name ?? ''}»` }, { label: 'Категория', from: name(expense.categoryId), to: tcat(rec.categoryId)?.name ?? '' }, { label: 'Сумма', from: formatRub(expense.amount), to: rec.isRub || tripOf(rec.tripId)?.currency === 'RUB' ? formatRub(rec.amount) : `${f.amount} ${tripOf(rec.tripId)?.currency}` }],
          run: async () => { await ctx.store.convertExpense({ kind: 'regular', id: expense.id }, { kind: 'trip', record: rec }); return rec.date; }, after: hashFor('trip', rec.tripId) };
        render(); return;
      }
      const changes = diffTripExpense(expense, r.expense, tripNames);
      if (!changes.length) { ctx.toast('Изменений нет'); return; }
      review = { kind: 'edit', changes, run: async () => { await ctx.store.updateTripExpense(expense.id, r.expense); return r.expense.date; }, after: hashFor('trip', r.expense.tripId) }; render(); return;
    }
    if (saving) return;
    saving = true;
    try {
      const rec = await ctx.store.addTripExpense(r.expense);
      await ctx.reload();
      state.lastTrip = rec.tripId;
      state.setMonth(monthKey(rec.date));
      const keep = { date: f.date }; f = { ...afterSave(f), date: keep.date }; tf.categoryId = null; // остаются поездка, валюта и дата: ввод пачкой
      finishAdd(async () => { await ctx.store.deleteTripExpense(rec.id); });
    } catch (e) { f.error = fail(e); render(); } finally { saving = false; }
  }

  /** После добавления: убрать клавиатуру, вернуться наверх, показать «Сохранено» с «Отменить». */
  function finishAdd(undoFn) {
    document.activeElement?.blur?.();
    render({ keepScroll: false });
    backToTop();
    ctx.toast('Сохранено', async () => { await undoFn(); await ctx.reload(); render(); ctx.toast('Расход отменён'); });
  }

  /**
   * Возврат наверх после сохранения: сразу, без анимации, и ещё раз, когда iPhone закончит убирать клавиатуру
   * (иначе изменение размера экрана сбивает прокрутку). Если пользователь сам коснулся экрана, больше не вмешиваемся.
   */
  function backToTop() {
    topTimers.forEach(clearTimeout);
    const go = () => { if (!disposed) root.scrollTop = 0; };
    go();
    topTimers = [120, 350, 700].map((ms) => setTimeout(go, ms));
    root.addEventListener('touchstart', () => topTimers.forEach(clearTimeout), { once: true, passive: true });
  }

  async function confirm() {
    if (saving) return; saving = true;
    const r = review;
    try {
      const date = await r.run();
      await ctx.reload();
      if (date) state.setMonth(monthKey(date));
      location.hash = r.after;
      ctx.toast(r.kind === 'del' ? 'Запись удалена' : 'Изменения сохранены');
    } catch (e) { review = null; f.error = fail(e); render(); } finally { saving = false; }
  }

  function askDelete() {
    review = origTrip
      ? { kind: 'del', summary: tripSummaryText(expense), run: async () => { await ctx.store.deleteTripExpense(expense.id); return expense.date; }, after: hashFor('trip', expense.tripId) }
      : { kind: 'del', summary: `${name(expense.categoryId)} · ${formatRub(expense.amount)}${expense.note ? ' · ' + expense.note : ''} · ${dayShort(expense.date)}`, run: async () => { await ctx.store.deleteExpense(expense.id); return expense.date; }, after: '#/history' };
    render();
  }

  async function saveSub() {
    try {
      const rec = await ctx.store.addSubcategory(f.categoryId, newSub);
      await ctx.reload();
      f.subcategoryId = rec.id; addSub = false; newSub = '';
      render(); ctx.toast('Подкатегория добавлена');
    } catch (e) { ctx.toast(e instanceof StoreError ? e.message : 'Не удалось добавить подкатегорию.'); }
  }

  /** Смена вида в правке: при переходе расхода поездки в обычный сумма показывается в рублях. */
  function switchMode(next) {
    if (next === mode) return;
    if (edit && origTrip && next === 'plain') {
      const t = tripOf(expense.tripId); if (t) f.amount = toInputString(expenseRub(expense, t));
    }
    mode = next; f.error = null;
    if (mode === 'trip' && !tf.tripId) tf.tripId = defaultTripId(ctx.trips, f.date, state.lastTrip);
    render();
  }

  /* ---------- события ---------- */
  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const v = b.dataset;
    if (v.act === 'sheetbg' && ev.target !== b) return; // нажатие внутри карточки не закрывает её
    switch (v.act) {
      case 'back': location.hash = origTrip ? hashFor('trip', expense.tripId) : '#/history'; break;
      case 'mode': switchMode(v.v); break;
      case 'newtrip': location.hash = hashFor('tripedit', 'new'); break;
      case 'day': f.date = v.v; if (mode === 'trip' && !edit) tf.tripId = defaultTripId(ctx.trips, f.date, tf.tripId); render(); break;
      case 'more': f.expanded = !f.expanded; render(); break;
      case 'cat':
        f.categoryId = v.id; f.subcategoryId = null; f.error = null; addSub = false; render();
        // Вниз к подкатегориям (или к «Комментарию», если подкатегорий нет). Наверх и в поле суммы не возвращаем.
        scrollToEl(root, ctx.categories.some((c) => c.parentId === v.id) ? '#subs' : '#extras'); break;
      case 'tcat': tf.categoryId = v.id; f.error = null; if (!tf.curTouched && !origTrip) tf.rub = suggestRub(trip(), ctx.tripExpenses, v.id); render(); scrollToEl(root, '#extras'); break;
      case 'cur': tf.rub = v.v === 'rub'; tf.curTouched = true; render(); break;
      case 'sub': f.subcategoryId = f.subcategoryId === v.id ? null : v.id; render(); scrollToEl(root, '#extras'); break;
      case 'addsub': addSub = true; newSub = ''; render(); root.querySelector('#newsub')?.focus(); break;
      case 'addsubno': addSub = false; render(); break;
      case 'addsubok': saveSub(); break;
      case 'note': f.showNote = !(f.showNote && !f.note); render(); root.querySelector('#note')?.focus(); break;
      case 'reg': f.isRegular = !f.isRegular; render(); break;
      case 'save': save(); break;
      case 'del': askDelete(); break;
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
  root.onchange = (ev) => {
    const t = ev.target;
    if (t.id === 'date' && t.value) { f.date = t.value; if (mode === 'trip' && !edit) tf.tripId = defaultTripId(ctx.trips, f.date, tf.tripId); render(); }
    else if (t.id === 'tripsel') { tf.tripId = t.value; tOrder = null; if (trip()?.currency === 'RUB') tf.rub = false; else if (!tf.curTouched && !origTrip) tf.rub = suggestRub(trip(), ctx.tripExpenses, tf.categoryId); render(); }
  };
  root.onkeydown = (ev) => {
    if (ev.key !== 'Enter') return;
    if (ev.target.id === 'newsub') { ev.preventDefault(); saveSub(); }
    else if (ev.target.id === 'amt' || ev.target.id === 'note') { ev.preventDefault(); ev.target.blur(); } // «Ввод» убирает клавиатуру, и «Сохранить» снова видна
  };

  render({ keepScroll: false });
  return {
    /** Приложение вернулось на экран: если сутки сменились, а форма нетронута, дата становится сегодняшней. */
    resume(prevToday) { if (!edit && !f.amount && f.date === prevToday && state.today !== prevToday) { f.date = state.today; render(); } },
    dispose() { disposed = true; topTimers.forEach(clearTimeout); },
  };
}
