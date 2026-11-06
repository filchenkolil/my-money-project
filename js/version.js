/* Версия сборки видна в «Настройках», чтобы при проверке на телефоне было ясно, какая версия открыта. */
export const VERSION = '0.4.0 (этап 4)';

export const channelName = (pathname) => (/\/beta(\/|$)/.test(pathname) ? 'тестовый (beta)' : 'основной');
