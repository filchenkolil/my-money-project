/* Экспорт, восстановление и сброс данных. */
import { monthLabel, dayShort, exportReminderDue } from '../dates.js';
import { monthStripKeys } from '../history.js';
import { buildBackup, buildCsv, parseBackup, planRestore, csvFileName, jsonFileName, RESTORE_ERRORS } from '../backup.js';
import { NO_FILTERS } from '../history.js';
import { expenseWord } from '../form.js';
import { StoreError } from '../store.js';
import { esc, header, sheetHTML } from '../ui/dom.js';
import { saveTextFile, readTextFile } from '../ui/files.js';
import { hashFor } from '../router.js';

const fail = (e) => (e instanceof StoreError ? e.message : 'Не удалось выполнить. Данные не изменились, попробуйте ещё раз.');

export function mountBackup(root, ctx) {
  const { state } = ctx;
  let period = '', plan = null, error = '', last = null, busy = false;
  const months = () => monthStripKeys(ctx.expenses, state.today).reverse();
  ctx.store.getMeta('lastExportDate').then((v) => { last = v; render(); });

  function html() {
    let h = header('Экспорт и восстановление', '', true) + '<div class="pad">';
    if (exportReminderDue(state.today, last)) h += '<div class="banner"><span style="flex:1">Конец месяца: сделайте экспорт.</span></div>';
    h += `<p class="muted small" style="margin:4px 0 0">${last ? 'Последний экспорт: ' + esc(dayShort(last)) + ' ' + last.slice(0, 4) : 'Экспорт ещё не делался.'}</p>`;
    h += `<div class="lbl">Экспорт</div><select class="inp" id="period" aria-label="Период экспорта"><option value="">Весь период</option>${months().map((k) => `<option value="${k}"${period === k ? ' selected' : ''}>${esc(monthLabel(k))}</option>`).join('')}</select>`;
    h += '<div class="grid2" style="margin-top:12px"><button type="button" class="btn primary" data-act="csv">CSV для чтения</button><button type="button" class="btn primary" data-act="json">JSON для восстановления</button></div>';
    h += '<p class="muted small" style="margin:8px 4px 0">CSV открывается в Excel. JSON нужен для восстановления: в нём категории, цвета, порядок и версия схемы.</p>';
    h += '<div class="lbl">Восстановление</div>';
    if (ctx.expenses.length) h += '<div class="notice"><b>В приложении уже есть данные.</b><br>Записи из файла будут добавлены к ним и могут дублироваться.</div>';
    if (error) h += `<div class="err" role="alert"><b>Файл не подошёл.</b><br>${esc(error)}</div>`;
    h += '<label class="btn big filebtn" style="display:block;text-align:center;margin-top:10px">Выбрать файл JSON<input type="file" id="file" accept=".json,application/json" hidden></label></div>';
    if (plan) {
      const n = plan.expenses.length, c = plan.createdCategories;
      h += sheetHTML(`<h3>Восстановить из файла?</h3><div class="card">В файле ${expenseWord(n)}${c ? `, новых категорий: ${c}` : ''}. Они будут <b>добавлены</b> к тем, что уже есть в приложении.${ctx.expenses.length ? ' Повторное восстановление того же файла создаст дубли.' : ''}</div><div class="sheetbtns"><button type="button" class="btn primary big" data-act="restore">Добавить</button><button type="button" class="btn big" data-act="cancel">Отмена</button></div>`);
    }
    return h;
  }
  function render() { const t = root.scrollTop; root.innerHTML = html(); root.scrollTop = t; }

  async function doExport(kind) {
    if (busy) return; busy = true;
    try {
      // данные берём из памяти, чтобы вызвать меню «Поделиться» сразу по касанию (iOS требует жест пользователя)
      const res = kind === 'csv'
        ? await saveTextFile(csvFileName(period || null), buildCsv(ctx.expenses, ctx.categories, period || null), 'text/csv')
        : await saveTextFile(jsonFileName(state.today), buildBackup({ categories: ctx.categories, expenses: ctx.expenses }), 'application/json');
      if (res === 'cancelled') return;
      await ctx.store.setMeta('lastExportDate', state.today); last = state.today; render();
      ctx.toast(res === 'shared' ? 'Файл готов: выберите «Сохранить в Файлы»' : 'Файл сохранён в «Загрузки»');
    } catch { ctx.toast('Не удалось сохранить файл. Попробуйте ещё раз.'); } finally { busy = false; }
  }

  async function onFile(file) {
    error = ''; plan = null;
    try {
      const r = parseBackup(await readTextFile(file));
      if (!r.ok) error = RESTORE_ERRORS[r.reason]; else plan = planRestore(ctx.categories, r.data);
    } catch { error = RESTORE_ERRORS.not_json; }
    render();
  }
  async function restore() {
    try {
      const r = await ctx.store.applyRestore(plan);
      plan = null; await ctx.reload();
      state.setMonth(r.expenses ? [...ctx.expenses].sort((a, b) => (a.date < b.date ? 1 : -1))[0].date.slice(0, 7) : state.month);
      render(); ctx.toast(`Добавлено: ${expenseWord(r.expenses)}`);
    } catch (e) { plan = null; error = fail(e); render(); }
  }

  root.onclick = (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'sheetbg' && ev.target !== b) return;
    switch (b.dataset.act) {
      case 'back': location.hash = hashFor('settings'); break;
      case 'csv': doExport('csv'); break;
      case 'json': doExport('json'); break;
      case 'restore': restore(); break;
      case 'cancel': case 'sheetbg': plan = null; render(); break;
    }
  };
  root.onchange = (ev) => {
    if (ev.target.id === 'period') { period = ev.target.value; render(); }
    else if (ev.target.id === 'file') { const f = ev.target.files?.[0]; if (f) onFile(f); }
  };
  render();
  return {};
}

export function mountReset(root, ctx) {
  let confirm = false, error = '';
  const html = () => header('Сброс данных', '', true) + `<div class="pad"><div class="err" style="margin:0 0 12px">Будут удалены все расходы, категории и настройки на этом телефоне. Восстановить их можно только из файла JSON.</div><button type="button" class="btn big" data-act="export" style="margin-bottom:8px">Сначала сделать экспорт</button><button type="button" class="btn danger big" data-act="ask">Удалить все данные</button>${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}</div>` +
    (confirm ? sheetHTML('<h3>Удалить все данные?</h3><div class="card">Это нельзя отменить. Расходы и категории исчезнут, останется стартовый набор категорий.</div><div class="sheetbtns"><button type="button" class="btn danger big" data-act="confirm">Да, удалить всё</button><button type="button" class="btn big" data-act="cancel">Отмена</button></div>') : '');
  function render() { root.innerHTML = html(); }
  root.onclick = async (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'sheetbg' && ev.target !== b) return;
    switch (b.dataset.act) {
      case 'back': location.hash = hashFor('settings'); break;
      case 'export': location.hash = hashFor('backup'); break;
      case 'ask': confirm = true; render(); break;
      case 'cancel': case 'sheetbg': confirm = false; render(); break;
      case 'confirm':
        try {
          await ctx.store.resetAll(); await ctx.store.seedDefaultsIfEmpty(); await ctx.reload();
          ctx.state.filters = { ...NO_FILTERS }; ctx.state.setMonth(ctx.state.currentMonth);
          location.hash = hashFor('add'); ctx.toast('Все данные удалены');
        } catch (e) { confirm = false; error = fail(e); render(); }
        break;
    }
  };
  render();
  return {};
}

