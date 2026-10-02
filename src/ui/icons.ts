// Inline SVG icons (stroke style, currentColor).
const s = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  play: s('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
  pause: s('<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>'),
  gear: s('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  eye: s('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  map: s('<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z"/><path d="M9 4v13M15 6.5v13"/>'),
  restart: s('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v5h5"/>'),
  home: s('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: s('<path d="M15 5l-7 7 7 7"/>'),
  next: s('<path d="M9 5l7 7-7 7"/>'),
  sound: s('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mute: s('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>'),
  music: s('<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/>'),
  help: s('<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 4"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/>'),
  ball: s('<circle cx="12" cy="12" r="8.5"/><circle cx="9.5" cy="9.5" r=".9" fill="currentColor" stroke="none"/><circle cx="13" cy="8.5" r=".9" fill="currentColor" stroke="none"/><circle cx="14.8" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="11" cy="12.8" r=".9" fill="currentColor" stroke="none"/><circle cx="8.6" cy="15" r=".9" fill="currentColor" stroke="none"/><circle cx="12.6" cy="16" r=".9" fill="currentColor" stroke="none"/>'),
  flag: s('<path d="M6 21V3.5"/><path d="M6 4h11l-2.5 4L17 12H6" fill="currentColor"/>'),
  swords: s('<path d="M4 4l9.5 9.5M4 4v4M4 4h4"/><path d="M20 4l-9.5 9.5M20 4v4M20 4h-4"/><path d="M7.5 16.5l-3 3M16.5 16.5l3 3M6 15l3 3M18 15l-3 3"/>'),
  bolt: s('<path d="M13 2.5 4.5 13.5H11L10 21.5l8.5-11H12z" fill="currentColor"/>'),
  target: s('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  lock: s('<rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  check: s('<path d="M4.5 12.5l5 5 10-11"/>'),
  hand: s('<path d="M8 13V5.5a1.6 1.6 0 0 1 3.2 0V11"/><path d="M11.2 10.5V9a1.6 1.6 0 0 1 3.2 0v2"/><path d="M14.4 10.5a1.6 1.6 0 0 1 3.2 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.6-2.2L4 15.6a1.6 1.6 0 0 1 2.5-2l1.5 1.8"/>'),
  flame: s('<path d="M12 2.5c1.2 3.6 5.2 5.6 5.2 10.4a5.2 5.2 0 0 1-10.4 0c0-2.2 1-3.9 2.3-5 .1 1.7.9 2.9 2.3 3.4-.2-3.4-.7-5.9.6-8.8z" fill="currentColor" stroke-width="1.6"/>'),
  feather: s('<path d="M20.5 3.5C12 4 6 9.5 6 17.5V21"/><path d="M6 17.5c5.5 0 10-3.2 11.6-8.6"/><path d="M8.8 13.4h6.4"/><path d="M11.4 9.6h5.4"/>'),
  spring: s('<path d="M5 20.5h14M5 3.5h14"/><path d="M7 6.5l10 2.4-10 2.6 10 2.6-10 2.6"/>'),
  clock: s('<circle cx="12" cy="13" r="8"/><path d="M12 9v4.5l3 1.8M9.5 2.5h5"/>'),
};

export const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l2.95 6.3 6.85.85-5.05 4.75 1.3 6.8L12 17.6l-6.05 3.3 1.3-6.8L2.2 9.35l6.85-.85z" fill="currentColor" stroke="rgba(0,0,0,.25)" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
export const COIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#f7b928" stroke="#b9770e" stroke-width="1.6"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#fff3b0" stroke-width="1.6" opacity=".9"/><path d="M12 8.2v7.6M9.8 10.2h4.4" stroke="#b9770e" stroke-width="1.8" stroke-linecap="round"/></svg>`;
export const TROPHY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="#ffc93a" stroke="#b9770e" stroke-width="1.4"/><path d="M7 5.5H4a3 3 0 0 0 3.5 4M17 5.5h3a3 3 0 0 1-3.5 4" fill="none" stroke="#b9770e" stroke-width="1.6"/><path d="M10.5 13.2h3l.6 3.8h-4.2z" fill="#e8a317"/><rect x="7.5" y="17" width="9" height="3.5" rx="1" fill="#8a5a22"/></svg>`;

/** Tiki mask logo mark. */
export const TIKI_MARK = `<svg viewBox="0 0 120 150" aria-hidden="true">
  <defs>
    <linearGradient id="tkW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9934a"/><stop offset="1" stop-color="#9a5a26"/></linearGradient>
    <linearGradient id="tkL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fd64a"/><stop offset="1" stop-color="#25913a"/></linearGradient>
  </defs>
  <g stroke="#3a1d0b" stroke-width="5" stroke-linejoin="round">
    <path d="M60 6 C48 18 30 16 22 30 C40 28 50 26 60 30 C70 26 80 28 98 30 C90 16 72 18 60 6Z" fill="url(#tkL)"/>
    <path d="M18 34 C30 40 90 40 102 34 L102 118 C102 136 86 144 60 144 C34 144 18 136 18 118Z" fill="url(#tkW)"/>
    <path d="M14 34 H106 V50 H14Z" fill="#7a4220"/>
    <path d="M60 36 L67 43 L60 50 L53 43Z" fill="#e8402e"/>
    <path d="M26 62 Q42 52 56 62" fill="none"/>
    <path d="M64 62 Q78 52 94 62" fill="none"/>
    <ellipse cx="41" cy="72" rx="12" ry="10" fill="#f6e6c4"/>
    <ellipse cx="79" cy="72" rx="12" ry="10" fill="#f6e6c4"/>
    <circle cx="42" cy="73" r="5" fill="#2a1408" stroke="none"/>
    <circle cx="78" cy="73" r="5" fill="#2a1408" stroke="none"/>
    <path d="M60 74 C54 84 50 92 52 96 H68 C70 92 66 84 60 74Z" fill="#e0a262"/>
    <path d="M28 104 Q60 92 92 104 Q86 132 60 132 Q34 132 28 104Z" fill="#2a1208"/>
    <path d="M34 104 Q60 96 86 104 L84 112 Q60 106 36 112Z" fill="#fbf2dc" stroke-width="3"/>
  </g>
</svg>`;
