/* Значки категорий: линия с круглыми концами. Рисунки те же, что в макете. */
export const ICO = {
  cart: '<path d="M3 4h2.6l2.1 10.2h9.6L19.5 7H7"/><circle cx="9.2" cy="19" r="1.5"/><circle cx="16.2" cy="19" r="1.5"/>',
  bus: '<rect x="4" y="4" width="16" height="13" rx="3.5"/><path d="M4 11h16M8 20v-3M16 20v-3M8 14h.01M16 14h.01"/>',
  paw: '<circle cx="6.5" cy="10" r="1.7"/><circle cx="10.5" cy="6.5" r="1.7"/><circle cx="15.5" cy="6.5" r="1.7"/><circle cx="19" cy="10.5" r="1.7"/><path d="M12.8 11.5c-3 0-5.5 3.2-5.5 5.4 0 2 2 2.2 5.5 1.2 3.5 1 5.5.8 5.5-1.2 0-2.2-2.5-5.4-5.5-5.400z"/>',
  health: '<path d="M12 20s-7.5-4.6-7.5-10.200A4.2 4.2 0 0 1 12 7.400a4.2 4.2 0 0 1 7.5 2.400C19.5 15.4 12 20 12 20z"/><path d="M12 10v4.500M9.8 12.200h4.4"/>',
  gift: '<rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M3 7h18v3H3zM12 7v13M12 7C10.5 3.5 6.5 4 7.5 6.800M12 7c1.5-3.5 5.5-3 4.5-.2"/>',
  star: '<path d="M12 3.500l2.7 5.5 6 .9-4.4 4.3 1 6L12 17.2 6.7 20.200l1-6L3.3 9.900l6-.9z"/>',
  fork: '<path d="M6 3v6a2 2 0 0 0 4 0V3M8 11v10M17 3c-2.2 1.8-3 4.5-3 7.500h3V21"/>',
  repeat: '<path d="M4 11.500A8 8 0 0 1 18.2 7L20 9M20 4.500V9h-4.500M20 12.500A8 8 0 0 1 5.8 17L4 15M4 19.500V15h4.5"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="3.5"/><path d="M10.5 18h3"/>',
  home: '<path d="M3.5 11.500L12 4l8.5 7.500M6 10.500V20h12v-9.500M10 20v-5h4v5"/>',
  shirt: '<path d="M8.5 4L3 7l2.5 4.200L8 10v10h8V10l2.5 1.200L21 7l-5.5-3C15 6 13.8 7 12 7S9 6 8.5 4z"/>',
  book: '<path d="M3.5 5.500C6.5 4 9.5 4.2 12 6.2 14.5 4.2 17.5 4 20.5 5.500v13c-3-1.5-6-1.3-8.5.7-2.5-2-5.5-2.2-8.5-.7z"/><path d="M12 6.200V19"/>',
  dumbbell: '<path d="M3 10v4M6.5 7.500v9M17.5 7.500v9M21 10v4M6.5 12h11"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  coffee: '<path d="M5 9h11v5.500a4.5 4.5 0 0 1-4.5 4.500h-2A4.5 4.5 0 0 1 5 14.500zM16 10.500h1.500a2.2 2.2 0 0 1 0 4.500H16M8.5 4v2.500M12.5 4v2.5"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.600A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  bag: '<path d="M5.5 8h13l-1 12h-11zM9 8V7a3 3 0 0 1 6 0v1"/>',
  plane: '<path d="M3 13l18-8.5-6.5 16-3-6.500z"/><path d="M11.5 14L21 4.5"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="3.5"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>',
  bed: '<path d="M3 19V6M3 15h18v4M21 15v-2.500A3 3 0 0 0 18 9.500h-7V15"/><circle cx="7" cy="11.5" r="1.6"/>',
  ticket: '<path d="M3 8.500l2.5-2.500h13L21 8.500V11a2 2 0 0 0 0 4v2.500L18.5 20h-13L3 17.500V15a2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="1.5 2.5"/>',
  tag: '<path d="M3.5 12.500V4.500h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.3"/>',
  dots: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>'
};

export const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICO[k] || ICO.tag}</svg>`;

/** Значки нижней панели и шапок (отдельно от значков категорий). */
export const UI = {
  hist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
};
