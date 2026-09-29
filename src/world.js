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
  objs: [], trees: [], statics: [], occluders: [], ready: false
};
const PLAT_R = 15.5;                    // platform apothem
const STEP_H = [0, -0.11, -0.22, -0.33];
const RING_A = 8.5, RING_HL = RING_A * Math.tan(Math.PI / 8), WALL_H = 3.6;
const COL = {
  dirt: 0x867b5c, grass: 0x666f33, grass2: 0x7b8a3a, flag: 0x7f7f76, dark: 0x3d3b32, white: 0xdcd5bd, light: 0x8b8b82,
  wood: 0x6b4f2a, trunk: 0x5c4526, leaf: 0x4a6e24, red: 0x8a1c14, beige: 0xa8996f
};

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

/* ---------- textures (64x64, drawn with the pixel toolkit) ---------- */
function makeWorldTextures(R) {
  const mk = (name, fn) => { const p = new Pix(64, 64); fn(p); R.makeTexture(name, p.canvas(), true); };
  mk('flag', p => {
    const r = mulberry32(7); noiseFill(p, 0, 0, 64, 64, COL.flag, 5, 11);
    for (let i = 0; i < 26; i++) { // craters
      const x=3+Math.floor(r()*58),y=3+Math.floor(r()*58),rx=1+Math.floor(r()*3),ry=1+Math.floor(r()*2);
      p.ellipse(x, y, rx, ry, 0x6c6c64); p.ellipse(x - 1, y - 1, Math.max(0, rx - 1), Math.max(0, ry - 1), 0x76766d);
    }
    for (let i = 0; i < 64; i++) { p.set(i, 0, 0x5b5b53); p.set(0, i, 0x5b5b53); p.set(i, 1, 0x8c8c83); p.set(1, i, 0x8c8c83); }
  });
  mk('dark', p => { // GE ring walls: dark ashlar blocks
    noiseFill(p, 0, 0, 64, 64, COL.dark, 7, 5);
    for (let row = 0; row < 8; row++) {
      const y = row * 8, off = (row & 1) ? 8 : 0;
      p.rect(0, y, 64, 1, 0x57554a);
      for (let x = off; x < 64 + 16; x += 16) p.rect(x % 64, y, 1, 8, 0x57554a);
      p.rect(0, y + 7, 64, 1, 0x26241e);
    }
  });
  mk('stone', p => { // Varrock city wall: light grey blocks
    noiseFill(p, 0, 0, 64, 64, COL.light, 9, 3);
    for (let row = 0; row < 4; row++) {
      const y = row * 16, off = (row & 1) ? 16 : 0;
      p.rect(0, y, 64, 1, 0x6a6a62); p.rect(0, y + 1, 64, 1, 0x9c9c93);
      for (let x = off; x < 64 + 32; x += 32) { p.rect(x % 64, y, 1, 16, 0x6a6a62); }
    }
  });
  mk('wood', p => { noiseFill(p, 0, 0, 64, 64, COL.wood, 10, 9); for (let y = 0; y < 64; y += 8) p.rect(0, y, 64, 1, 0x4d3620); });
  mk('beige', p => {
    noiseFill(p, 0, 0, 64, 64, COL.beige, 6, 13);
    for (let y = 0; y < 64; y += 16) p.rect(0, y, 64, 1, 0x877a55);
    for (let x = 0; x < 64; x += 32) p.rect(x, 0, 1, 64, 0x877a55);
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
    return h;
  };
  const M3 = (x, y, h) => [x, h, -y];

  /* platform layers + heights */
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const d = poly12(tx + 0.5 - C, ty + 0.5 - C); let L = -1;
    if (d <= PLAT_R) L = 0; else if (d <= PLAT_R + 1) L = 1; else if (d <= PLAT_R + 2) L = 2; else if (d <= PLAT_R + 3) L = 3;
    WORLD.layer[ty * N + tx] = L;
    WORLD.th[ty * N + tx] = L >= 0 ? STEP_H[L] : baseGround(tx + 0.5, ty + 0.5);
  }

  let S = new Mesh('white'), DK = new Mesh('dark');
  const FL = new Mesh('flag'), ST = new Mesh('stone'), WD = new Mesh('wood'), BG = new Mesh('beige');
  const meshes = [S, FL, DK, ST, WD, BG];

  // Keep tall foreground structures in small separate batches so only the
  // structures hiding the player fade. Do not remove or change collision.
  WORLD.occluders=[];
  function occluder(meta,draw){
    const oldS=S,oldDK=DK;S=new Mesh('white');DK=new Mesh('dark');draw();
    meta.gpus=[DK,S].filter(m=>m.count).map(m=>R.upload(m));WORLD.occluders.push(meta);S=oldS;DK=oldDK;
  }
  /* terrain mesh (skips platform tiles) */
  const cornerH = (i, j) => baseGround(i, j);
  const cornerCol = (i, j) => {
    const d = poly12(i - C, j - C), n = vn(i * 0.3, j * 0.3), n2 = vn(i * 0.9 + 3, j * 0.9);
    const dirt = clamp((25.5 + 3.5 * n - d) / 3.5, 0, 1);
    let g = mixCol(COL.grass, COL.grass2, clamp(n * 1.2 - 0.2 + (d > 40 ? 0.15 : 0), 0, 1));
    let c = mixCol(g, COL.dirt, dirt);
    return shadeCol(c, 0.9 + 0.2 * n2);
  };
  const cN = (i, j) => { // corner normal light
    const e = 0.5; const hx = baseGround(i + e, j) - baseGround(i - e, j), hy = baseGround(i, j + e) - baseGround(i, j - e);
    return lightAt(-hx, 1, hy);
  };
  const litCol = (i, j) => { const c = cornerCol(i, j), f = cN(i, j); return shadeCol(c, f); };
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    if (WORLD.layer[ty * N + tx] >= 0) continue;
    const c = [litCol(tx, ty), litCol(tx + 1, ty), litCol(tx + 1, ty + 1), litCol(tx, ty + 1)];
    S.quad(M3(tx, ty, cornerH(tx, ty)), M3(tx + 1, ty, cornerH(tx + 1, ty)), M3(tx + 1, ty + 1, cornerH(tx + 1, ty + 1)), M3(tx, ty + 1, cornerH(tx, ty + 1)), c, false);
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
  const P = (u, v, w) => [u, v, w];
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
      const tp = (v) => v * 0.5;
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
    occluder({kind:"arch",x:cx,y:cy,phi,half:hl,thick:th/2+.06,height:WALL_H,aperture:aw,spring:ys},()=>archPanel(m));
  }
  // vertex pillars, white caps and red banners
  for (let k = 0; k < 8; k++) {
    const phi = (k + 0.5) * Math.PI / 4; const rv = RING_A / Math.cos(Math.PI / 8);
    const vx = C + Math.cos(phi) * rv, vy = C + Math.sin(phi) * rv;
    occluder({kind:'pillar',x:vx,y:vy,radius:.92,height:top+.72},()=>{
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
    });
  }
  /* central tower + clerks' counter */
  occluder({kind:'pillar',x:C,y:C,radius:1.95,height:5.0},()=>{
  DK.prism(null, C, -C, 0, 4.4, 1.7, 1.7, 14, 0xffffff, 0.5);
  S.prism(null, C, -C, 4.4, 4.55, 1.85, 1.85, 14, 0x2d2b24, 0);
  S.prism(null,C,-C,4.25,4.37,1.82,1.82,14,0xaaa18b,0);
  for(let k=0;k<14;k++){
    const a=k/14*TAU,x=C+Math.cos(a)*1.62,z=-C+Math.sin(a)*1.62;
    S.box(null,x,4.72,z,.18,.18,.18,0x746f5d);
  }
  });
  // counter: outer wall + top ring + inner wall
  const cr = 3.9, ci = 3.35, chh = 0.95, cn = 12;

  for (let i = 0; i < cn; i++) {
    const a0 = i / cn * TAU + Math.PI / 12, a1 = (i + 1) / cn * TAU + Math.PI / 12;
    const q = [[C + Math.cos(a0) * cr, chh, -(C + Math.sin(a0) * cr)], [C + Math.cos(a1) * cr, chh, -(C + Math.sin(a1) * cr)],
      [C + Math.cos(a1) * ci, chh, -(C + Math.sin(a1) * ci)], [C + Math.cos(a0) * ci, chh, -(C + Math.sin(a0) * ci)]];
    BG.quad([q[0][0],0,q[0][2]],[q[1][0],0,q[1][2]],q[1],q[0],0xffffff,true,[[0,.5],[1,.5],[1,0],[0,0]]);
    S.quad(q[0], q[1], q[2], q[3], 0xc4b58c, true);
    S.quad([q[3][0], 0, q[3][2]], [q[2][0], 0, q[2][2]], q[2], q[3], 0x6f6448, true);
  }

  /* ---------- Varrock city walls ---------- */
  function wallSeg(x0, y0, x1, y1, thick) { // axis-aligned wall of tiles
    const horiz = Math.abs(x1 - x0) > Math.abs(y1 - y0);
    const len = horiz ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
    for (let s = 0; s < len; s++) {
      const x = horiz ? Math.min(x0, x1) + s : x0, y = horiz ? y0 : Math.min(y0, y1) + s;
      const hx = horiz ? 1 : thick, hy = horiz ? thick : 1;
      const gc = groundH(x + hx / 2, y + hy / 2);
      const base = groundH(x + hx / 2, y + hy / 2) - 0.6, hh = 3.9 + 0.6;
      const cxx = x + hx / 2, cyy = y + hy / 2;
      ST.box(null, cxx, base + hh / 2 + 0.0, -cyy, hx / 2, hh / 2, hy / 2, 0xffffff, 0.5);
      // crenellations on alternate tiles
      if ((s & 1) === 0) {
        ST.box(null, cxx, base + hh + 0.22, -cyy, horiz ? 0.5 : hx / 2, 0.22, horiz ? hy / 2 : 0.5, 0xffffff, 0.5);
      }
      // parapet walkway inner ledge
      for (let ax = 0; ax < hx; ax++) for (let ay = 0; ay < hy; ay++) {
        const bx = Math.floor(x) + ax, by = Math.floor(y) + ay;
        if (inMap(bx, by)) WORLD.block[by * N + bx] = 1;
      }
    }
  }
  wallSeg(10, 78, 90, 78, 1);    // north
  wallSeg(10, 26, 10, 79, 1);    // west
  wallSeg(85, 20, 85, 79, 1);    // east
  // corner towers
  for (const [tx, ty] of [[9, 77], [88, 77], [9, 24], [84, 18]]) {
    const gc = groundH(tx + 1, ty + 1);
    ST.box(null, tx + 1.5, gc + 2.6, -(ty + 1.5), 1.5, 3.2, 1.5, 0xffffff, 0.5);
    for (let ax = 0; ax < 3; ax++) for (let ay = 0; ay < 3; ay++) { const bx = tx + ax, by = ty + ay; if (inMap(bx, by)) WORLD.block[by * N + bx] = 1; }
  }

  /* ---------- Varrock buildings (beige walls, tiled roofs) ---------- */
  function building(x0, y0, w, d, h, roof) {
    const g = groundH(x0 + w / 2, y0 + d / 2);
    BG.box(null, x0 + w / 2, g + h / 2 - 0.4, -(y0 + d / 2), w / 2, h / 2 + 0.4, d / 2, 0xffffff, 0.35);
    // timber frame accents
    for (let i = 1; i < 4; i++) { const px = x0 + w * i / 4; WD.box(null, px, g + h / 2, -(y0 - 0.02), 0.09, h / 2, 0.05, 0xffffff, 1); WD.box(null, px, g + h / 2, -(y0 + d + 0.02), 0.09, h / 2, 0.05, 0xffffff, 1); }
    S.box(null, x0 + w / 2, g + h + 0.05, -(y0 + d / 2), w / 2 + 0.5, 0.1, d / 2 + 0.5, roof);
    // pitched roof
    const rh = 1.4, cy = -(y0 + d / 2);
    S.quad([x0 - 0.5, g + h + 0.1, -(y0 - 0.5)], [x0 + w + 0.5, g + h + 0.1, -(y0 - 0.5)], [x0 + w + 0.5, g + h + 0.1 + rh, cy], [x0 - 0.5, g + h + 0.1 + rh, cy], shadeCol(roof, 1.05), true);
    S.quad([x0 + w + 0.5, g + h + 0.1, -(y0 + d + 0.5)], [x0 - 0.5, g + h + 0.1, -(y0 + d + 0.5)], [x0 - 0.5, g + h + 0.1 + rh, cy], [x0 + w + 0.5, g + h + 0.1 + rh, cy], shadeCol(roof, 0.8), true);
    S.tri([x0 - 0.5, g + h + 0.1, -(y0 - 0.5)], [x0 - 0.5, g + h + 0.1 + rh, cy], [x0 - 0.5, g + h + 0.1, -(y0 + d + 0.5)], 0xa89870, true);
    S.tri([x0 + w + 0.5, g + h + 0.1, -(y0 + d + 0.5)], [x0 + w + 0.5, g + h + 0.1 + rh, cy], [x0 + w + 0.5, g + h + 0.1, -(y0 - 0.5)], 0xa89870, true);
    // door + windows on the south face
    WD.box(null, x0 + w / 2, g + 0.9, -(y0 - 0.03), 0.45, 0.9, 0.04, 0xffffff, 1);
    for (const wx of [0.22, 0.78]) S.box(null, x0 + w * wx, g + h * 0.62, -(y0 - 0.03), 0.3, 0.3, 0.03, 0x7a98b0);
    for(const f of [0.22,0.78]){
      const wx=x0+w*f,wz=-(y0-.08),wy=g+h*.62;
      for(const sx of [-.35,.35])WD.box(null,wx+sx,wy,wz,.035,.35,.035,0xbdac8a,1);
      for(const sy of [-.35,.35])S.box(null,wx,wy+sy,wz,.39,.035,.06,0xb3aa8f);
      WD.box(null,wx,wy,wz+.02,.016,.30,.018,0xb7a386,1);
      WD.box(null,wx,wy,wz+.02,.30,.016,.018,0xb7a386,1);
    }
    S.box(null,x0+w/2,g+.04,-(y0-.1),.55,.04,.20,0x979080);
    S.box(null,x0+w/2+.28,g+.9,-(y0-.085),.035,.035,.018,0xae9252);
    for (let ax = 0; ax < w; ax++) for (let ay = 0; ay < d; ay++) { const bx = x0 + ax, by = y0 + ay; if (inMap(bx, by)) WORLD.block[by * N + bx] = 1; }
  }
  building(68, 62, 9, 8, 4.2, 0x8a3a24);
  building(72, 46, 7, 7, 3.6, 0x6a3a2a);
  building(16, 56, 7, 9, 4.0, 0x7a4a2c);
  building(18, 36, 8, 7, 3.6, 0x8a3a24);

  /* ---------- trees ---------- */
  const tr = mulberry32(31337);
  const treeAt = (x, y, sc) => {
    const g = groundH(x, y); const tc = shadeCol(COL.trunk, 0.9 + tr() * 0.2);
    S.prism(null, x, -y, g - 0.2, g + 2.0 * sc, 0.2 * sc, 0.2 * sc, 6, tc, 0);
    const lc = shadeCol(COL.leaf, 0.85 + tr() * 0.3);
    S.blob(null, x, g + 3.1 * sc, -y, 1.35 * sc, 1.25 * sc, 1.35 * sc, 9, 5, lc, 0.35, tr);
    S.blob(null, x + 0.5 * sc, g + 2.5 * sc, -y + 0.3 * sc, 0.9 * sc, 0.8 * sc, 0.9 * sc, 8, 4, shadeCol(lc, 0.93), 0.35, tr);
    if (inMap(Math.floor(x), Math.floor(y))) WORLD.block[Math.floor(y) * N + Math.floor(x)] = 1;
    WORLD.trees.push({ x, y });
  };
  let placed = 0, guard = 0;
  while (placed < 46 && guard++ < 4000) {
    const x = 14 + tr() * 68, y = 6 + tr() * 70; const d = poly12(x - C, y - C);
    if (d < 23.5) continue;
    if (WORLD.trees.some(t => Math.hypot(t.x - x, t.y - y) < 4.2)) continue;
    if (WORLD.block[Math.floor(y) * N + Math.floor(x)]) continue;
    treeAt(Math.floor(x) + 0.5, Math.floor(y) + 0.5, 0.85 + tr() * 0.4); placed++;
  }
  // bench circle around a big tree (north-west, like the real GE)
  { const bx = 33, by = 72; treeAt(bx + 0.5, by + 0.5, 1.5);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4; const px = bx + 0.5 + Math.cos(a) * 2.7, py = by + 0.5 + Math.sin(a) * 2.7; const g = groundH(px, py);
      const m = edgeXf(px, py, a + Math.PI / 2);
      WD.box(m, 0, g + 0.5, 0, 0.9, 0.06, 0.28, 0xffffff, 1);
      WD.box(m, -0.75, g + 0.25, 0, 0.06, 0.25, 0.22, 0xffffff, 1); WD.box(m, 0.75, g + 0.25, 0, 0.06, 0.25, 0.22, 0xffffff, 1);
      WD.box(m, 0, g + 0.85, 0.24, 0.9, 0.3, 0.05, 0xffffff, 1);
    }
  }

  /* ---------- collision ---------- */
  const setB = (x, y) => { if (inMap(x, y)) WORLD.block[y * N + x] = 1; };
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const dx = tx + 0.5 - C, dy = ty + 0.5 - C;
    if (Math.hypot(dx, dy) < 4.15) setB(tx, ty);               // tower + clerk counter
    // ring wall
    for (let k = 0; k < 8; k++) {
      const phi = k * Math.PI / 4, nx = Math.cos(phi), ny = Math.sin(phi);
      const dn = dx * nx + dy * ny, tt = -dx * ny + dy * nx;
      if (Math.abs(dn - RING_A) < 0.62 && Math.abs(tt) <= hl + 0.6 && Math.abs(tt) > aw + 0.05) setB(tx, ty);
    }
  }
  for (const [vx, vy] of ringVerts) for (let ty = Math.floor(vy - 0.9); ty <= Math.floor(vy + 0.9); ty++) for (let tx = Math.floor(vx - 0.9); tx <= Math.floor(vx + 0.9); tx++) {
    if (Math.hypot(tx + 0.5 - vx, ty + 0.5 - vy) < 0.95) setB(tx, ty);
  }
  for (let i = 0; i < N; i++) for (let b = 0; b < 3; b++) { setB(i, b); setB(i, N - 1 - b); setB(b, i); setB(N - 1 - b, i); }

  /* ---------- bank booths ---------- */
  const boothPos = [[43, 43], [53, 43], [43, 53], [53, 53]].map(p => [p[0], p[1]]);
  // shift so they are not inside the counter (radius 4.15)
  const bpos = [[C - 6, C - 5], [C + 5, C - 5], [C - 6, C + 5], [C + 5, C + 5]];
  for (const [bx, by] of bpos) {
    const g = tileH(bx, by);
    // One-tile wooden booth: open transaction aperture, iron grille and framed sign.
    // Opaque blue slabs were not transparent glass and hid the teller/players.
    const x=bx+.5,z=-(by+.5),frame=0x59402a,brass=0xa89055;
    WD.box(null,x,g+.44,z,.46,.44,.40,0xffffff,1);
    S.box(null,x,g+.08,z,.485,.08,.42,0x494033);
    S.box(null,x,g+.93,z,.49,.055,.44,0x506345);
    for(const sx of [-.44,.44])for(const sz of [-.36,.36]){
      WD.box(null,x+sx,g+1.29,z+sz,.045,.41,.045,0xc0a786,1);
      S.box(null,x+sx,g+.99,z+sz,.052,.06,.052,brass);
    }
    WD.box(null,x,g+1.74,z,.50,.07,.44,0xbbaa87,1);
    for(const side of [-1,1]){
      WD.box(null,x,g+1.45,z+side*.37,.43,.025,.028,0xa7977e,1);
      for(let i=-3;i<=3;i++)S.box(null,x+i*.115,g+1.565,z+side*.369,.010,.11,.013,0x555d53);
      WD.box(null,x,g+1.78,z+side*.46,.32,.13,.025,0x766246,0);
      S.box(null,x,g+1.78,z+side*.488,.18,.072,.008,brass);
      S.box(null,x,g+1.78,z+side*.498,.021,.049,.007,0x43301c);
    }
    // Recessed panels with handles make the lower case readable from every side.
    for(const side of [-1,1])for(const sx of [-.22,.22]){
      S.box(null,x+sx,g+.47,z+side*.409,.18,.28,.012,frame);
      WD.box(null,x+sx,g+.47,z+side*.425,.155,.255,.007,0xd0b497,1);
      S.box(null,x+sx+.06,g+.48,z+side*.438,.025,.015,.008,brass);
    }
    // Coin tray and closed ledger remain entirely inside the counter footprint.
    S.box(null,x-.22,g+1.00,z,.10,.016,.085,0x9a804e);
    S.box(null,x+.22,g+1.008,z-.12,.10,.024,.13,0x6b3228);
    S.box(null,x+.22,g+1.012,z-.121,.09,.009,.12,0xc7b783);
    setB(bx,by);WORLD.objs.push({kind:'bank',name:'Bank booth',x:bx,y:by,h:1.94});
  }
  // a treasure chest and the Grand Exchange booths near the north arch
  { const cx=C,cy=C+6,g=tileH(cx,cy),x=cx+.5,z=-(cy+.5);
    WD.box(null,x,g+.26,z,.43,.26,.30,0xffffff,1);
    S.box(null,x,g+.04,z,.45,.04,.32,0x44382a);
    // Faceted barrel lid with closed end caps, metal straps, front latch and rear hinges.
    const seg=8,base=g+.50,r=.30;
    for(let i=0;i<seg;i++){
      const a=i/seg*Math.PI,b=(i+1)/seg*Math.PI;
      const az=z+Math.cos(a)*r,bz=z+Math.cos(b)*r,ay=base+Math.sin(a)*r*.60,by=base+Math.sin(b)*r*.60;
      WD.quad([x-.43,ay,az],[x+.43,ay,az],[x+.43,by,bz],[x-.43,by,bz],0xc7b095,true);
      for(const sx of [-.29,.29])S.quad([x+sx-.025,ay+.008,az],[x+sx+.025,ay+.008,az],[x+sx+.025,by+.008,bz],[x+sx-.025,by+.008,bz],0x827a61,true);
      for(const sx of [-.432,.432])S.tri([x+sx,base,z],[x+sx,ay,az],[x+sx,by,bz],0x775b34,true);
    }
    for(const sx of [-.29,.29])for(const side of [-1,1])S.box(null,x+sx,g+.27,z+side*.307,.027,.25,.01,0x827a61);
    S.box(null,x,g+.45,z+.32,.075,.09,.018,0xae9150);S.box(null,x,g+.45,z+.343,.022,.027,.008,0x382b14);
    for(const sx of [-.25,.25])S.box(null,x+sx,g+.51,z-.31,.058,.025,.028,0x625c4c);
    setB(cx,cy);WORLD.objs.push({kind:'chest',name:'Chest',x:cx,y:cy,h:.74});
  }

  /* ---------- minimap colours ---------- */
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const i = ty * N + tx; const d = poly12(tx + 0.5 - C, ty + 0.5 - C);
    let c;
    if (WORLD.layer[i] >= 0) c = 0x8d8d84; else { const n = vn(tx * 0.3, ty * 0.3); c = mixCol(0x5d6a2d, 0x788636, n); const dirt = clamp((25.5 + 3.5 * n - d) / 3.5, 0, 1); c = mixCol(c, 0x8a7d5c, dirt); }
    if (WORLD.block[i]) c = 0x4a4a42;
    WORLD.mm[i] = c;
  }
  for (const t of WORLD.trees) WORLD.mm[Math.floor(t.y) * N + Math.floor(t.x)] = 0x2f4d17;
  for (const m of meshes) if (m.count) WORLD.statics.push(R.upload(m));
  WORLD.ready = true;
}
