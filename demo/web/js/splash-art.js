// Artwork for the splash screen: a cheerful drawing of a school building (not a photo of the
// real Erkel building). Animations live in style.css under "splash" (classes art-*).

const RAINBOW = ['#ff5a5f', '#ff8a3d', '#ffd23f', '#2ed573', '#2db7ff', '#8a5cf6'];

/** Big rainbow arch behind the title; every band draws itself in. */
export function rainbowSvg() {
  const bands = RAINBOW.map((color, i) => {
    const r = 380 - i * 24;
    return `<path class="sp-band intro" style="--i:${i}" pathLength="1" stroke="${color}" d="M${400 - r} 400A${r} ${r} 0 0 1 ${400 + r} 400"/>`;
  }).join('');
  return `<svg class="sp-rainbow" viewBox="0 0 800 400" aria-hidden="true" fill="none" stroke-width="24">${bands}</svg>`;
}

const windowAt = (x, y, i) => `
  <g class="art-win" style="--i:${i}">
    <rect class="glass intro" x="${x}" y="${y}" width="24" height="26" rx="5"/>
    <path d="M${x + 12} ${y}v26M${x} ${y + 13}h24" stroke="#fff" stroke-width="2.5"/>
    <rect x="${x}" y="${y}" width="24" height="26" rx="5" fill="none" stroke="#fff" stroke-width="3"/>
  </g>`;

const kid = (x, y, shirt, delay) => `
  <g transform="translate(${x} ${y}) scale(1.15)">
    <g class="art-hop" style="--d:${delay}s">
      <rect x="-5" y="2" width="4" height="9" rx="2" fill="#3b3470"/>
      <rect x="1" y="2" width="4" height="9" rx="2" fill="#3b3470"/>
      <rect x="-10" y="-8" width="6" height="11" rx="3" fill="#ffd23f"/>
      <rect x="-7" y="-9" width="14" height="14" rx="6" fill="${shirt}"/>
      <circle cy="-16" r="7" fill="#ffcfa3"/>
      <path d="M-7.2-17a7.2 7.2 0 0 1 14.4 0z" fill="#6b4226"/>
      <circle cx="-2.4" cy="-14.5" r="1" fill="#2b2350"/><circle cx="2.4" cy="-14.5" r="1" fill="#2b2350"/>
    </g>
  </g>`;

const tree = (x, y, scale = 1) => `
  <g transform="translate(${x} ${y}) scale(${scale})">
    <g class="art-sway">
      <rect x="-4" y="-34" width="8" height="34" rx="3" fill="#a9703f"/>
      <circle cx="0" cy="-52" r="22" fill="#34b457"/>
      <circle cx="-14" cy="-40" r="14" fill="#3cc462"/>
      <circle cx="14" cy="-42" r="15" fill="#2fa84f"/>
    </g>
  </g>`;

// Window positions: three per wing and two rows, plus the ones in the middle block.
const WINDOW_SPOTS = [
  [44, 140], [80, 140], [116, 140], [44, 180], [80, 180], [116, 180],
  [280, 140], [316, 140], [352, 140], [280, 180], [316, 180], [352, 180],
  [164, 130], [197, 130], [230, 130], [162, 172], [234, 172],
];

/** The picture of the school: sky, sun, clouds, the building with a clock, flag and glowing
 *  windows, trees, flowers and two children walking in. */
