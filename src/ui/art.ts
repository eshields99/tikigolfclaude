// Illustrated course card art (inline SVG).
const palm = (x: number, y: number, s: number, lean = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 0 C ${4 * lean} -20 ${8 * lean} -40 ${14 * lean} -58" stroke="#8a5a2e" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M0 0 C ${4 * lean} -20 ${8 * lean} -40 ${14 * lean} -58" stroke="#b07a42" stroke-width="7" stroke-dasharray="3 5" fill="none"/>
    <g transform="translate(${14 * lean} -58)" fill="#3fae3f" stroke="#1f6b27" stroke-width="1.5">
      <path d="M0 0 C -14 -10 -30 -6 -40 6 C -26 0 -14 2 0 0Z"/>
      <path d="M0 0 C 14 -12 32 -8 42 6 C 28 -1 14 2 0 0Z"/>
      <path d="M0 0 C -6 -16 -2 -30 8 -38 C 4 -24 4 -12 0 0Z"/>
      <path d="M0 0 C -18 2 -30 14 -32 26 C -22 14 -12 8 0 0Z" fill="#58c24a"/>
      <path d="M0 0 C 18 2 30 14 34 26 C 22 14 12 8 0 0Z" fill="#58c24a"/>
      <circle cx="-3" cy="5" r="4" fill="#6b4a22" stroke="none"/><circle cx="4" cy="6" r="4" fill="#5b3d1a" stroke="none"/>
    </g>
  </g>`;

const tiki = (x: number, y: number, s: number) => `
  <g transform="translate(${x} ${y}) scale(${s})" stroke="#3a1d0b" stroke-width="2">
    <rect x="-12" y="-38" width="24" height="38" rx="5" fill="#c07a3c"/>
    <rect x="-14" y="-40" width="28" height="7" rx="2" fill="#7a4220"/>
    <ellipse cx="-5" cy="-24" rx="4" ry="3.4" fill="#f6e6c4"/><ellipse cx="5" cy="-24" rx="4" ry="3.4" fill="#f6e6c4"/>
    <path d="M-8 -12 Q0 -16 8 -12 Q6 -4 0 -4 Q-6 -4 -8 -12Z" fill="#2a1208"/>
    <path d="M-6 -12 Q0 -14 6 -12" stroke="#fbf2dc" stroke-width="2.4" fill="none"/>
  </g>`;

const flag = (x: number, y: number, s: number) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="0" rx="7" ry="2.5" fill="#1d2a20"/>
    <path d="M0 0 V-34" stroke="#fff" stroke-width="2.5"/>
    <path d="M0 -34 L16 -29 L0 -24Z" fill="#e0242c"/>
  </g>`;

export function courseArt(id: string): string {
  if (id === 'coconut')
    return `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="cs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3aa7ff"/><stop offset="1" stop-color="#bff0ff"/></linearGradient>
        <linearGradient id="cw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22c3c7"/><stop offset="1" stop-color="#0b8fb0"/></linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#cs)"/>
      <circle cx="252" cy="44" r="22" fill="#fff6c2"/><circle cx="252" cy="44" r="34" fill="#fff6c2" opacity=".35"/>
      <g fill="#fff" opacity=".9"><ellipse cx="70" cy="40" rx="30" ry="10"/><ellipse cx="92" cy="34" rx="20" ry="12"/><ellipse cx="190" cy="60" rx="24" ry="7"/></g>
      <path d="M0 112 Q 80 104 160 110 T 320 108 V200 H0Z" fill="url(#cw)"/>
      <path d="M262 112 l14 -14 l16 14z" fill="#3f8a6a" opacity=".7"/>
      <ellipse cx="160" cy="150" rx="132" ry="34" fill="#f6dfa4"/>
      <ellipse cx="160" cy="146" rx="112" ry="26" fill="#5cc84a"/>
      <path d="M78 150 Q120 128 170 140 Q220 152 244 136" stroke="#4caf27" stroke-width="20" fill="none" stroke-linecap="round"/>
      <path d="M78 150 Q120 128 170 140 Q220 152 244 136" stroke="#6cd23a" stroke-width="12" stroke-dasharray="8 8" fill="none" stroke-linecap="round"/>
      ${flag(240, 138, 1)}
      <circle cx="84" cy="148" r="3.5" fill="#fff"/>
      ${palm(58, 150, 1.05, 1)}${palm(270, 152, 0.8, -1)}${tiki(118, 148, 0.75)}
      <path d="M0 176 Q 60 168 120 178 T 240 176 T 320 178 V200 H0Z" fill="#fff" opacity=".35"/>
    </svg>`;
  if (id === 'jungle')
    return `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="js" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a8fd8"/><stop offset=".7" stop-color="#ffd9a0"/></linearGradient>
        <linearGradient id="jf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8fdff"/><stop offset="1" stop-color="#8fe0e6"/></linearGradient>
      </defs>
      <rect width="320" height="200" fill="url(#js)"/>
      <circle cx="70" cy="70" r="26" fill="#ffe7a8" opacity=".9"/>
      <path d="M150 200 V70 Q160 40 200 36 Q250 30 270 60 L320 70 V200Z" fill="#3e7a3a"/>
      <path d="M150 70 Q160 40 200 36 Q250 30 270 60" fill="none" stroke="#2c5a2a" stroke-width="4"/>
      <path d="M205 46 Q210 100 212 150" stroke="url(#jf)" stroke-width="26" fill="none"/>
      <path d="M200 48 Q205 100 206 150 M212 48 Q216 100 218 150" stroke="#fff" stroke-width="3" fill="none" opacity=".8" stroke-dasharray="10 6"/>
      <ellipse cx="210" cy="156" rx="46" ry="12" fill="#2fc3c0"/>
      <ellipse cx="210" cy="152" rx="28" ry="6" fill="#fff" opacity=".7"/>
      <path d="M0 132 Q60 120 130 134 L130 200 H0Z" fill="#4caf3a"/>
      <path d="M10 150 Q60 130 120 150" stroke="#58c234" stroke-width="18" fill="none" stroke-linecap="round"/>
      <path d="M10 150 Q60 130 120 150" stroke="#46a529" stroke-width="10" stroke-dasharray="7 7" fill="none" stroke-linecap="round"/>
      ${flag(116, 148, 0.9)}
      ${palm(40, 168, 0.95, 1)}${palm(292, 150, 0.9, -1)}${tiki(150, 176, 0.9)}
      <g fill="#2f8a3a"><path d="M0 200 Q20 170 40 200Z"/><path d="M250 200 Q275 168 300 200Z"/><path d="M170 200 Q185 178 200 200Z"/></g>
    </svg>`;
  return `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="vs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f8f"/><stop offset=".55" stop-color="#ff8a5a"/><stop offset="1" stop-color="#ffc07a"/></linearGradient>
        <radialGradient id="vg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#ff5a1a" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="320" height="200" fill="url(#vs)"/>
      <g fill="#5a4a6a" opacity=".55"><ellipse cx="170" cy="30" rx="36" ry="16"/><ellipse cx="196" cy="18" rx="30" ry="14"/><ellipse cx="150" cy="44" rx="22" ry="10"/></g>
      <circle cx="172" cy="62" r="40" fill="url(#vg)"/>
      <path d="M60 160 L150 66 Q172 56 194 66 L290 160Z" fill="#3a2f33"/>
      <path d="M150 66 Q172 56 194 66 L186 74 Q172 66 158 74Z" fill="#ff7a1a"/>
      <path d="M166 70 Q160 100 140 128 Q132 140 120 160" stroke="#ff6a14" stroke-width="5" fill="none"/>
      <path d="M180 72 Q190 104 210 130 Q220 145 236 160" stroke="#ff8a24" stroke-width="4" fill="none"/>
      <path d="M0 160 H320 V200 H0Z" fill="#2a3f6a"/>
      <path d="M40 170 Q100 150 160 168 Q220 184 280 166" stroke="#4caf27" stroke-width="18" fill="none" stroke-linecap="round"/>
      <path d="M40 170 Q100 150 160 168 Q220 184 280 166" stroke="#5cbf33" stroke-width="10" stroke-dasharray="7 7" fill="none" stroke-linecap="round"/>
      <path d="M120 186 Q160 176 200 188" stroke="#ff7a1a" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${flag(272, 166, 0.9)}
      <g transform="translate(60 172)"><path d="M0 0 V-26" stroke="#b88a3e" stroke-width="3"/><ellipse cx="0" cy="-30" rx="4" ry="7" fill="#ffb02e"/></g>
      <g transform="translate(110 160)"><path d="M0 0 V-26" stroke="#b88a3e" stroke-width="3"/><ellipse cx="0" cy="-30" rx="4" ry="7" fill="#ffb02e"/></g>
      ${tiki(24, 196, 1)}
    </svg>`;
}
