// Wireframe of the Erkel Ferenc Általános Iskola: the corner of the building, with the bell-roofed
// tower in the middle and the two wings, drawn as thin lines. Traced by hand from a photo (the photo
// itself is not part of the project); the numbers are that photo's pixels, so the drawing can be
// laid over the photo 1:1.
//
// The wings recede in perspective: lines along the left wing meet at (-578, 402), those along the
// right wing at (1300, 402). `wing()` turns "a line at this height" into the slanted line the camera
// sees, so every window row and wall line only needs one number per height.
//
// The output is plain SVG in groups (wf-frame, wf-roofs, wf-tower, wf-fine, wf-wins, wf-flag). Look
// and draw-in animation belong to the page's CSS. There are no style attributes on purpose: the
// classroom's Content-Security-Policy forbids them. The two frontends share no code, so this file
// exists twice, identical: demo/web/js and classroom/web/js. Change both.

const HORIZON = 402;
const num = v => Math.round(v * 10) / 10;

/** A wall receding to the vanishing point `vx`; `xFull` is where it is at full scale. `y(x, ref)` is
 *  the picture height, at photo-x `x`, of a line that is at height `ref` where the wall has full scale. */
const wing = (vx, xFull) => {
  const s = x => (x - vx) / (xFull - vx);
  return { s, y: (x, ref) => HORIZON + (ref - HORIZON) * s(x) };
};
const LEFT = wing(-578, 441);
const RIGHT = wing(1300, 548);
const FRONT = { s: () => 1, y: (x, ref) => ref };   // tower, blocks and pavilion face the viewer

const pt = (x, y) => `${num(x)} ${num(y)}`;
const line = (...pts) => 'M' + pts.map(([x, y]) => pt(x, y)).join('L');
const ring = (...pts) => line(...pts) + 'Z';
const along = (w, ref, a, b) => line([a, w.y(a, ref)], [b, w.y(b, ref)]);
const circle = (cx, cy, rx, ry = rx) => `M${pt(cx - rx, cy)}a${num(rx)} ${num(ry)} 0 1 0 ${num(2 * rx)} 0a${num(rx)} ${num(ry)} 0 1 0 ${num(-2 * rx)} 0Z`;
const path = (d, cls = '') => `<path${cls ? ` class="${cls}"` : ''} pathLength="1" d="${d}"/>`;
const group = (cls, ...parts) => `<g class="${cls}">${parts.flat().join('')}</g>`;

/** The x of a polyline that runs downwards (y increasing) at height `y`. */
function xAt(points, y) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (y <= y1) return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
  }
  return points.at(-1)[0];
}

/** A window of width `wd` centred on photo-x `xc` of wall `w`, between the heights `top` and `bottom`;
 *  `arched` gives it a round top (and `top` is then the crown). A cross of muntins divides the glass. */
function win(w, xc, wd, top, bottom, arched = false) {
  const hw = wd / 2 * w.s(xc);
  const x1 = xc - hw, x2 = xc + hw;
  const y = (x, ref) => w.y(x, ref);
  const sides = arched ? top + wd / 2 : top;
  const glass = arched
    ? `M${pt(x1, y(x1, bottom))}L${pt(x1, y(x1, sides))}Q${pt(x1, y(x1, top))} ${pt(xc, y(xc, top))}Q${pt(x2, y(x2, top))} ${pt(x2, y(x2, sides))}L${pt(x2, y(x2, bottom))}Z`
    : ring([x1, y(x1, top)], [x2, y(x2, top)], [x2, y(x2, bottom)], [x1, y(x1, bottom)]);
  const bar = top + (bottom - top) * .32;
  const muntins = line([xc, y(xc, top)], [xc, y(xc, bottom)]) + line([x1, y(x1, bar)], [x2, y(x2, bar)]);
  return `<g class="wf-win">${path(glass, 'wf-glass')}${path(muntins)}</g>`;
}
const slit = (x1, x2, top, bottom) => `<g class="wf-win">${path(ring([x1, top], [x2, top], [x2, bottom], [x1, bottom]), 'wf-glass')}</g>`;
const roundWin = (cx, cy, r) => `<g class="wf-win">${path(circle(cx, cy, r * 1.45))}${path(circle(cx, cy, r), 'wf-glass')}</g>`;

// ---- the bell roof of the tower, left and right silhouette
const BELL_L = [[489.6, 88], [478, 95.7], [465, 106], [459.5, 114], [455.5, 124], [451, 134], [445, 141.5]];
const BELL_R = [[489.6, 88], [501.4, 95.7], [516, 106], [524.7, 114], [531, 124], [537.5, 135], [543, 141.5]];
const bellCourse = y => {
  const l = xAt(BELL_L, y), r = xAt(BELL_R, y);
  return `M${pt(l, y)}Q${pt((l + r) / 2, y + 4)} ${pt(r, y)}`;
};

