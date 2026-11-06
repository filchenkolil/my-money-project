/* Работа с файлами: сохранить (через меню «Поделиться» iPhone, запасной вариант: скачивание) и прочитать выбранный файл.
   Для автотестов можно подменить поведение через globalThis.__mymoneyFiles = { save, read }: настоящее окно «Поделиться» в тестах не открывается. */

/** Сохраняет текстовый файл. Возвращает 'shared' | 'downloaded' | 'cancelled'. */
export async function saveTextFile(name, text, mime) {
  if (globalThis.__mymoneyFiles?.save) return globalThis.__mymoneyFiles.save(name, text, mime);
  const type = mime || 'text/plain';
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; /* иначе пробуем скачать */ }
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

/** Текст выбранного файла. */
export async function readTextFile(file) {
  if (globalThis.__mymoneyFiles?.read) return globalThis.__mymoneyFiles.read(file);
  return file.text();
}
