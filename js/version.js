/* Версия сборки видна в «Настройках», чтобы при проверке на телефоне было ясно, какая версия открыта. */
export const VERSION = '2.1.1';

export const channelName = (pathname) => (/\/beta(\/|$)/.test(pathname) ? 'тестовый (beta)' : 'основной');
