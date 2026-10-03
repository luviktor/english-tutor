// Artwork for the splash screen: the rainbow behind the title. The picture of the school is a
// wireframe drawing of the real building, see school-wireframe.js. Animations live in style.css
// under "splash".

const RAINBOW = ['#ff5a5f', '#ff8a3d', '#ffd23f', '#2ed573', '#2db7ff', '#8a5cf6'];

/** Big rainbow arch behind the title; every band draws itself in. */
export function rainbowSvg() {
  const bands = RAINBOW.map((color, i) => {
    const r = 380 - i * 24;
    return `<path class="sp-band intro" style="--i:${i}" pathLength="1" stroke="${color}" d="M${400 - r} 400A${r} ${r} 0 0 1 ${400 + r} 400"/>`;
  }).join('');
  return `<svg class="sp-rainbow" viewBox="0 0 800 400" aria-hidden="true" fill="none" stroke-width="24">${bands}</svg>`;
}
