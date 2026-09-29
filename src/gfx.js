'use strict';
/* ==========================================================================
   gfx.js  -  integer pixel-art toolkit (no antialiasing anywhere)
   ========================================================================== */
class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c >> 16 & 255; this.d[i + 1] = c >> 8 & 255; this.d[i + 2] = c & 255; this.d[i + 3] = a === undefined ? 255 : a;
  }
  a(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[(y * this.w + x) * 4 + 3]; }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    const i = (y * this.w + x) * 4; return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2];
  }
  rect(x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); return this; }
  frame(x, y, w, h, c) { this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c); this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c); return this; }
  line(x0, y0, x1, y1, c, t) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    t = t || 1;
    for (;;) {
      if (t <= 1) this.set(x0, y0, c);
      else { const o = t >> 1; for (let j = 0; j < t; j++) for (let i = 0; i < t; i++) this.set(x0 - o + i, y0 - o + j, c); }
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  disc(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(Math.round(cx + x), Math.round(cy + y), c);
    return this;
  }
  ring(cx, cy, r, c) {
    for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
      const d = x * x + y * y; if (d <= r * r + r * 0.6 && d > (r - 1) * (r - 1) + (r - 1) * 0.6) this.set(Math.round(cx + x), Math.round(cy + y), c);
    }
    return this;
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + .3) + (y * y) / (ry * ry + .3) <= 1) this.set(Math.round(cx + x), Math.round(cy + y), c);
    return this;
  }
  poly(pts, c) {
    let minY = 1e9, maxY = -1e9;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    minY = Math.floor(minY); maxY = Math.ceil(maxY);
    for (let y = minY; y <= maxY; y++) {
      const xs = []; const yy = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + (yy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, c);
    }
    return this;
  }
  outline(c, diag) {
    const w = this.w, h = this.h, out = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (this.a(x, y) > 0) continue;
      if (this.a(x - 1, y) > 0 || this.a(x + 1, y) > 0 || this.a(x, y - 1) > 0 || this.a(x, y + 1) > 0 ||
        (diag && (this.a(x - 1, y - 1) > 0 || this.a(x + 1, y - 1) > 0 || this.a(x - 1, y + 1) > 0 || this.a(x + 1, y + 1) > 0))) out.push([x, y]);
    }
    for (const p of out) this.set(p[0], p[1], c === undefined ? 0x000000 : c);
    return this;
  }
  /* RS-style item shading: light from top-left */
  bevel(hi, lo) {
    const w = this.w, h = this.h, src = new Uint8ClampedArray(this.d), A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : src[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (A(x, y) === 0) continue;
      const i = (y * w + x) * 4;
      let f = 0;
      if (A(x, y - 1) === 0 || A(x - 1, y) === 0) f = hi; else if (A(x, y + 1) === 0 || A(x + 1, y) === 0) f = lo;
      if (f) {
        const r = src[i], g = src[i + 1], b = src[i + 2];
        this.d[i] = clamp(r * f, 0, 255); this.d[i + 1] = clamp(g * f, 0, 255); this.d[i + 2] = clamp(b * f, 0, 255);
      }
    }
    return this;
  }
  blit(o, x, y) {
    for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) {
      const s = (j * o.w + i) * 4; if (o.d[s + 3] === 0) continue;
      const dx = x + i, dy = y + j; if (dx < 0 || dy < 0 || dx >= this.w || dy >= this.h) continue;
      const t = (dy * this.w + dx) * 4; this.d[t] = o.d[s]; this.d[t + 1] = o.d[s + 1]; this.d[t + 2] = o.d[s + 2]; this.d[t + 3] = o.d[s + 3];
    }
    return this;
  }
  canvas() {
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    const ctx = c.getContext('2d'); const id = ctx.createImageData(this.w, this.h); id.data.set(this.d); ctx.putImageData(id, 0, 0);
    return c;
  }
}
function newSprite(w, h, fn) { const p = new Pix(w, h); fn(p); return p.canvas(); }

/* noise-textured fill */
function noiseFill(p, x, y, w, h, base, amp, seed) {
  const r = mulberry32(seed || 1);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const n = (r() - 0.5) * 2 * amp;
    const rr = clamp((base >> 16 & 255) + n, 0, 255), gg = clamp((base >> 8 & 255) + n, 0, 255), bb = clamp((base & 255) + n, 0, 255);
    p.set(x + i, y + j, rgb(rr | 0, gg | 0, bb | 0));
  }
}
