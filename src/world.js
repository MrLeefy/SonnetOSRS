'use strict';
/* ==========================================================================
   world.js  -  procedural Grand Exchange (Varrock) map, collision, textures
   Tile coords (x east, y north). 3D: X = x, Z = -y, Y = height.
   ========================================================================== */
const MAPN = 96, GEC = 48;
const WORLD = {
  N: MAPN,
  block: new Uint8Array(MAPN * MAPN),   // 1 = blocked
  layer: new Int8Array(MAPN * MAPN).fill(-1),
  th: new Float32Array(MAPN * MAPN),    // tile-centre height
  mm: new Int32Array(MAPN * MAPN),      // minimap colour
  objs: [], trees: [], statics: [], ready: false
};
const PLAT_R = 15.5;                    // platform apothem
const STEP_H = [0, -0.11, -0.22, -0.33];
const RING_A = 8.5, RING_HL = RING_A * Math.tan(Math.PI / 8), WALL_H = 3.6;
const COL = {
  dirt: 0x867b5c, grass: 0x666f33, grass2: 0x7b8a3a, grassLo: 0x566127, grassHi: 0x8f9d48,
  flag: 0x7f7f76, dark: 0x3d3b32, white: 0xdcd5bd, light: 0x8b8b82,
  wood: 0x6b4f2a, trunk: 0x5c4526, leaf: 0x4a6e24, red: 0x8a1c14, beige: 0xa8996f,
  roof: 0x8a3a24, slate: 0x4c4c52, glass: 0x9fbccb, shutter: 0x2f5a3a, gold: 0xc9a23a, iron: 0x3a3a36, frame: 0x3a2614
};
/* Varrock buildings: [x0, y0, w, d, wall height, roof colour, sign colour] */
const BUILD = [[68, 62, 9, 8, 4.2, 0x8a3a24, 0x5a3a20], [72, 46, 7, 7, 3.6, 0x6a3a2a, 0x2a4a6a], [16, 56, 7, 9, 4.0, 0x7a4a2c, 0x6a2a20], [18, 36, 8, 7, 3.6, 0x8a3a24, 0x3a5a2a]];
/* what a blocked tile is, for the minimap */
const KIND = { none: 0, wall: 1, building: 2, tower: 3, tree: 4, prop: 5, booth: 6, ring: 7, edge: 8 };
const KIND_MM = [0, 0x77776f, 0x7e4a36, 0x6a6a64, 0x2f4d17, 0x6b5a3a, 0x4c5a34, 0x6a6a62, 0x4a4a42];

function poly12(dx, dy) { let m = 0; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 6; m = Math.max(m, Math.abs(dx * Math.cos(a) + dy * Math.sin(a))); } return m; }
function poly8(dx, dy) { let m = 0; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; m = Math.max(m, Math.abs(dx * Math.cos(a) + dy * Math.sin(a))); } return m; }
function inMap(x, y) { return x >= 0 && y >= 0 && x < MAPN && y < MAPN; }
function isBlocked(x, y) { return !inMap(x, y) || WORLD.block[y * MAPN + x] === 1; }
function tileH(x, y) { x = clamp(x, 0, MAPN - 1); y = clamp(y, 0, MAPN - 1); return WORLD.th[y * MAPN + x]; }
/* bilinear ground height at float tile coords (tile centre at +0.5) */
function groundH(x, y) {
  const fx = x - 0.5, fy = y - 0.5; const ix = Math.floor(fx), iy = Math.floor(fy); const tx = fx - ix, ty = fy - iy;
  const a = tileH(ix, iy), b = tileH(ix + 1, iy), c = tileH(ix, iy + 1), d = tileH(ix + 1, iy + 1);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}
function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

/* ---------- textures (64x64, tileable; greyscale ones are tinted by vertex colour) ---------- */
function makeWorldTextures(R) {
  const mk = (name, fn) => { const p = new Pix(64, 64); fn(p); R.makeTexture(name, p.canvas(), true); };
  const nA = tileNoise(4, 11), nB = tileNoise(8, 12), nC = tileNoise(16, 13);
  const jit = (x, y, s, a) => (hash2(x, y, s) - 0.5) * 2 * a;
  mk('flag', p => { // platform: two courses of staggered flagstones
    const rows = [0, 32, 64], segs = [[0, 20, 44], [0, 30]];
    p.fill((x, y) => {
      const r = y < 32 ? 0 : 1, sg = segs[r];
      let s = 0; while (s + 1 < sg.length && x >= sg[s + 1]) s++;
      const x0 = sg[s], x1 = s + 1 < sg.length ? sg[s + 1] : 64, y0 = rows[r], y1 = rows[r + 1];
      if (x === x0 || y === y0) return 0x5a5950;
      let c = shadeCol(COL.flag, 1 + (hash2(r, s, 3) - 0.5) * 0.14 + (nA(x / 64, y / 64) - 0.5) * 0.14 + jit(x, y, 5, 0.03));
      if (x === x0 + 1 || y === y0 + 1) c = shadeCol(c, 1.12);
      else if (x === x1 - 1 || y === y1 - 1) c = shadeCol(c, 0.9);
      return c;
    });
  });
  mk('dark', p => { // GE ring: dark ashlar blocks
    p.fill((x, y) => {
      const r = y >> 3, off = (r & 1) ? 8 : 0, bx = Math.floor((x + off) / 16), ly = y & 7, lx = (x + off) & 15;
      if (ly === 0 || lx === 0) return 0x24231c;
      let c = shadeCol(COL.dark, 1 + (hash2(bx, r, 17) - 0.5) * 0.26 + (nB(x / 64, y / 64) - 0.5) * 0.2 + jit(x, y, 9, 0.04));
      if (ly === 1 || lx === 1) c = shadeCol(c, 1.22); else if (ly === 7 || lx === 15) c = shadeCol(c, 0.72);
      return c;
    });
  });
  mk('stone', p => { // Varrock city wall: weathered light blocks
    p.fill((x, y) => {
      const r = y >> 4, off = (r & 1) ? 16 : 0, bx = Math.floor((x + off) / 32), ly = y & 15, lx = (x + off) & 31;
      if (ly === 0 || lx === 0) return 0x5f5f57;
      let c = shadeCol(COL.light, 1 + (hash2(bx, r, 21) - 0.5) * 0.2 + (nC(x / 64, y / 64) - 0.5) * 0.2 + jit(x, y, 23, 0.04) - (ly > 12 ? 0.07 : 0));
      if (ly === 1) c = shadeCol(c, 1.14);
      return c;
    });
  });
  mk('wood', p => { // planks with grain
    p.fill((x, y) => {
      const pl = x >> 4, lx = x & 15;
      if (lx === 0) return 0x3a2614;
      const ph = hash2(pl, 0, 41), g = Math.sin(y * 0.55 + Math.sin(x * 1.3 + pl) * 2.2 + ph * 6);
      let c = shadeCol(COL.wood, 0.92 + ph * 0.16 + g * 0.05 + jit(x, y, 43, 0.03));
      if (lx === 1) c = shadeCol(c, 1.1);
      return c;
    });
  });
  mk('beige', p => { // lime plaster: blotches and pits
    p.fill((x, y) => {
      let c = shadeCol(COL.beige, 1 + (nB(x / 64, y / 64) - 0.5) * 0.24 + (nC(x / 64, y / 64) - 0.5) * 0.12 + jit(x, y, 51, 0.03));
      if (hash2(x, y, 53) > 0.994) c = shadeCol(c, 0.72);
      return c;
    });
  });
  mk('cobble', p => { // rounded cobbles on a 4x4 wrapping grid
    const cs = 16, G = 4;
    const site = (i, j) => { const a = ((i % G) + G) % G, b = ((j % G) + G) % G; return [(i + 0.15 + 0.7 * hash2(a, b, 61)) * cs, (j + 0.15 + 0.7 * hash2(a, b, 67)) * cs, hash2(a, b, 71)]; };
    p.fill((x, y) => {
      const ci = Math.floor(x / cs), cj = Math.floor(y / cs);
      let d1 = 1e9, d2 = 1e9, best = null;
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        const s = site(i, j), d = Math.hypot(s[0] - x - 0.5, s[1] - y - 0.5);
        if (d < d1) { d2 = d1; d1 = d; best = s; } else if (d < d2) d2 = d;
      }
      if (d2 - d1 < 1.7) return 0x4b463c; // mortar
      return shadeCol(mixCol(0x7c7568, 0x9c9584, best[2]), (0.8 + 0.3 * (1 - d1 / 9)) * (1 + jit(x, y, 73, 0.04)));
    });
  });
  mk('roof', p => { // clay pantiles, greyscale so the roof colour tints them
    p.fill((x, y) => {
      const r = y >> 3, off = (r & 1) ? 8 : 0, lx = (x + off) & 15, ly = y & 7;
      if (ly === 7) return 0xa8a8a8;
      let v = 0.95 + (hash2(Math.floor((x + off) / 16), r, 91) - 0.5) * 0.12 + (nA(x / 64, y / 64) - 0.5) * 0.08;
      if (lx === 0 || lx === 15) v -= 0.14; else if (ly === 0) v += 0.06;
      const c = Math.round(clamp(v, 0, 1) * 255); return rgb(c, c, c);
    });
  });
  mk('brick', p => { // brick courses, greyscale tint
    p.fill((x, y) => {
      const r = y >> 3, off = (r & 1) ? 8 : 0, lx = (x + off) & 15, ly = y & 7;
      if (ly === 7 || lx === 15) return 0xb8b8b8;
      const v = 0.94 + (hash2(Math.floor((x + off) / 16), r, 95) - 0.5) * 0.14 + (nC(x / 64, y / 64) - 0.5) * 0.08;
      const c = Math.round(clamp(v, 0, 1) * 255); return rgb(c, c, c);
    });
  });
  mk('grass', p => { // greyscale ground, multiplied by the vertex colour
    p.fill((x, y) => {
      const n = nA(x / 64, y / 64) * 0.6 + nC(x / 64, y / 64) * 0.4;
      let v = 0.9 + (n - 0.5) * 0.22 + (hash2(x, y, 81) - 0.5) * 0.08;
      if ((y & 3) < 2 && hash2(x, y >> 2, 83) < 0.1) v -= 0.14;       // blade strokes
      else if ((y & 3) < 2 && hash2(x, y >> 2, 85) > 0.93) v += 0.07; // lit tips
      const c = Math.round(clamp(v, 0, 1) * 255); return rgb(c, c, c);
    });
  });
}

