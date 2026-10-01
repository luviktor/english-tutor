// Visual effects: confetti, floating "+10" texts, toasts.

import { el } from './util.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#ff5fa2', '#ffd23f', '#2db7ff', '#2ed573', '#8a5cf6', '#ff8a3d'];

export function confetti({ count = 140, x = 0.5, y = 0.35, power = 1 } = {}) {
  if (reduced()) count = Math.round(count / 4);
  const canvas = el('canvas', { class: 'confetti' });
  const dpr = window.devicePixelRatio || 1;
  const w = innerWidth, h = innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({
    x: x * w, y: y * h,
    vx: (Math.random() - 0.5) * 16 * power,
    vy: (-Math.random() * 14 - 4) * power,
    size: 6 + Math.random() * 8,
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    round: Math.random() < 0.4,
  }));
  let frame = 0;
  setTimeout(() => canvas.remove(), 6000); // safety net, e.g. when the tab is in the background
  (function tick() {
    ctx.clearRect(0, 0, w, h);
    let alive = false;
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y < h + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size / 1.6);
      ctx.restore();
    }
    if (alive && ++frame < 220) requestAnimationFrame(tick);
    else canvas.remove();
  })();
}

/** A text that floats up from an element, e.g. "+10 ⭐". */
export function floatText(anchor, text, cls = '') {
  const r = anchor?.getBoundingClientRect?.();
  const x = r ? r.left + r.width / 2 : innerWidth / 2;
  const y = r ? r.top + r.height / 3 : innerHeight / 2;
  const node = el('div', { class: `float-text ${cls}`, style: { left: x + 'px', top: y + 'px' } }, text);
  document.body.append(node);
  node.addEventListener('animationend', () => node.remove());
  setTimeout(() => node.remove(), 2500);
}

export function toast(emoji, text, { ms = 3600 } = {}) {
  const node = el('div', { class: 'toast' }, el('span', { class: 'toast-emoji' }, emoji), el('span', {}, text));
  document.getElementById('toasts').append(node);
  setTimeout(() => node.classList.add('out'), ms);
  setTimeout(() => node.remove(), ms + 500);
}