export function schoolSvg() {
  // light the windows in a scattered order rather than row by row
  const windows = WINDOW_SPOTS.map(([x, y], n) => windowAt(x, y, (n * 7) % WINDOW_SPOTS.length)).join('');
  const rays = Array.from({ length: 12 }, (_, i) =>
    `<rect x="-3" y="-46" width="6" height="14" rx="3" fill="#ffd23f" transform="rotate(${i * 30})"/>`).join('');

  return `
<svg class="sp-art" viewBox="0 0 420 280" role="img" aria-label="Az iskola épülete napsütésben">
  <defs>
    <linearGradient id="spSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7fd8ff"/><stop offset="1" stop-color="#dcf4ff"/>
    </linearGradient>
  </defs>
  <rect width="420" height="280" fill="url(#spSky)"/>

  <g transform="translate(352 54)">
    <g class="art-rays">${rays}</g>
    <circle r="27" fill="#ffd23f"/>
    <circle cx="-9" cy="-4" r="3" fill="#2b2350"/><circle cx="9" cy="-4" r="3" fill="#2b2350"/>
    <path d="M-10 6q10 10 20 0" stroke="#2b2350" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="-16" cy="5" r="4.5" fill="#ff9fb8" opacity=".75"/><circle cx="16" cy="5" r="4.5" fill="#ff9fb8" opacity=".75"/>
  </g>

  <g class="art-cloud" style="--d:0s"><g fill="#fff">
    <ellipse cx="78" cy="46" rx="36" ry="14"/><circle cx="62" cy="37" r="14"/><circle cx="90" cy="33" r="17"/></g></g>
  <g class="art-cloud" style="--d:-3s"><g fill="#fff" opacity=".9">
    <ellipse cx="262" cy="26" rx="28" ry="11"/><circle cx="252" cy="19" r="11"/><circle cx="273" cy="17" r="13"/></g></g>

  <ellipse cx="80" cy="276" rx="220" ry="72" fill="#8fe39a"/>
  <ellipse cx="360" cy="280" rx="200" ry="64" fill="#72d487"/>
  <rect y="222" width="420" height="58" fill="#58c776"/>
  <path d="M186 222h48l40 58H146z" fill="#ffeac4"/>

  <g class="art-school intro">
    <path d="M30 128l16-20h104l16 20z" fill="#e8604c"/>
    <path d="M254 128l16-20h104l16 20z" fill="#e8604c"/>
    <rect x="36" y="128" width="120" height="94" fill="#ffd8a6"/>
    <rect x="264" y="128" width="120" height="94" fill="#ffd8a6"/>
    <rect x="36" y="214" width="348" height="8" fill="#e6b783"/>

    <rect x="150" y="86" width="120" height="136" fill="#ffe6bd"/>
    <path d="M136 88L210 40l74 48z" fill="#e8604c"/>
    <path d="M150 88h120v6H150z" fill="#d9503d"/>

    <g transform="translate(210 67)">
      <circle r="13" fill="#fff" stroke="#6a3fd6" stroke-width="3"/>
      <line class="art-hand slow" y2="-6" stroke="#2b2350" stroke-width="2.4" stroke-linecap="round"/>
      <line class="art-hand" y2="-9" stroke="#2b2350" stroke-width="1.8" stroke-linecap="round"/>
      <circle r="1.6" fill="#2b2350"/>
    </g>

    <line x1="210" y1="40" x2="210" y2="6" stroke="#6b5a8e" stroke-width="2.5" stroke-linecap="round"/>
    <g transform="translate(211 8)">
      <g class="art-flag">
        <rect width="30" height="6" fill="#ce2939"/><rect y="6" width="30" height="6" fill="#fff"/><rect y="12" width="30" height="6" fill="#477050"/>
      </g>
    </g>

    <rect x="172" y="98" width="76" height="22" rx="8" fill="#6a3fd6"/>
    <text x="210" y="114" text-anchor="middle" font-size="15" font-weight="700" letter-spacing="1.5" fill="#fff">ERKEL</text>

    ${windows}

    <path d="M192 222v-34a18 18 0 0 1 36 0v34z" fill="#8a5cf6"/>
    <path d="M210 170v52" stroke="#6a3fd6" stroke-width="2.5"/>
    <circle cx="203" cy="200" r="2" fill="#ffd23f"/><circle cx="217" cy="200" r="2" fill="#ffd23f"/>
    <rect x="184" y="222" width="52" height="5" rx="2" fill="#d9c3a0"/>
  </g>

  <g fill="#3cb35e">
    <circle cx="30" cy="224" r="12"/><circle cx="48" cy="228" r="9"/><circle cx="390" cy="224" r="12"/><circle cx="372" cy="228" r="9"/>
  </g>
  <g>
    <circle cx="28" cy="221" r="2.6" fill="#ff5fa2"/><circle cx="48" cy="226" r="2.4" fill="#ffd23f"/>
    <circle cx="392" cy="221" r="2.6" fill="#ffd23f"/><circle cx="371" cy="226" r="2.4" fill="#ff5fa2"/>
    <circle cx="120" cy="250" r="2.6" fill="#ffd23f"/><circle cx="300" cy="256" r="2.6" fill="#ff5fa2"/><circle cx="330" cy="244" r="2.4" fill="#fff"/>
  </g>
  ${tree(10, 226, 1)}${tree(412, 228, 1.05)}
  ${kid(200, 262, '#ff5fa2', 0)}${kid(228, 252, '#2db7ff', -.4)}
</svg>`;
}
