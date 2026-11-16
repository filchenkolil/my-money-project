/* «Обсуждение AI»: выбор состава сводки, предпросмотр, копирование в буфер и открытие Claude. */
import { header, esc } from '../ui/dom.js';
import { buildSummary, SUMMARY_LEVELS, normalizeLevel } from '../summary.js';
import { hashFor } from '../router.js';

const KEY = 'mymoney.aiLevel', CLAUDE_URL = 'https://claude.ai/new';
export const getLevel = () => { try { return normalizeLevel(localStorage.getItem(KEY)); } catch { return 'totals'; } };
const setLevel = (v) => { try { localStorage.setItem(KEY, v); } catch { /* память недоступна: выбор действует до закрытия */ } };

/** Буфер обмена и открытие Claude. Для автотестов подменяются через globalThis.__mymoneyAI = { copy, open }. */
const copyText = (t) => (globalThis.__mymoneyAI?.copy ? globalThis.__mymoneyAI.copy(t) : navigator.clipboard.writeText(t));
const openClaude = () => (globalThis.__mymoneyAI?.open ? globalThis.__mymoneyAI.open(CLAUDE_URL) : window.open(CLAUDE_URL, '_blank', 'noopener'));

export function mountAI(root, ctx) {
  let level = getLevel(), note = '', disposed = false;
  const text = () => buildSummary(ctx, level, ctx.state.today);
  function render() {
    const t = text(), lines = t.split('\n').length;
    root.innerHTML = header('Обсуждение AI', '', true) + '<div class="pad"><p class="muted" style="margin:0 0 8px">Приложение соберёт сводку ваших расходов и скопирует её. Вставьте её в чат с Claude и задавайте вопросы. Данные уходят только когда вы сами вставите текст.</p>' +
      '<div class="lbl">Что войдёт в сводку</div><div class="seg" role="group" aria-label="Состав сводки">' + SUMMARY_LEVELS.map(([id, n]) => `<button type="button" data-lv="${id}" aria-pressed="${id === level}">${n}</button>`).join('') + '</div>' +
      `<div class="lbl"><span>Предпросмотр</span><span class="opt num">${lines} строк · ${t.length} знаков</span></div><pre class="preview" tabindex="0">${esc(t)}</pre>` +
      '<button type="button" class="btn primary big" data-act="open" style="margin-top:16px">Скопировать и открыть Claude</button><button type="button" class="btn big" data-act="copy" style="margin-top:8px">Только скопировать</button>' +
      `<div class="small muted" role="status" id="aistatus" style="margin-top:12px;min-height:20px">${esc(note)}</div></div>`;
  }
  async function copy(thenOpen) {
    let p; try { p = Promise.resolve(copyText(text())); } catch (e) { p = Promise.reject(e); }
    if (thenOpen) openClaude(); // сразу, пока нажатие «действует»: после ожидания Safari может заблокировать открытие
    try { await p; note = thenOpen ? 'Сводка скопирована. Если Claude не открылся, откройте его и вставьте текст.' : 'Сводка скопирована. Вставьте её в чат с Claude.'; }
    catch { note = 'Не удалось скопировать. Выделите текст в предпросмотре и скопируйте вручную.'; }
    if (!disposed) { const s = root.querySelector('#aistatus'); if (s) s.textContent = note; }
  }
  root.onclick = (ev) => {
    const lv = ev.target.closest('[data-lv]');
    if (lv) { level = normalizeLevel(lv.dataset.lv); setLevel(level); note = ''; render(); return; }
    const b = ev.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'back') { if (history.length > 1) history.back(); else location.hash = hashFor('analytics'); }
    else if (b.dataset.act === 'open') copy(true);
    else if (b.dataset.act === 'copy') copy(false);
  };
  render();
  return { dispose() { disposed = true; } };
}
