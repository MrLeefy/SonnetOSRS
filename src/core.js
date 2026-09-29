'use strict';
/* ==========================================================================
   core.js  -  constants, math helpers, bitmap fonts
   ========================================================================== */
const W = 765, H = 503;              // fixed-mode client size
const VX = 4, VY = 4, VW = 512, VH = 334; // 3D viewport rectangle
const TICK_MS = 600;
const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rint(n) { return Math.floor(Math.random() * n); }
function rrange(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[rint(arr.length)]; }
function chance(p) { return Math.random() < p; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function dist2(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

const _hexCache = {};
function css(c) {
  if (typeof c === 'string') return c;
  return _hexCache[c] || (_hexCache[c] = '#' + (c | 0x1000000).toString(16).slice(1));
}
function rgb(r, g, b) { return (r << 16) | (g << 8) | b; }
function mixCol(a, b, t) {
  const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
  return rgb(Math.round(ar + (br - ar) * t), Math.round(ag + (bg - ag) * t), Math.round(ab + (bb - ab) * t));
}
function shadeCol(c, f) {
  return rgb(clamp(Math.round((c >> 16 & 255) * f), 0, 255), clamp(Math.round((c >> 8 & 255) * f), 0, 255), clamp(Math.round((c & 255) * f), 0, 255));
}
function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ---------------- bitmap fonts ---------------- */
const Fonts = {};
function initFonts() {
  return Promise.all(Object.keys(FONT_DATA).map(name => new Promise(res => {
    const d = FONT_DATA[name]; const img = new Image();
    img.onload = () => { Fonts[name] = Object.assign({ img, tint: {} }, d); res(); };
    img.src = d.png;
  })));
}
function tintedAtlas(f, color) {
  const k = css(color); let t = f.tint[k];
  if (!t) {
    t = document.createElement('canvas'); t.width = f.img.width; t.height = f.img.height;
    const c = t.getContext('2d'); c.drawImage(f.img, 0, 0);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = k; c.fillRect(0, 0, t.width, t.height);
    f.tint[k] = t;
  }
  return t;
}
function stripTags(s) { return s.replace(/<\/?col[^>]*>/g, ''); }
function textWidth(fn, str) {
  const f = Fonts[fn]; let w = 0; const plain = stripTags(String(str));
  for (let i = 0; i < plain.length; i++) {
    const k = plain.charCodeAt(i) - 32;
    w += (k >= 0 && k < 95) ? f.adv[k] : 4;
  }
  return w;
}
function parseSegs(str, defCol) {
  const segs = []; let col = defCol; const re = /<col=([0-9a-fA-F]{6})>|<\/col>/g; let last = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > last) segs.push({ t: str.slice(last, m.index), c: col });
    col = m[1] ? parseInt(m[1], 16) : defCol; last = re.lastIndex;
  }
  if (last < str.length) segs.push({ t: str.slice(last), c: col });
  return segs;
}
function blitStr(ctx, f, str, x, y, col) {
  const atlas = tintedAtlas(f, col);
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i) - 32;
    if (k < 0 || k >= 95) { x += 4; continue; }
    if (k > 0) ctx.drawImage(atlas, (k % f.cols) * f.cw, (k / f.cols | 0) * f.ch, f.cw, f.ch, x - 3, y - f.base, f.cw, f.ch);
    x += f.adv[k];
  }
  return x;
}
/* y is the text baseline. col is 0xRRGGBB. Supports <col=rrggbb> ... </col> */
function drawText(ctx, fn, str, x, y, col, shadow) {
  const f = Fonts[fn]; str = String(str);
  x = Math.round(x); y = Math.round(y);
  const segs = parseSegs(str, col);
  if (shadow !== false) {
    let sx = x + 1; for (const s of segs) sx = blitStr(ctx, f, s.t, sx, y + 1, 0x000000);
  }
  let cx = x; for (const s of segs) cx = blitStr(ctx, f, s.t, cx, y, s.c);
  return cx;
}
function drawTextC(ctx, fn, str, cx, y, col, shadow) { return drawText(ctx, fn, str, cx - (textWidth(fn, str) >> 1), y, col, shadow); }
function drawTextR(ctx, fn, str, rx, y, col, shadow) { return drawText(ctx, fn, str, rx - textWidth(fn, str), y, col, shadow); }