// ---- window columns (photo-x of the window's centre, width in the wall's own scale)
const LEFT_COLS = [133.8, 149.6, 166.9, 184.4, 203.7, 223, 243.4, 265.5, 294.3, 329.5, 366];
const RIGHT_COLS = [[613, 9], [641.8, 9], [668.2, 8.5], [691.6, 7], [708.2, 7], [724, 7], [739.1, 7]];
const END_COLS = [[791.4, 283.5, 308.6, 333.4, 361, 383.3, 401], [802.4, 284.5, 310, 334.6, 361.6, 384.5, 402], [812.8, 286, 311.4, 336, 362, 385.7, 403]];

function frame() {
  return group('wf-frame',
    // the foot of the building, and the plinth (two courses) along the whole front
    path(line([92, LEFT.y(92, 416.5)], [441, 416.5], [548, 416.5], [824, RIGHT.y(824, 416.5)])),
    path(along(LEFT, 355.5, 92, 384) + along(LEFT, 369, 92, 384) + line([392, 355.5], [441.5, 355.5]) + line([392, 369], [441.5, 369])
      + line([548, 353], [600, 353]) + line([548, 370], [600, 370]) + along(RIGHT, 353, 600, 749) + along(RIGHT, 370, 600, 749)
      + line([780, 361], [824, 362.5])),
    // eaves and cornices
    path(along(LEFT, 197, 97, 381) + line([381, 209.1], [441.5, 209.1]) + along(LEFT, 205, 92, 384) + line([384, 216], [441.5, 216]) + line([384, 221], [441.5, 221])),
    path(line([548, 206.5], [600, 206.5]) + line([548, 214], [600, 214]) + line([548, 219], [600, 219])
      + along(RIGHT, 191.4, 600, 749) + along(RIGHT, 199.4, 600, 749)
      + line([780, 251], [827, 270]) + line([780, 258], [824, 275.5])),
    // walls: ends of the left wing, the corners of the blocks, the tower, the pavilion and the end wall
    path(line([92, LEFT.y(92, 205)], [92, LEFT.y(92, 416.5)]) + line([126, LEFT.y(126, 205)], [126, LEFT.y(126, 416.5)])
      + line([384, 216], [384, 416]) + line([392, 221], [392, 416])
      + line([587.5, 219], [587.5, 416]) + line([600, 219], [600, 416])
      + line([441.5, 148], [441.5, 416.5]) + line([547.7, 148], [547.7, 416.5])
      + line([749.5, 233], [749.5, 412]) + line([780, 233], [780, 411]) + line([824, 270], [824, RIGHT.y(824, 416.5)])));
}

function roofs() {
  const ridgeL = LEFT.y(124, 158.2), ridgeR = LEFT.y(424, 158.2);
  const course = (t) => {   // a tile course on the left wing roof, t = 0 at the ridge, 1 at the eave
    const a = 124 - 27 * t, b = 424 - 41 * t, ref = 158.2 + t * (197 - 158.2);
    return along(LEFT, ref, a, b);
  };
  const courseR = (t) => along(RIGHT, 164 + t * 27.4, 548 + 52 * t, 749);
  return group('wf-roofs',
    // spire and bell roof
    path(line([489.6, 59], [489.6, 88])),
    path(ring([487.3, 73], [489.6, 66.5], [491.9, 73], [489.6, 79.5])),
    path(line(...[...BELL_L].reverse(), ...BELL_R.slice(1))),
    path(ring([435.5, 143.5], [546, 143.5], [548, 148], [437, 148])),
    // left wing: ridge, hips, chimney
    path(along(LEFT, 158.2, 124, 424) + line([124, ridgeL], [97, LEFT.y(97, 197)]) + line([424, ridgeR], [383, 209.1])),
    path(line([162, 232], [162, 214], [179, 214], [179, 227])),
    // right wing: ridge, hip, the end against the pavilion, vent pipes
    path(along(RIGHT, 164, 548, 749) + line([548, 164], [600, 206.5]) + line([749, RIGHT.y(749, 164)], [749, RIGHT.y(749, 191.4)])),
    path(line([634, 192], [634, 176]) + line([641, 193], [641, 172]) + line([647.5, 194], [647.5, 175])),
    // the end wing behind the pavilion
    path(line([780, 246], [827, 267], [827, 270]) + line([780, 246], [780, 251])),
    // the gable of the pavilion
    path(`M749.5 233C749.5 226 757 224 760 220Q764 213.5 768 220C771 224 780 226 780 233H749.5`),
    group('wf-fine',
      path([0.33, 0.66].map(course).join('') + [0.33, 0.66].map(courseR).join('')),
      path([104, 116, 128, 138].map(bellCourse).join(''))));
}