/* ---------- world generation ---------- */
function buildWorld(R) {
  const N = MAPN, C = GEC; const rng = mulberry32(20070);
  makeWorldTextures(R);
  // value noise
  const NL = 32, lat = new Float32Array(NL * NL); for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const sm = t => t * t * (3 - 2 * t);
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi); const g = (a, b) => lat[((b & 31) * NL) + (a & 31)];
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), fx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), fx), fy);
  };
  const baseGround = (x, y) => {
    const d = poly12(x - C, y - C); let h = -0.45; const t = clamp((d - 24) / 20, 0, 1.6);
    h += t * t * 6.5 * (0.35 + vn(x * 0.11, y * 0.11)) + t * 1.3 * vn(x * 0.35 + 9, y * 0.35);
    h += (vn(x * 0.5, y * 0.5) - 0.5) * 0.05;
    // rolling mounds in the outskirts; upward only, so the ground never dips below the plaza underside
    const s = clamp((d - 22) / 6, 0, 1);
    h += s * Math.max(0, vn(x * 0.23 + 4, y * 0.23 + 7) - 0.4) * 1.6;
    return h;
  };
  // building plots are levelled (with a soft falloff) so walls and doors sit flat
  const pads = BUILD.map(b => ({ x0: b[0] - 1.2, y0: b[1] - 1.2, x1: b[0] + b[2] + 1.2, y1: b[1] + b[3] + 1.2, h: baseGround(b[0] + b[2] / 2, b[1] + b[3] / 2) }));
  const heightAt = (x, y) => {
    let h = baseGround(x, y);
    for (const p of pads) {
      const dd = Math.max(p.x0 - x, 0, x - p.x1, p.y0 - y, y - p.y1);
      if (dd < 1.6) h = lerp(p.h, h, smooth01(dd / 1.6));
    }
    return h;
  };
  const M3 = (x, y, h) => [x, h, -y];
  const KINDS = new Uint8Array(N * N);                 // what each blocked tile holds (minimap)
  const blk = (x, y, k) => { if (inMap(x, y)) { WORLD.block[y * N + x] = 1; KINDS[y * N + x] = k; } };
  const pathM = new Uint8Array(N * N);                 // cobbled paths, kept clear of props
  const taken = new Uint8Array(N * N);                 // props placed on this tile

  /* platform layers + heights */
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const d = poly12(tx + 0.5 - C, ty + 0.5 - C); let L = -1;
    if (d <= PLAT_R) L = 0; else if (d <= PLAT_R + 1) L = 1; else if (d <= PLAT_R + 2) L = 2; else if (d <= PLAT_R + 3) L = 3;
    WORLD.layer[ty * N + tx] = L;
    WORLD.th[ty * N + tx] = L >= 0 ? STEP_H[L] : heightAt(tx + 0.5, ty + 0.5);
  }

  const S = new Mesh('white'), FL = new Mesh('flag'), DK = new Mesh('dark'), ST = new Mesh('stone'), WD = new Mesh('wood'), BG = new Mesh('beige');
  const GR = new Mesh('grass'), CB = new Mesh('cobble'), RF = new Mesh('roof'), BR = new Mesh('brick');
  const meshes = [S, GR, CB, FL, DK, ST, WD, BG, RF, BR];

  /* terrain mesh (skips platform tiles) */
  const cornerH = (i, j) => heightAt(i, j);
  const cornerCol = (i, j) => {
    const d = poly12(i - C, j - C), n = vn(i * 0.3, j * 0.3), n2 = vn(i * 0.9 + 3, j * 0.9), n3 = vn(i * 0.07 + 20, j * 0.07 + 4);
    const dirt = Math.max(clamp((25.5 + 3.5 * n - d) / 3.5, 0, 1), clamp((vn(i * 0.17 + 5, j * 0.17 + 11) - 0.6) * 4, 0, 0.7));
    let g = mixCol(COL.grass, COL.grass2, clamp(n * 1.2 - 0.2 + (d > 40 ? 0.15 : 0), 0, 1));
    g = mixCol(g, COL.grassLo, clamp((0.45 - n3) * 3, 0, 1) * 0.7);
    g = mixCol(g, COL.grassHi, clamp((n3 - 0.6) * 3, 0, 1) * 0.5);
    const c = mixCol(g, COL.dirt, dirt);
    return shadeCol(c, (0.95 + 0.2 * n2) * 1.12); // 1.12: the grass texture darkens by about 10 percent
  };
  const cN = (i, j) => { // corner normal light
    const e = 0.5; const hx = heightAt(i + e, j) - heightAt(i - e, j), hy = heightAt(i, j + e) - heightAt(i, j - e);
    return lightAt(-hx, 1, hy);
  };
  const litCol = (i, j) => shadeCol(cornerCol(i, j), cN(i, j));
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    if (WORLD.layer[ty * N + tx] >= 0) continue;
    const c = [litCol(tx, ty), litCol(tx + 1, ty), litCol(tx + 1, ty + 1), litCol(tx, ty + 1)];
    GR.quad(M3(tx, ty, cornerH(tx, ty)), M3(tx + 1, ty, cornerH(tx + 1, ty)), M3(tx + 1, ty + 1, cornerH(tx + 1, ty + 1)), M3(tx, ty + 1, cornerH(tx, ty + 1)), c, false, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  // ground under the platform (avoids seeing the void through risers)
  S.quad(M3(C - 24, C - 24, -0.5), M3(C + 24, C - 24, -0.5), M3(C + 24, C + 24, -0.5), M3(C - 24, C + 24, -0.5), 0x6b6a58, false);

  /* platform tops + risers */
  const rr = mulberry32(99);
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const L = WORLD.layer[ty * N + tx]; if (L < 0) continue; const h = STEP_H[L];
    const v = 0.94 + rr() * 0.1; const cc = shadeCol(0xffffff, v);
    FL.quad(M3(tx, ty, h), M3(tx + 1, ty, h), M3(tx + 1, ty + 1, h), M3(tx, ty + 1, h), cc, true, [[0, 1], [1, 1], [1, 0], [0, 0]]);
    const nb = [[0, -1, 'S'], [1, 0, 'E'], [0, 1, 'N'], [-1, 0, 'W']];
    for (const [ox, oy] of nb) {
      const nx = tx + ox, ny = ty + oy; const nL = inMap(nx, ny) ? WORLD.layer[ny * N + nx] : -1;
      const nh = nL >= 0 ? STEP_H[nL] : -0.5;
      if (nh < h - 0.001) {
        let a, b;
        if (oy === -1) { a = M3(tx, ty, h); b = M3(tx + 1, ty, h); } else if (ox === 1) { a = M3(tx + 1, ty, h); b = M3(tx + 1, ty + 1, h); }
        else if (oy === 1) { a = M3(tx + 1, ty + 1, h); b = M3(tx, ty + 1, h); } else { a = M3(tx, ty + 1, h); b = M3(tx, ty, h); }
        FL.quad([a[0], nh, a[2]], [b[0], nh, b[2]], b, a, 0xd0d0c8, true, [[0, 0.5], [1, 0.5], [1, 0.4], [0, 0.4]]);
      }
    }
  }

  /* ---------- ring of 8 arched walls around the tower ---------- */
  const hl = RING_HL, aw = 1.6, ys = 1.5, th = 0.72, top = WALL_H;
  const edgeXf = (cx, cy, phi) => {
    const s = Math.sin(phi), c = Math.cos(phi);
    return [-s, 0, -c, 0, 0, 1, 0, 0, c, 0, -s, 0, cx, 0, -cy, 1];
  };
  function archPanel(m) {
    const hw = th / 2;
    // stubs
    DK.box(m, -(hl + aw) / 2, top / 2, 0, (hl - aw) / 2, top / 2, hw, 0xffffff, 0.5);
    DK.box(m, (hl + aw) / 2, top / 2, 0, (hl - aw) / 2, top / 2, hw, 0xffffff, 0.5);
    // lintel slices
    const n = 12;
    for (let i = 0; i < n; i++) {
      const u0 = -aw + 2 * aw * i / n, u1 = -aw + 2 * aw * (i + 1) / n;
      const y0 = ys + Math.sqrt(Math.max(0, aw * aw - u0 * u0)), y1 = ys + Math.sqrt(Math.max(0, aw * aw - u1 * u1));
      for (const w of [hw, -hw]) {
        const q = [M4.pt(m, u0, y0, w), M4.pt(m, u1, y1, w), M4.pt(m, u1, top, w), M4.pt(m, u0, top, w)];
        if (w > 0) DK.quad(q[0], q[1], q[2], q[3], 0xffffff, true, [[u0 * .5, y0 * .5], [u1 * .5, y1 * .5], [u1 * .5, top * .5], [u0 * .5, top * .5]]);
        else DK.quad(q[1], q[0], q[3], q[2], 0xffffff, true, [[u1 * .5, y1 * .5], [u0 * .5, y0 * .5], [u0 * .5, top * .5], [u1 * .5, top * .5]]);
      }
      // soffit (underside of the arch) + top
      S.quad(M4.pt(m, u0, y0, -hw), M4.pt(m, u1, y1, -hw), M4.pt(m, u1, y1, hw), M4.pt(m, u0, y0, hw), COL.white, true);
      S.quad(M4.pt(m, u0, top, hw), M4.pt(m, u1, top, hw), M4.pt(m, u1, top, -hw), M4.pt(m, u0, top, -hw), 0x4a483d, true);
    }
    // arch trim bands (both faces)
    const seg = 14, bw = 0.34;
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI * i / seg, a1 = Math.PI * (i + 1) / seg;
      for (const w of [hw + 0.04, -hw - 0.04]) {
        const q = [M4.pt(m, Math.cos(a0) * aw, ys + Math.sin(a0) * aw, w), M4.pt(m, Math.cos(a1) * aw, ys + Math.sin(a1) * aw, w),
          M4.pt(m, Math.cos(a1) * (aw + bw), ys + Math.sin(a1) * (aw + bw), w), M4.pt(m, Math.cos(a0) * (aw + bw), ys + Math.sin(a0) * (aw + bw), w)];
        if (w > 0) S.quad(q[0], q[1], q[2], q[3], COL.white, true); else S.quad(q[1], q[0], q[3], q[2], COL.white, true);
      }
    }
    for (const sgn of [-1, 1]) for (const w of [hw + 0.04, -hw - 0.04]) {
      const u0 = sgn * aw, u1 = sgn * (aw + bw);
      const q = [M4.pt(m, u0, 0, w), M4.pt(m, u1, 0, w), M4.pt(m, u1, ys, w), M4.pt(m, u0, ys, w)];
      if ((w > 0) === (sgn > 0)) S.quad(q[0], q[1], q[2], q[3], COL.white, true); else S.quad(q[1], q[0], q[3], q[2], COL.white, true);
    }
  }
  const ringVerts = [];
  for (let k = 0; k < 8; k++) {
    const phi = k * Math.PI / 4; const cx = C + Math.cos(phi) * RING_A, cy = C + Math.sin(phi) * RING_A;
    const m = M4.mul(edgeXf(cx, cy, phi), M4.trans(0, STEP_H[0], 0));
    archPanel(m);
  }
  // vertex pillars, white caps and red banners
  for (let k = 0; k < 8; k++) {
    const phi = (k + 0.5) * Math.PI / 4; const rv = RING_A / Math.cos(Math.PI / 8);
    const vx = C + Math.cos(phi) * rv, vy = C + Math.sin(phi) * rv;
    DK.prism(null, vx, -vy, 0, top + 0.5, 0.78, 0.78, 10, 0xffffff, 0.5, k);
    S.prism(null, vx, -vy, top + 0.5, top + 0.72, 0.9, 0.9, 10, COL.white, 0, k);
    S.prism(null, vx, -vy, 0, 0.28, 0.9, 0.9, 10, COL.white, 0, k);
    ringVerts.push([vx, vy, phi]);
    if (k % 2 === 0) { // banners hang on the outside
      const ox = Math.cos(phi) * 0.82, oy = Math.sin(phi) * 0.82;
      const m = M4.mul(edgeXf(vx + ox, vy + oy, phi), M4.trans(0, 0, 0));
      S.quad(M4.pt(m, -0.33, 1.2, 0), M4.pt(m, 0.33, 1.2, 0), M4.pt(m, 0.33, 3.5, 0), M4.pt(m, -0.33, 3.5, 0), COL.red, true);
      S.quad(M4.pt(m, 0.33, 1.2, 0), M4.pt(m, -0.33, 1.2, 0), M4.pt(m, -0.33, 3.5, 0), M4.pt(m, 0.33, 3.5, 0), COL.red, true);
      S.quad(M4.pt(m, -0.14, 2.2, 0.01), M4.pt(m, 0.14, 2.2, 0.01), M4.pt(m, 0.14, 2.6, 0.01), M4.pt(m, -0.14, 2.6, 0.01), 0xd8c8a0, false);
    }
  }
  /* central tower + clerks' counter */
  DK.prism(null, C, -C, 0, 4.4, 1.7, 1.7, 14, 0xffffff, 0.5);
  S.prism(null, C, -C, 4.4, 4.55, 1.85, 1.85, 14, 0x2d2b24, 0);
  // counter: outer wall + top ring + inner wall
  const cr = 3.9, ci = 3.35, chh = 0.95, cn = 12;
  BG.prism(null, C, -C, 0, chh, cr, cr, cn, 0xffffff, 0.5, Math.PI / 12);
  for (let i = 0; i < cn; i++) {
    const a0 = i / cn * TAU + Math.PI / 12, a1 = (i + 1) / cn * TAU + Math.PI / 12;
    const q = [[C + Math.cos(a0) * cr, chh, -(C + Math.sin(a0) * cr)], [C + Math.cos(a1) * cr, chh, -(C + Math.sin(a1) * cr)],
      [C + Math.cos(a1) * ci, chh, -(C + Math.sin(a1) * ci)], [C + Math.cos(a0) * ci, chh, -(C + Math.sin(a0) * ci)]];
    S.quad(q[0], q[1], q[2], q[3], 0xc4b58c, true);
    S.quad([q[3][0], 0, q[3][2]], [q[2][0], 0, q[2][2]], q[2], q[3], 0x6f6448, true);
  }

  /* ---------- static collision: tower, counter, ring, pillars, map edge ---------- */
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const dx = tx + 0.5 - C, dy = ty + 0.5 - C;
    if (Math.hypot(dx, dy) < 4.15) blk(tx, ty, KIND.ring);     // tower + clerk counter
    for (let k = 0; k < 8; k++) {                               // ring wall
      const phi = k * Math.PI / 4, nx = Math.cos(phi), ny = Math.sin(phi);
      const dn = dx * nx + dy * ny, tt = -dx * ny + dy * nx;
      if (Math.abs(dn - RING_A) < 0.62 && Math.abs(tt) <= hl + 0.6 && Math.abs(tt) > aw + 0.05) blk(tx, ty, KIND.ring);
    }
  }
  for (const [vx, vy] of ringVerts) for (let ty = Math.floor(vy - 0.9); ty <= Math.floor(vy + 0.9); ty++) for (let tx = Math.floor(vx - 0.9); tx <= Math.floor(vx + 0.9); tx++) {
    if (Math.hypot(tx + 0.5 - vx, ty + 0.5 - vy) < 0.95) blk(tx, ty, KIND.ring);
  }
  for (let i = 0; i < N; i++) for (let b = 0; b < 3; b++) { blk(i, b, KIND.edge); blk(i, N - 1 - b, KIND.edge); blk(b, i, KIND.edge); blk(N - 1 - b, i, KIND.edge); }

  /* ---------- Varrock city walls, with a gatehouse in each gap ---------- */
  function wallSeg(x0, y0, x1, y1, thick, gaps) { // axis-aligned wall of tiles; gaps = [[s0, s1]] left open
    const horiz = Math.abs(x1 - x0) > Math.abs(y1 - y0);
    const len = horiz ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
    for (let s = 0; s < len; s++) {
      if (gaps && gaps.some(gp => s >= gp[0] && s <= gp[1])) continue;
      const x = horiz ? Math.min(x0, x1) + s : x0, y = horiz ? y0 : Math.min(y0, y1) + s;
      const hx = horiz ? 1 : thick, hy = horiz ? thick : 1;
      const base = groundH(x + hx / 2, y + hy / 2) - 0.6, hh = 3.9 + 0.6;
      const cxx = x + hx / 2, cyy = y + hy / 2;
      ST.box(null, cxx, base + hh / 2, -cyy, hx / 2, hh / 2, hy / 2, 0xffffff, 0.5);
      // merlons on alternate tiles, capped in a lighter stone
      if ((s & 1) === 0) {
        ST.box(null, cxx, base + hh + 0.22, -cyy, horiz ? 0.5 : hx / 2, 0.22, horiz ? hy / 2 : 0.5, 0xffffff, 0.5);
        S.box(null, cxx, base + hh + 0.46, -cyy, horiz ? 0.5 : hx / 2 + 0.03, 0.03, horiz ? hy / 2 + 0.03 : 0.5, 0xa8a89e);
      }
      for (let ax = 0; ax < hx; ax++) for (let ay = 0; ay < hy; ay++) blk(Math.floor(x) + ax, Math.floor(y) + ay, KIND.wall);
    }
  }
  /* a gatehouse arch across a 2-tile gap; uc = centre along the wall, w0/w1 = the two faces */
  function gateway(uc, g, w0, w1, axis, wOut, outSign) {
    const P = (u, y, w) => axis === 'x' ? [u, y, w] : [w, y, u];
    const R0 = 1.0, R1 = 1.25, sy = g + 2.2, n = 8, yTop = g + WALL_TOP;
    const arc = (a, r) => [uc - Math.cos(a) * r, sy + Math.sin(a) * r];
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n;
      const p00 = arc(a0, R0), p01 = arc(a1, R0), p10 = arc(a0, R1), p11 = arc(a1, R1);
      const vc = (i & 1) ? 0xffffff : 0xd8d8d0; // alternate voussoirs
      for (const w of [w0, w1]) ST.quad(P(p00[0], p00[1], w), P(p01[0], p01[1], w), P(p11[0], p11[1], w), P(p10[0], p10[1], w), vc, true, uv);
      ST.quad(P(p00[0], p00[1], w0), P(p01[0], p01[1], w0), P(p01[0], p01[1], w1), P(p00[0], p00[1], w1), 0xc8c8c0, true, uv); // soffit
    }
    // solid lintel block above the arch, flush with the wall top
    const ly = (sy + R1 + yTop) / 2, lh = (yTop - (sy + R1)) / 2, wm = (w0 + w1) / 2, wh = (w1 - w0) / 2;
    if (axis === 'x') ST.box(null, uc, ly, wm, 1.4, lh, wh, 0xffffff, 0.5); else ST.box(null, wm, ly, uc, wh, lh, 1.4, 0xffffff, 0.5);
    // banners either side of the gate, on the outer face
    const bnr = (u) => { const wp = wOut + outSign * 0.02; S.quad(P(u - 0.32, g + 3.1, wp), P(u + 0.32, g + 3.1, wp), P(u + 0.32, g + 1.3, wp), P(u - 0.32, g + 1.3, wp), COL.red, true); };
    bnr(uc - 1.75); bnr(uc + 1.75);
  }
  const WALL_TOP = 3.9;
  wallSeg(10, 78, 90, 78, 1, [[37, 38]]);    // north, gap at x 47..48
  wallSeg(10, 26, 10, 79, 1, [[21, 22]]);    // west, gap at y 47..48
  wallSeg(85, 20, 85, 79, 1, [[27, 28]]);    // east, gap at y 47..48
  gateway(48, groundH(48, 78.5), -79, -78, 'x', -79, -1);
  gateway(-48, groundH(10.5, 48), 10, 11, 'z', 10, -1);
  gateway(-48, groundH(85.5, 48), 85, 86, 'z', 86, 1);
  for (const [gx, gy] of [[47, 78], [48, 78], [10, 47], [10, 48], [85, 47], [85, 48]]) pathM[gy * N + gx] = 1;
  // corner towers: square stone bodies, merlon corners and a slate pyramid roof
  for (const [tx, ty] of [[9, 77], [88, 77], [9, 24], [84, 18]]) {
    const gc = groundH(tx + 1.5, ty + 1.5), yb = gc - 0.6, yt = gc + 5.8;
    ST.box(null, tx + 1.5, (yb + yt) / 2, -(ty + 1.5), 1.5, (yt - yb) / 2, 1.5, 0xffffff, 0.5);
    ST.box(null, tx + 1.5, gc - 0.2, -(ty + 1.5), 1.62, 0.2, 1.62, 0xffffff, 0.5);   // plinth
    for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) ST.box(null, tx + 1.5 + ox, yt + 0.22, -(ty + 1.5) + oz, 0.3, 0.22, 0.3, 0xffffff, 0.5);
    const ap = [tx + 1.5, yt + 1.8, -(ty + 1.5)];
    const c = [[tx - 0.15, yt, -(ty + 3.15)], [tx + 3.15, yt, -(ty + 3.15)], [tx + 3.15, yt, -(ty - 0.15)], [tx - 0.15, yt, -(ty - 0.15)]];
    for (let i = 0; i < 4; i++) S.tri(c[i], c[(i + 1) % 4], ap, COL.slate, true);
    for (let ax = 0; ax < 3; ax++) for (let ay = 0; ay < 3; ay++) blk(tx + ax, ty + ay, KIND.tower);
  }

  /* ---------- Varrock buildings: plaster walls, pantile roofs, timber, awnings and signs ---------- */
  const doors = [];
  const fbox = (mesh, f, s, y, hw, hh, off, t, col, k) => { // box on a wall face f at span s; off/t are outward offset and half depth
    mesh.box(null, f.ox + f.tx * s + f.nx * off, y, f.oz + f.tz * s + f.nz * off, Math.abs(f.tx) * hw + Math.abs(f.nx) * t, hh, Math.abs(f.tz) * hw + Math.abs(f.nz) * t, col, k);
  };
  const awning = (f, s0, s1, y, proj, drop, cA, cB, n) => {
    const pt = (s, o, yy) => [f.ox + f.tx * s + f.nx * o, yy, f.oz + f.tz * s + f.nz * o];
    for (let i = 0; i < n; i++) {
      const sa = s0 + (s1 - s0) * i / n, sb = s0 + (s1 - s0) * (i + 1) / n;
      S.quad(pt(sa, 0.02, y), pt(sb, 0.02, y), pt(sb, proj, y - drop), pt(sa, proj, y - drop), (i & 1) ? cA : cB, true);
    }
  };
  function building(x0, y0, w, d, h, roof, signCol, id) {
    const cx = x0 + w / 2, cz = -(y0 + d / 2), g = groundH(cx, y0 + d / 2), pl = 0.2;
    const yE = g + h, wy = g + pl + (h - pl) / 2, zc = cz;
    for (let ax = 0; ax < w; ax++) for (let ay = 0; ay < d; ay++) blk(x0 + ax, y0 + ay, KIND.building);
    // plinth, plaster body and corner pilasters
    ST.box(null, cx, g + pl / 2, cz, w / 2 + 0.06, pl / 2, d / 2 + 0.06, 0xffffff, 0.5);
    BG.box(null, cx, wy, cz, w / 2, (h - pl) / 2, d / 2, 0xffffff, 0.5);
    for (const [px, pz] of [[x0, -y0], [x0 + w, -y0], [x0, -(y0 + d)], [x0 + w, -(y0 + d)]]) ST.box(null, px, wy, pz, 0.12, (h - pl) / 2, 0.12, 0xffffff, 0.5);
    // faces: front (+z, the door side), back, east, west; s runs along the face from its start point
    const F = [
      { ox: x0, oz: -y0, tx: 1, tz: 0, nx: 0, nz: 1, len: w },
      { ox: x0 + w, oz: -(y0 + d), tx: -1, tz: 0, nx: 0, nz: -1, len: w },
      { ox: x0 + w, oz: -y0, tx: 0, tz: -1, nx: 1, nz: 0, len: d },
      { ox: x0, oz: -(y0 + d), tx: 0, tz: 1, nx: -1, nz: 0, len: d }
    ];
    const f0 = F[0];
    for (const f of F) fbox(WD, f, f.len / 2, g + h * 0.58, f.len / 2, 0.05, 0.035, 0.035, 0xffffff, 1); // timber string course
    // windows: dark frame, glass, mullions, sill and green shutters
    const winRow = g + pl + (h - pl) * 0.55;
    const win = (f, s) => {
      fbox(WD, f, s, winRow, 0.36, 0.44, 0.03, 0.03, COL.frame, 1);
      fbox(S, f, s, winRow, 0.28, 0.36, 0.065, 0.01, COL.glass);
      fbox(WD, f, s, winRow, 0.02, 0.36, 0.085, 0.01, COL.frame, 1);
      fbox(WD, f, s, winRow, 0.28, 0.02, 0.085, 0.01, COL.frame, 1);
      fbox(ST, f, s, winRow - 0.5, 0.44, 0.04, 0.05, 0.05, 0xffffff, 0.5);
      fbox(S, f, s - 0.42, winRow, 0.1, 0.36, 0.03, 0.03, COL.shutter);
      fbox(S, f, s + 0.42, winRow, 0.1, 0.36, 0.03, 0.03, COL.shutter);
    };
    for (const s of [1.5, w - 1.5]) { win(F[0], s); win(F[1], s); }
    win(F[2], d / 2); win(F[3], d / 2);
    // door: dark recess, planked leaf, timber frame, step and handle
    const dS = w / 2, dy = g + pl;
    fbox(S, f0, dS, dy + 0.9, 0.42, 0.9, 0.0, 0.01, 0x231a10);
    fbox(WD, f0, dS, dy + 0.9, 0.36, 0.9, 0.035, 0.035, 0x6b4a26, 1);
    fbox(WD, f0, dS - 0.42, dy + 0.9, 0.06, 0.94, 0.05, 0.05, COL.frame, 1);
    fbox(WD, f0, dS + 0.42, dy + 0.9, 0.06, 0.94, 0.05, 0.05, COL.frame, 1);
    fbox(WD, f0, dS, dy + 1.8, 0.48, 0.06, 0.05, 0.05, COL.frame, 1);
    fbox(S, f0, dS + 0.26, dy + 0.9, 0.04, 0.05, 0.08, 0.02, COL.gold);
    fbox(ST, f0, dS, g + 0.07, 0.62, 0.07, 0.18, 0.18, 0xffffff, 0.5);
    // striped awning over the door and a hanging sign above it
    const aw0 = [0x8a2a24, 0xe8e0c8, 0x2a5a3a, 0x2a3a7a][id % 4];
    awning(f0, dS - 0.95, dS + 0.95, g + 2.25, 0.7, 0.5, aw0, 0xe8e0c8, 4);
    const sy = g + h * 0.74;
    fbox(WD, f0, dS, sy + 0.28, 0.02, 0.02, 0.22, 0.22, COL.frame, 1);
    fbox(WD, f0, dS, sy, 0.32, 0.2, 0.46, 0.02, signCol, 1);
    fbox(S, f0, dS, sy, 0.24, 0.05, 0.49, 0.01, COL.gold);
    // roof: two pantile slopes with eaves, gable ends, ridge cap, eave boards and a brick chimney
    const oh = 0.45, rh = 1.5, yR = yE + rh;
    const zF = -y0 + oh, zB = -(y0 + d) - oh, xL = x0 - oh, xR = x0 + w + oh;
    const slope = Math.hypot(d / 2 + oh, rh), uL = (xR - xL) * 0.5, vL = slope * 0.5;
    RF.quad([xL, yE, zF], [xR, yE, zF], [xR, yR, zc], [xL, yR, zc], roof, true, [[0, 0], [uL, 0], [uL, vL], [0, vL]]);
    RF.quad([xR, yE, zB], [xL, yE, zB], [xL, yR, zc], [xR, yR, zc], roof, true, [[0, 0], [uL, 0], [uL, vL], [0, vL]]);
    S.tri([xL, yE, zF], [xL, yE, zB], [xL, yR, zc], COL.beige, true);
    S.tri([xR, yE, zB], [xR, yE, zF], [xR, yR, zc], COL.beige, true);
    S.box(null, cx, yR + 0.03, zc, (w + 2 * oh) / 2, 0.04, 0.1, shadeCol(roof, 0.7));
    WD.box(null, cx, yE - 0.02, zF - 0.02, (w + 2 * oh) / 2, 0.06, 0.04, 0xffffff, 1);
    WD.box(null, cx, yE - 0.02, zB + 0.02, (w + 2 * oh) / 2, 0.06, 0.04, 0xffffff, 1);
    BR.box(null, x0 + 1.6, yR + 0.35, zc, 0.2, 0.7, 0.2, 0xa05a3a, 1.5);
    S.box(null, x0 + 1.6, yR + 1.08, zc, 0.27, 0.06, 0.27, 0x6a6a64);
    // door at the door tile, which the cobbled path starts from
    doors.push([x0 + (w >> 1), y0 - 1]);
  }
  for (let i = 0; i < BUILD.length; i++) { const b = BUILD[i]; building(b[0], b[1], b[2], b[3], b[4], b[5], b[6], i); }

  /* ---------- cobbled paths: shortest walk from each door (and gate) to the plaza edge ---------- */
  const plat = (x, y) => inMap(x, y) && WORLD.layer[y * N + x] >= 0;
  const nearPlat = (x, y) => plat(x + 1, y) || plat(x - 1, y) || plat(x, y + 1) || plat(x, y - 1);
  const route = (sx, sy) => {
    const par = new Int32Array(N * N).fill(-1), seen = new Uint8Array(N * N), q = [sy * N + sx];
    seen[q[0]] = 1; let goal = -1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % N, y = (i - x) / N;
      if (nearPlat(x, y)) { goal = i; break; }
      const nb = [x + 1, y, x - 1, y, x, y + 1, x, y - 1];
      for (let k = 0; k < 8; k += 2) {
        const nx = nb[k], ny = nb[k + 1]; if (!inMap(nx, ny)) continue;
        const j = ny * N + nx; if (seen[j] || WORLD.block[j] || WORLD.layer[j] >= 0) continue;
        seen[j] = 1; par[j] = i; q.push(j);
      }
    }
    for (let i = goal; i >= 0; i = par[i]) pathM[i] = 1;
  };
  for (const [dx, dy] of doors) route(dx, dy);
  doors.push([47, 77], [11, 47], [84, 47]);             // gate interiors (routed above, kept for prop spacing)
  route(47, 77); route(11, 47); route(84, 47);
  const litWhite = (i, j) => shadeCol(0xffffff, cN(i, j));
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    if (!pathM[ty * N + tx] || WORLD.layer[ty * N + tx] >= 0) continue;
    const c = [litWhite(tx, ty), litWhite(tx + 1, ty), litWhite(tx + 1, ty + 1), litWhite(tx, ty + 1)];
    CB.quad(M3(tx, ty, cornerH(tx, ty) + 0.025), M3(tx + 1, ty, cornerH(tx + 1, ty) + 0.025), M3(tx + 1, ty + 1, cornerH(tx + 1, ty + 1) + 0.025), M3(tx, ty + 1, cornerH(tx, ty + 1) + 0.025), c, false, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }

  /* ---------- bank booths: teller counters with glass screens and a gold sign ---------- */
  const bpos = [[C - 6, C - 5], [C + 5, C - 5], [C - 6, C + 5], [C + 5, C + 5]];
  const bth = mulberry32(555);
  for (const [bx, by] of bpos) {
    const g = tileH(bx, by), cx = bx + 0.5, cz = -(by + 0.5);
    ST.box(null, cx, g + 0.08, cz, 0.5, 0.08, 0.46, 0xffffff, 0.5);             // plinth
    WD.box(null, cx, g + 0.5, cz, 0.44, 0.34, 0.4, 0xffffff, 1);                 // cabinet
    S.box(null, cx, g + 0.86, cz, 0.52, 0.04, 0.46, 0x3c5a34);                   // green counter top
    for (const sx of [-0.44, 0.44]) for (const sz of [-0.4, 0.4]) WD.box(null, cx + sx, g + 1.35, cz + sz, 0.05, 0.5, 0.05, 0xffffff, 1);
    for (const sz of [-0.4, 0.4]) S.box(null, cx, g + 1.3, cz + sz, 0.4, 0.42, 0.02, COL.glass);
    WD.box(null, cx, g + 1.9, cz, 0.52, 0.05, 0.46, 0xffffff, 1);                // top beam
    for (const sz of [-0.47, 0.47]) { S.box(null, cx, g + 1.8, cz + sz, 0.42, 0.1, 0.02, COL.gold); S.box(null, cx, g + 1.8, cz + sz * 1.02, 0.44, 0.12, 0.01, COL.frame); }
    for (let i = 0; i < 4; i++) S.blob(null, cx - 0.25 + i * 0.16, g + 0.95, cz + (bth() - 0.5) * 0.2, 0.07, 0.05, 0.07, 6, 3, COL.gold, 0.1, bth); // coin piles
    blk(bx, by, KIND.booth);
    WORLD.objs.push({ kind: 'bank', name: 'Bank booth', x: bx, y: by, h: 1.3 });
  }
  // a treasure chest near the north arch: wooden body, rounded iron-banded lid and a gold lock
  { const cx = C + 0, cy = C + 6; const g = tileH(cx, cy); const x = cx + 0.5, z = -(cy + 0.5), yb = g + 0.56, r = 0.3;
    WD.box(null, x, g + 0.28, z, 0.42, 0.28, 0.3, 0xffffff, 1);
    for (let i = 0; i < 6; i++) {
      const a0 = Math.PI * i / 6, a1 = Math.PI * (i + 1) / 6, q = (a, xx) => [xx, yb + Math.sin(a) * r, z - Math.cos(a) * r];
      S.quad(q(a0, x - 0.42), q(a0, x + 0.42), q(a1, x + 0.42), q(a1, x - 0.42), (i & 1) ? 0x7a5a30 : 0x6e5029, true);
    }
    for (const sx of [-0.22, 0.22]) S.box(null, x + sx, g + 0.4, z + 0.31, 0.03, 0.27, 0.01, COL.iron);
    S.box(null, x, g + 0.42, z + 0.32, 0.07, 0.08, 0.012, COL.gold);
    blk(cx, cy, KIND.booth); WORLD.objs.push({ kind: 'chest', name: 'Chest', x: cx, y: cy, h: 0.7 }); }

  /* ---------- trees: broadleaf, conifer and shrub ---------- */
  const tr = mulberry32(31337);
  const cone = (cx, cz, y0, r, h, n, col) => {
    const ap = [cx, y0 + h, cz], ring = [];
    for (let i = 0; i <= n; i++) { const a = i / n * TAU; ring.push([cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r]); }
    for (let i = 0; i < n; i++) S.tri(ring[i], ring[i + 1], ap, col, true);
  };
  const branch = (x, y, z, yaw, pitch, len, r, col) => {
    const m = M4.mul(M4.trans(x, y, z), M4.mul(M4.rotY(-yaw), M4.rotZ(pitch)));
    S.box(m, len / 2, 0, 0, len / 2, r, r, col);
  };
  const treeAt = (x, y, sc, kind) => {
    const g = groundH(x, y), zz = -y, tc = shadeCol(COL.trunk, 0.9 + tr() * 0.2);
    const lc = shadeCol(COL.leaf, 0.85 + tr() * 0.3);
    if (kind === 1) { // conifer: tapering tiers of cones
      S.prism(null, x, zz, g - 0.2, g + 1.2 * sc, 0.12 * sc, 0.12 * sc, 6, tc, 0);
      for (let k = 0; k < 3; k++) cone(x, zz, g + (0.55 + k * 0.5) * sc, (1.0 - k * 0.25) * sc, 1.2 * sc, 7, shadeCol(0x2c4e2a, 0.88 + tr() * 0.24));
    } else if (kind === 2) { // low shrub, no trunk
      S.blob(null, x, g + 0.55 * sc, zz, 0.75 * sc, 0.6 * sc, 0.75 * sc, 8, 4, shadeCol(lc, 0.9), 0.3, tr);
      S.blob(null, x + 0.35 * sc, g + 0.45 * sc, zz - 0.25 * sc, 0.5 * sc, 0.42 * sc, 0.5 * sc, 7, 3, lc, 0.3, tr);
    } else { // broadleaf: trunk, four branches and leaf clusters
      S.prism(null, x, zz, g - 0.2, g + 1.9 * sc, 0.17 * sc, 0.17 * sc, 6, tc, 0);
      for (let k = 0; k < 4; k++) {
        const yaw = k * 1.57 + tr() * 0.6, pitch = 0.45 + tr() * 0.35, len = (0.8 + tr() * 0.5) * sc;
        const by = g + 1.2 * sc + tr() * 0.4 * sc;
        branch(x, by, zz, yaw, pitch, len, 0.06 * sc, tc);
        const ex = x + Math.cos(yaw) * Math.cos(pitch) * len, ey = by + Math.sin(pitch) * len, ez = zz + Math.sin(yaw) * Math.cos(pitch) * len;
        S.blob(null, ex, ey + 0.2 * sc, ez, 0.75 * sc, 0.7 * sc, 0.75 * sc, 8, 4, shadeCol(lc, 0.9 + tr() * 0.2), 0.3, tr);
      }
      S.blob(null, x, g + 2.9 * sc, zz, 1.1 * sc, 0.95 * sc, 1.1 * sc, 9, 5, lc, 0.3, tr);
    }
    blk(Math.floor(x), Math.floor(y), KIND.tree);
    WORLD.trees.push({ x, y, kind });
  };
  const nearDoor = (x, y) => doors.some(d => Math.abs(d[0] - x) <= 1 && Math.abs(d[1] - y) <= 1);
  const freeTile = (x, y) => inMap(x, y) && !WORLD.block[y * N + x] && !pathM[y * N + x] && !taken[y * N + x] && WORLD.layer[y * N + x] < 0 && !nearDoor(x, y);
  let placed = 0, guard = 0;
  while (placed < 56 && guard++ < 5000) {
    const x = 14 + tr() * 68, y = 6 + tr() * 70; const d = poly12(x - C, y - C), kr = tr();
    if (d < 23.5) continue;
    if (WORLD.trees.some(t => Math.hypot(t.x - x, t.y - y) < 3.6)) continue;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!freeTile(tx, ty)) continue;
    const kind = kr < 0.45 ? 0 : (kr < 0.75 ? 1 : 2);
    taken[ty * N + tx] = 1;
    treeAt(tx + 0.5, ty + 0.5, kind === 2 ? 0.8 + tr() * 0.3 : 0.85 + tr() * 0.4, kind); placed++;
  }
  // bench circle around a big tree (north-west, like the real GE)
  { const bx = 33, by = 72; taken[by * N + bx] = 1; treeAt(bx + 0.5, by + 0.5, 1.5, 0);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4; const px = bx + 0.5 + Math.cos(a) * 2.7, py = by + 0.5 + Math.sin(a) * 2.7; const g = groundH(px, py);
      const m = edgeXf(px, py, a + Math.PI / 2);
      WD.box(m, 0, g + 0.5, 0, 0.9, 0.06, 0.28, 0xffffff, 1);
      WD.box(m, -0.75, g + 0.25, 0, 0.06, 0.25, 0.22, 0xffffff, 1); WD.box(m, 0.75, g + 0.25, 0, 0.06, 0.25, 0.22, 0xffffff, 1);
      WD.box(m, 0, g + 0.85, 0.24, 0.9, 0.3, 0.05, 0xffffff, 1);
    }
  }

  /* ---------- props: stalls, well, barrels, crates, lamps, benches, flower beds, rocks, bushes ---------- */
  const pr = mulberry32(4242);
  const barrel = (cx, cz, g) => {
    WD.prism(null, cx, cz, g, g + 0.85, 0.28, 0.28, 8, 0xffffff, 1);
    S.prism(null, cx, cz, g + 0.82, g + 0.86, 0.22, 0.22, 8, shadeCol(0x7a5a30, 0.9 + pr() * 0.2));
    S.prism(null, cx, cz, g + 0.18, g + 0.23, 0.31, 0.31, 8, COL.iron);
    S.prism(null, cx, cz, g + 0.62, g + 0.67, 0.31, 0.31, 8, COL.iron);
  };
  const crate = (cx, cz, g, stack) => {
    WD.box(null, cx, g + 0.3, cz, 0.36, 0.3, 0.36, 0xffffff, 1);
    if (stack) WD.box(null, cx + 0.03, g + 0.84, cz - 0.02, 0.3, 0.24, 0.3, 0xffffff, 1);
  };
  const stall = (cx, cz, g, cA, cB) => {
    WD.box(null, cx, g + 0.56, cz, 0.44, 0.04, 0.42, 0xffffff, 1);                 // table
    for (const sx of [-0.4, 0.4]) for (const sz of [-0.38, 0.38]) WD.box(null, cx + sx, g + 0.27, cz + sz, 0.04, 0.27, 0.04, 0xffffff, 1);
    S.blob(null, cx - 0.2, g + 0.68, cz + 0.05, 0.1, 0.08, 0.1, 6, 3, 0xc03a22, 0.1, pr);
    S.blob(null, cx + 0.1, g + 0.68, cz - 0.1, 0.1, 0.08, 0.1, 6, 3, 0xd8a030, 0.1, pr);
    S.blob(null, cx + 0.15, g + 0.68, cz + 0.12, 0.1, 0.08, 0.1, 6, 3, 0x4a7a3a, 0.1, pr);
    for (const [sx, sz] of [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) WD.box(null, cx + sx, g + 0.95, cz + sz, 0.035, 0.95, 0.035, 0xffffff, 1);
    const T = [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]], B = [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]];
    for (let k = 0; k < 4; k++) {
      const t0 = T[k], t1 = T[(k + 1) % 4], b0 = B[k], b1 = B[(k + 1) % 4];
      S.quad([cx + t0[0], g + 1.9, cz + t0[1]], [cx + t1[0], g + 1.9, cz + t1[1]], [cx + b1[0], g + 1.55, cz + b1[1]], [cx + b0[0], g + 1.55, cz + b0[1]], (k & 1) ? cA : cB, true);
    }
    S.quad([cx - 0.45, g + 1.9, cz - 0.45], [cx + 0.45, g + 1.9, cz - 0.45], [cx + 0.45, g + 1.9, cz + 0.45], [cx - 0.45, g + 1.9, cz + 0.45], cA, true);
  };
  const well = (cx, cz, g) => {
    ST.prism(null, cx, cz, g, g + 0.85, 0.42, 0.42, 10, 0xffffff, 0.5);             // stone ring
    S.prism(null, cx, cz, g + 0.84, g + 0.86, 0.34, 0.34, 10, 0x2a3a3a);           // water
    for (const sx of [-0.36, 0.36]) WD.box(null, cx + sx, g + 1.15, cz, 0.04, 0.3, 0.04, 0xffffff, 1);
    WD.box(null, cx, g + 1.5, cz, 0.42, 0.04, 0.05, 0xffffff, 1);
    S.quad([cx - 0.5, g + 1.65, cz + 0.45], [cx + 0.5, g + 1.65, cz + 0.45], [cx + 0.5, g + 1.92, cz], [cx - 0.5, g + 1.92, cz], 0x5a4a3a, true);
    S.quad([cx - 0.5, g + 1.65, cz - 0.45], [cx + 0.5, g + 1.65, cz - 0.45], [cx + 0.5, g + 1.92, cz], [cx - 0.5, g + 1.92, cz], 0x4a3a2a, true);
  };
  const flowers = (cx, cz, g) => {
    ST.box(null, cx, g + 0.07, cz, 0.44, 0.07, 0.3, 0xffffff, 0.5);
    S.box(null, cx, g + 0.15, cz, 0.38, 0.02, 0.24, 0x3a2a18);
    const cols = [0xc03030, 0xe0c040, 0x8040a0, 0xf0f0f0, 0xd06020];
    for (let i = 0; i < 7; i++) S.blob(null, cx + (pr() - 0.5) * 0.7, g + 0.24, cz + (pr() - 0.5) * 0.4, 0.07, 0.07, 0.07, 5, 3, cols[i % cols.length], 0, pr);
  };
  const lamp = (cx, cz, g) => {
    ST.prism(null, cx, cz, g, g + 0.2, 0.12, 0.12, 6, 0xffffff, 0.5);
    S.prism(null, cx, cz, g + 0.2, g + 2.1, 0.04, 0.04, 5, 0x2a2a28);
    S.box(null, cx, g + 2.25, cz, 0.1, 0.12, 0.1, 0xf0d070);
    S.box(null, cx, g + 2.4, cz, 0.13, 0.03, 0.13, 0x2a2a28);
  };
  const bench = (cx, cz, g, along) => {
    const L = along === 'x' ? [0.42, 0.04, 0.14] : [0.14, 0.04, 0.42];
    WD.box(null, cx, g + 0.42, cz, L[0], L[1], L[2], 0xffffff, 1);
    for (const s of [-0.34, 0.34]) WD.box(null, along === 'x' ? cx + s : cx, g + 0.2, along === 'x' ? cz : cz + s, along === 'x' ? 0.04 : 0.14, 0.2, along === 'x' ? 0.14 : 0.04, 0xffffff, 1);
  };
  const rock = (cx, cz, g) => S.blob(null, cx, g + 0.22, cz, 0.42, 0.3, 0.38, 7, 4, shadeCol(0x7a7a70, 0.9 + pr() * 0.2), 0.3, pr);
  const fence = (cx, cz, g, along) => { // one-tile rail fence section
    const hx = along === 'x' ? 0.5 : 0.04, hz = along === 'x' ? 0.04 : 0.5;
    for (const yy of [0.3, 0.6]) WD.box(null, cx, g + yy, cz, hx, 0.035, hz, 0xffffff, 1);
    for (const sv of [-0.44, 0.44]) WD.box(null, cx + (along === 'x' ? sv : 0), g + 0.35, cz + (along === 'x' ? 0 : sv), 0.04, 0.35, 0.04, 0xffffff, 1);
  };
  // place a prop on a free tile; solid props also block the tile
  const prop = (x, y, solid, fn) => {
    if (!freeTile(x, y)) return false;
    taken[y * N + x] = 1; if (solid) blk(x, y, KIND.prop);
    fn(x + 0.5, -(y + 0.5), groundH(x + 0.5, y + 0.5)); return true;
  };
  const PROPS = [
    [27, 61, true, (x, z, g) => well(x, z, g)],
    [39, 69, true, (x, z, g) => stall(x, z, g, 0xa02a20, 0xe8e0c8)],
    [56, 69, true, (x, z, g) => stall(x, z, g, 0x2a5a8a, 0xe8e0c8)],
    [60, 74, true, (x, z, g) => stall(x, z, g, 0x3a7a3a, 0xe8e0c8)],
    [66, 66, true, (x, z, g) => barrel(x, z, g)],
    [67, 68, true, (x, z, g) => barrel(x, z, g)],
    [79, 49, true, (x, z, g) => crate(x, z, g, true)],
    [79, 51, true, (x, z, g) => crate(x, z, g, false)],
    [21, 53, false, (x, z, g) => flowers(x, z, g)],
    [25, 33, false, (x, z, g) => flowers(x, z, g)],
    [71, 58, false, (x, z, g) => flowers(x, z, g)],
    [30, 58, false, (x, z, g) => bench(x, z, g, 'x')],
    [44, 72, false, (x, z, g) => bench(x, z, g, 'x')],
    [6, 40, true, (x, z, g) => rock(x, z, g)],
    [5, 60, true, (x, z, g) => rock(x, z, g)],
    [60, 84, true, (x, z, g) => rock(x, z, g)],
    [36, 86, true, (x, z, g) => rock(x, z, g)],
    [13, 33, true, (x, z, g) => treeAt(x, -z, 0.8, 2)],
    [14, 70, true, (x, z, g) => treeAt(x, -z, 0.8, 2)],
    [81, 30, true, (x, z, g) => treeAt(x, -z, 0.8, 2)],
    [82, 62, true, (x, z, g) => treeAt(x, -z, 0.8, 2)],
    [24, 57, true, (x, z, g) => fence(x, z, g, 'z')],
    [24, 58, true, (x, z, g) => fence(x, z, g, 'z')],
    [24, 59, true, (x, z, g) => fence(x, z, g, 'z')],
  ];
  let propsPlaced = 0;
  for (const [x, y, solid, fn] of PROPS) if (prop(x, y, solid, fn)) propsPlaced++;
  // lamp posts beside the cobbled paths, non-solid
  for (let i = 0; i < N * N; i++) {
    if (!pathM[i] || (i % 9) !== 0 || WORLD.layer[i] >= 0) continue;
    const x = i % N, y = (i - x) / N;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (prop(x + dx, y + dy, false, (cx, cz, g) => lamp(cx, cz, g))) break;
  }
  WORLD.propsPlaced = propsPlaced;

  /* ---------- minimap colours ---------- */
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const i = ty * N + tx; const d = poly12(tx + 0.5 - C, ty + 0.5 - C);
    let c;
    if (WORLD.layer[i] >= 0) c = 0x8d8d84; else { const n = vn(tx * 0.3, ty * 0.3); c = mixCol(0x5d6a2d, 0x788636, n); const dirt = clamp((25.5 + 3.5 * n - d) / 3.5, 0, 1); c = mixCol(c, 0x8a7d5c, dirt); }
    if (pathM[i] && WORLD.layer[i] < 0) c = 0xa39d8b;
    if (WORLD.block[i]) c = KIND_MM[KINDS[i]] || 0x4a4a42;
    WORLD.mm[i] = c;
  }
  for (const t of WORLD.trees) WORLD.mm[Math.floor(t.y) * N + Math.floor(t.x)] = 0x2f4d17;
  for (const m of meshes) if (m.count) WORLD.statics.push(R.upload(m));
  WORLD.ready = true;
}
