/* Версия сборки видна в «Настройках», чтобы при проверке на телефоне было ясно, какая версия открыта. */
export const VERSION = '2.3.0';

export const channelName = (pathname) => (/\/beta(\/|$)/.test(pathname) ? 'тестовый (beta)' : 'основной');