function tower() {
  const slots = Array.from({ length: 9 }, (_, i) => {
    const x = 450.5 + i * 10.7;
    return ring([x, 161], [x + 3.4, 161], [x + 3.4, 175.5], [x, 175.5]);
  }).join('');
  const rustication = [];
  for (let y = 195; y < 412; y += 11.5) rustication.push(line([441.5, y], [459, y]) + line([531, y], [547.7, y]));
  return group('wf-tower',
    // frieze with its slots, the band below it
    path(line([441.5, 157], [547.7, 157]) + line([441.5, 177.5], [547.7, 177.5]) + line([441.5, 183], [547.7, 183]) + slots),
    // pilasters and the stepped panel in the middle
    path(line([459, 183], [459, 416.5]) + line([531, 183], [531, 416.5])),
    path(ring([464.5, 264], [464.5, 196], [470.5, 196], [470.5, 188], [520.5, 188], [520.5, 196], [526.5, 196], [526.5, 264], [511, 264], [511, 249], [481, 249], [481, 264])),
    // balcony with the crest below it
    path(ring([476, 322], [519, 322], [519, 326.5], [476, 326.5])),
    path(ring([491.5, 327], [504.5, 327], [504.5, 340], [491.5, 340])),
    // the arched doorway and its doors, the plinth
    path(line([477, 414.3], [477, 366.5], [481, 353.7], [497, 341], [513, 353.7], [519.4, 366.5], [519.4, 414.3])),
    path(`M479.5 414V373Q498 365 516.5 373V414Z` + line([498, 369], [498, 414]) + line([479.5, 392], [516.5, 392])),
    path(line([441.5, 405], [477, 405]) + line([519.4, 405], [547.7, 405]) + line([441.5, 369.7], [477, 369.7]) + line([519.4, 369.7], [547.7, 369.7])),
    group('wf-fine', path(rustication.join(''))));
}

function windows() {
  const left = LEFT_COLS.flatMap(x => {
    const wd = x < 280 ? 8.6 : 11.5;
    return [win(LEFT, x, wd, 228, 269.5, true), win(LEFT, x, wd, 309, 352), win(LEFT, x, wd, 386, 414)];
  });
  const right = RIGHT_COLS.flatMap(([x, wd]) => [win(RIGHT, x, wd, 223.9, 266.3, true), win(RIGHT, x, wd, 305.6, 349.5), win(RIGHT, x, wd, 384, 410)]);
  const end = END_COLS.flatMap(([x, t1, b1, t2, b2, t3, b3]) => [win(FRONT, x, 4.8, t1, b1), win(FRONT, x, 4.8, t2, b2), win(FRONT, x, 4.8, t3, b3)]);
  return group('wf-wins',
    left, right, end,
    // the two blocks beside the tower: a tall arched window in a round-headed frame, a round window
    win(FRONT, 417, 14.5, 235.5, 276, true), roundWin(417, 330, 5.4),
    win(FRONT, 567.8, 15.7, 235.7, 275, true), roundWin(569, 329, 5.5),
    // the tower: arched window in the middle, the four slits of the loggia
    `<g class="wf-win">${path(circle(495, 216.5, 9.5, 11.5), 'wf-glass')}${path(line([495, 205], [495, 228]) + line([485.5, 213], [504.5, 213]))}</g>`,
    slit(477, 483, 272.5, 321), slit(488, 493, 258, 321), slit(498.5, 504, 258, 321), slit(511, 517, 272.5, 321),
    // the pavilion at the end of the right wing
    win(FRONT, 766, 10, 271, 303), `<g class="wf-win">${path(circle(764.4, 244, 2.8, 4.5), 'wf-glass')}</g>`,
    `<g class="wf-win">${path(`M766.6 405V380Q766.6 372 771.3 372Q776 372 776 380V405Z`, 'wf-glass')}</g>`,
    // frames around the arched windows of the blocks
    path(`M405 278V240Q405 230 417 230Q429 230 429 240V278`),
    path(`M555 278V240Q555 230 567.8 230Q580.5 230 580.5 240V278`));
}

/** The flag over the balcony: three waving bands. */
function flag() {
  const top = [[488, 298], [504, 295.5], [520, 300]], bottom = [[488, 307.5], [504, 305], [520, 309.5]];
  const at = (i, k) => top[i].map((v, a) => v + (bottom[i][a] - v) * k);
  const band = (k, cls) => path(ring(at(0, k / 3), at(1, k / 3), at(2, k / 3), at(2, (k + 1) / 3), at(1, (k + 1) / 3), at(0, (k + 1) / 3)), cls);
  return group('wf-flag', band(0, 'wf-red'), band(1, 'wf-white'), band(2, 'wf-green'));
}

/** The whole picture; scales with its container. */
export function schoolWireframeSvg() {
  return `<svg class="wf" viewBox="80 46 760 380" role="img" aria-label="Az Erkel Ferenc Általános Iskola épülete, vonalrajzban">`
    + frame() + roofs() + tower() + windows() + flag() + `</svg>`;
}
