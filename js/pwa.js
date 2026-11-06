/* Установка служебного скрипта и баннер «Доступна новая версия».
   На локальном компьютере (localhost) скрипт не ставится, чтобы при разработке не залипали старые файлы; для проверки добавьте ?sw=1. */

export function registerServiceWorker({ onUpdate }) {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname) && !/[?&]sw=1/.test(location.search);
  if (local) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  // Страница перезагружается, только когда пользователь согласился на обновление (а не при самой первой установке)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).then((reg) => {
    const offer = (worker) => onUpdate(() => worker.postMessage('skipWaiting'));
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    const check = () => reg.update().catch(() => { /* нет сети: проверим в другой раз */ });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    check();
  }).catch(() => { /* без служебного скрипта приложение работает, только не офлайн */ });
}

export function showUpdateBanner(app, apply) {
  if (app.querySelector('.updatebar')) return;
  const bar = document.createElement('div');
  bar.className = 'updatebar'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span style="flex:1">Доступна новая версия приложения.</span><button type="button" class="btn" data-update>Обновить</button>';
  bar.querySelector('[data-update]').addEventListener('click', () => { bar.querySelector('button').disabled = true; apply(); });
  app.prepend(bar);
}
