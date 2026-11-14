'use strict';
/* ==========================================================================
   world.js - voxel storage, generation, meshing, raycast, sand/water sim, save
   ========================================================================== */
const vox = new Uint8Array(WX * WZ * WY);
const colTop = new Uint8Array(WX * WZ);
const VI = (x, y, z) => (x * WZ + z) * WY + y;
const inW = (x, y, z) => x >= 0 && z >= 0 && x < WX && z < WZ && y >= 0 && y < WY;
function getB(x, y, z) { if (y < 0) return B.BEDROCK; if (x < 0 || z < 0 || x >= WX || z >= WZ || y >= WY) return 0; return vox[(x * WZ + z) * WY + y]; }
function solidAt(x, y, z) { if (y < 0) return 1; if (x < 0 || z < 0 || x >= WX || z >= WZ) return 1; if (y >= WY) return 0; return SOLID[vox[(x * WZ + z) * WY + y]]; }
function surfaceY(x, z) { x = clamp(x | 0, 0, WX - 1); z = clamp(z | 0, 0, WZ - 1); let y = colTop[x * WZ + z]; const b = (x * WZ + z) * WY; while (y > 0 && !SOLID[vox[b + y]]) y--; return y; }

const World = { seed: 1, dirty: false, edits: 0 };
const chunks = [];
for (let cx = 0; cx < NCX; cx++) for (let cz = 0; cz < NCZ; cz++) chunks.push({ cx, cz, dirty: true, o: null, t: null });
const chunkAt = (cx, cz) => chunks[cx * NCZ + cz];
function markDirty(x, z) {
  const a = clamp((x - 1) >> 4, 0, NCX - 1), b = clamp((x + 1) >> 4, 0, NCX - 1), c = clamp((z - 1) >> 4, 0, NCZ - 1), d = clamp((z + 1) >> 4, 0, NCZ - 1);
  for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) chunks[i * NCZ + j].dirty = true;
}
function markDirtyRect(x0, z0, x1, z1) {
  const a = clamp(x0 >> 4, 0, NCX - 1), b = clamp(x1 >> 4, 0, NCX - 1), c = clamp(z0 >> 4, 0, NCZ - 1), d = clamp(z1 >> 4, 0, NCZ - 1);
  for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) chunks[i * NCZ + j].dirty = true;
}

/* ---- sim queues ---- */
const fallQ = [], waterQ = [];
let onMapCol = null;   // hook set by ui for the minimap
function setB(x, y, z, id) {
  if (!inW(x, y, z)) return;
  const i = (x * WZ + z) * WY + y, old = vox[i]; if (old === id) return;
  vox[i] = id; const ci = x * WZ + z;
  if (id) { if (y > colTop[ci]) colTop[ci] = y; } else if (y === colTop[ci]) { let t = y; const b = ci * WY; while (t > 0 && !vox[b + t]) t--; colTop[ci] = t; }
  markDirty(x, z); World.dirty = true;
  if (onMapCol) onMapCol(x, z);
  if (!id) {
    fallQ.push(x, y + 1, z);
    if (y <= SEA && (getB(x + 1, y, z) === B.WATER || getB(x - 1, y, z) === B.WATER || getB(x, y, z + 1) === B.WATER || getB(x, y, z - 1) === B.WATER || getB(x, y + 1, z) === B.WATER)) waterQ.push(x, y, z);
  } else if (BL[id].fall) fallQ.push(x, y, z);
}
let fallH = 0, waterH = 0;
function simTick() {
  let n = Math.min((fallQ.length - fallH) / 3, 300);
  while (n-- > 0) {
    const x = fallQ[fallH++], y = fallQ[fallH++], z = fallQ[fallH++]; const b = getB(x, y, z);
    if (!b || !BL[b].fall || y <= 0) continue; const u = getB(x, y - 1, z);
    if (u === 0 || u === B.WATER || u === B.LAVA) { setB(x, y, z, 0); setB(x, y - 1, z, b); fallQ.push(x, y - 1, z); }
  }
  if (fallH >= fallQ.length) { fallQ.length = 0; fallH = 0; } else if (fallH > 6000) { fallQ.splice(0, fallH); fallH = 0; }
  n = Math.min((waterQ.length - waterH) / 3, 60);
  while (n-- > 0) {
    const x = waterQ[waterH++], y = waterQ[waterH++], z = waterQ[waterH++];
    if (y > SEA || y < 1 || !inW(x, y, z) || getB(x, y, z) !== 0) continue;
    if (!(getB(x + 1, y, z) === B.WATER || getB(x - 1, y, z) === B.WATER || getB(x, y, z + 1) === B.WATER || getB(x, y, z - 1) === B.WATER || getB(x, y + 1, z) === B.WATER)) continue;
    setB(x, y, z, B.WATER); waterQ.push(x + 1, y, z, x - 1, y, z, x, y, z + 1, x, y, z - 1, x, y - 1, z);
  }
  if (waterH >= waterQ.length) { waterQ.length = 0; waterH = 0; } else if (waterH > 6000) { waterQ.splice(0, waterH); waterH = 0; }
}

/* ---- generation ---- */
function genWorld(seed) {
  World.seed = seed; vox.fill(0); const R = mulberry32(seed);
  const hmap = new Uint8Array(WX * WZ);
  const put = (x, y, z, id) => { if (inW(x, y, z)) vox[(x * WZ + z) * WY + y] = id; };
  const get = (x, y, z) => inW(x, y, z) ? vox[(x * WZ + z) * WY + y] : 0;
  for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) {
    const dx = (x - CAMPX) / (WX / 2 - 4), dz = (z - CAMPZ) / (WZ / 2 - 4), r = Math.hypot(dx, dz);
    const n = fbm2(x / 52, z / 52, seed), n2 = fbm2(x / 21, z / 21, seed + 50), m = fbm2(x / 70, z / 70, seed + 99);
    const fall = smooth(1.0, 0.6, r + (n2 - 0.5) * 0.3);
    let h = SEA - 6 + fall * (7.5 + n * 9 + Math.pow(smooth(.48, .8, m), 1.4) * 13 + n2 * 3);
    const dc = Math.hypot(x - CAMPX, z - CAMPZ); h = lerp(h, CAMPY, smooth(30, 15, dc));
    h = clamp(Math.round(h), 4, 39); if (dc < 15) h = CAMPY;
    hmap[x * WZ + z] = h; const b = (x * WZ + z) * WY, deepY = 8 + ((hash2(x, z, seed + 3) * 3) | 0);
    for (let y = 0; y <= h; y++) {
      let id;
      if (y === 0) id = B.BEDROCK; else if (y < h - 3) id = y < deepY ? B.DEEP : B.STONE;
      else if (h <= SEA + 1) id = B.SAND; else if (h >= 35) id = y === h ? B.SNOW : B.STONE; else id = y === h ? B.GRASS : B.DIRT;
      vox[b + y] = id;
    }
    for (let y = h + 1; y <= SEA; y++) vox[b + y] = B.WATER;
  }
  const isRock = id => id === B.STONE || id === B.DEEP;
  const blob = (cx, cy, cz, rad, id, test) => {
    const r = Math.ceil(rad);
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
      const d = Math.hypot(x - cx, y - cy, z - cz); if (d > rad - hash3(x, y, z) * .8) continue;
      if (y > 0 && test(get(x, y, z), x, y, z)) put(x, y, z, id);
    }
  };
  const veins = (n, id, y0, y1, r0, r1) => { for (let i = 0; i < n; i++) blob((R() * WX) | 0, (y0 + R() * (y1 - y0)) | 0, (R() * WZ) | 0, r0 + R() * (r1 - r0), id, isRock); };
  veins(150, B.GRAVEL, 8, 30, 1.8, 3); veins(120, B.DIRT, 10, 32, 1.8, 3);
  veins(560, B.COAL, 5, 36, 1.3, 2.4); veins(400, B.COPPER, 4, 28, 1.2, 2.2); veins(300, B.IRON, 3, 20, 1.2, 2.1);
  veins(190, B.GOLD, 2, 13, 1.1, 1.9); veins(110, B.CRYSTAL, 1, 8, 1.0, 1.8);
  // cave worms
  for (let i = 0; i < 52; i++) {
    let x = CAMPX + (R() - .5) * 150, z = CAMPZ + (R() - .5) * 150, y = 3 + R() * 16, a = R() * 6.28, p = (R() - .5) * .6; const len = 50 + R() * 110, rad0 = 1.5 + R() * 1.3;
    for (let s = 0; s < len; s++) {
      a += (R() - .5) * .7; p = clamp(p + (R() - .5) * .3, -.55, .55); x += Math.cos(a) * 1.2; z += Math.sin(a) * 1.2; y = clamp(y + Math.sin(p) * 1.1, 2, 30);
      const xi = x | 0, zi = z | 0; if (xi < 3 || zi < 3 || xi > WX - 4 || zi > WZ - 4) break;
      const top = hmap[xi * WZ + zi] - 4; if (y > top) y = top; if (y < 2) continue;
      blob(xi, y | 0, zi, rad0 + Math.sin(s * .21) * .6, B.AIR, (id, bx, by, bz) => id !== B.BEDROCK && id !== B.WATER && id !== B.SAND && by < hmap[clamp(bx, 0, WX - 1) * WZ + clamp(bz, 0, WZ - 1)] - 3);
    }
  }
  for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) for (let y = 1; y <= 2; y++) if (!vox[VI(x, y, z)] && y < hmap[x * WZ + z]) vox[VI(x, y, z)] = B.LAVA;
  // buried chests
  for (let i = 0; i < 44; i++) { const x = 6 + (R() * (WX - 12)) | 0, z = 6 + (R() * (WZ - 12)) | 0, h = hmap[x * WZ + z]; if (h < SEA + 1) continue; const y = 3 + ((R() * (h - 7)) | 0); if (isRock(get(x, y, z)) || get(x, y, z) === B.DIRT) put(x, y, z, B.CHEST); }
  // boulders
  for (let i = 0; i < 46; i++) { const x = (R() * WX) | 0, z = (R() * WZ) | 0, h = hmap[x * WZ + z]; if (h <= SEA + 1 || Math.hypot(x - CAMPX, z - CAMPZ) < 24) continue; const ore = R() < .5 ? B.COAL : B.COPPER; blob(x, h + 1, z, 1.4 + R() * 1.3, B.STONE, id => id === 0 || id === B.GRASS); blob(x + 1, h + 1, z, .9, ore, id => id === B.STONE); }
  // trees
  for (let i = 0; i < 520; i++) {
    const x = 4 + (R() * (WX - 8)) | 0, z = 4 + (R() * (WZ - 8)) | 0, h = hmap[x * WZ + z];
    if (get(x, h, z) !== B.GRASS || get(x, h + 1, z) !== 0 || Math.hypot(x - CAMPX, z - CAMPZ) < 21) continue;
    let near = false; for (let a = -2; a <= 2 && !near; a++) for (let b = -2; b <= 2; b++) if (get(x + a, h + 2, z + b) === B.LOG) { near = true; break; }
    if (near) continue;
    if (R() < .36) {
      const th = 5 + ((R() * 2) | 0), lf = R() < .45 ? B.LEAVES2 : B.LEAVES; for (let y = 1; y <= th; y++) put(x, h + y, z, B.LOG);
      for (let l = 0; l < 5; l++) { const rr = l < 2 ? 2 : l < 4 ? 1 : 0, yy = h + th - 2 + l; for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) if ((Math.abs(a) + Math.abs(b) <= rr + (l % 2 ? 0 : 1)) && !get(x + a, yy, z + b)) put(x + a, yy, z + b, lf); }
    } else {
      const th = 3 + ((R() * 2) | 0); for (let y = 1; y <= th; y++) put(x, h + y, z, B.LOG);
      blob(x, h + th + 1, z, 2.5, B.LEAVES, id => id === 0);
    }
  }
  buildCamp(put);
  recalcTops();
  for (const c of chunks) c.dirty = true;
  World.dirty = true;
}
function recalcTops() { for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) { const b = (x * WZ + z) * WY; let t = WY - 1; while (t > 0 && !vox[b + t]) t--; colTop[x * WZ + z] = t; } }

function buildCamp(put) {
  const G = CAMPY, box = (x0, y0, z0, x1, y1, z1, id) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, id); };
  for (let x = CAMPX - 15; x <= CAMPX + 15; x++) for (let z = CAMPZ - 15; z <= CAMPZ + 15; z++) if (Math.hypot(x - CAMPX, z - CAMPZ) < 15) for (let y = G + 1; y < G + 14; y++) put(x, y, z, 0);
  box(90, G, 90, 102, G, 102, B.PATH);
  for (let i = 0; i < 26; i++) put(89 + ((hash2(i, 1, 5) * 15) | 0), G, 89 + ((hash2(i, 2, 5) * 15) | 0), B.PATH);
  // well
  box(95, G + 1, 95, 97, G + 1, 97, B.COBBLE); put(96, G + 1, 96, B.WATER); put(96, G, 96, B.WATER);
  box(95, G + 2, 95, 95, G + 3, 95, B.LOG); box(97, G + 2, 97, 97, G + 3, 97, B.LOG); box(95, G + 4, 95, 97, G + 4, 97, B.ROOFB); put(96, G + 5, 96, B.ROOFB);
  const house = (x0, z0, x1, z1, wall, roof, doorX, doorZ) => {
    box(x0, G, z0, x1, G, z1, B.PLANK); box(x0, G + 1, z0, x1, G + 3, z1, wall); box(x0 + 1, G + 1, z0 + 1, x1 - 1, G + 3, z1 - 1, 0);
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(cx, G + 1, cz, cx, G + 3, cz, B.LOG);
    put(doorX, G + 1, doorZ, 0); put(doorX, G + 2, doorZ, 0);
    const mx = (x0 + x1) >> 1, mz = (z0 + z1) >> 1; for (const [wx, wz] of [[mx, z0], [mx, z1], [x0, mz], [x1, mz]]) if (wx !== doorX || wz !== doorZ) put(wx, G + 2, wz, B.GLASS);
    for (let l = 0; l < 4; l++) { const a = x0 - 1 + l, b = x1 + 1 - l, c = z0 - 1 + l, d = z1 + 1 - l; if (a > b || c > d) break; box(a, G + 4 + l, c, b, G + 4 + l, d, roof); }
    put(x0 + 1, G + 1, z0 + 1, B.LAMP);
  };
  house(83, 92, 88, 98, B.PLANK, B.ROOFR, 88, 95);
  house(104, 93, 109, 98, B.BRICK, B.ROOFB, 104, 96);
  // tower
  const tx = 106, tz = 85;
  for (let x = tx - 3; x <= tx + 3; x++) for (let z = tz - 3; z <= tz + 3; z++) {
    const d = Math.hypot(x - tx, z - tz); if (d > 3.3) continue;
    for (let y = G + 1; y <= G + 10; y++) put(x, y, z, d > 2.2 || y === G + 10 ? (y % 4 === 2 && d > 2.2 ? B.COBBLE : B.STONE) : 0);
    if (d > 2.2 && ((x + z) & 1)) put(x, G + 11, z, B.STONE);
    for (let l = 0; l < 4; l++) if (d <= 3.3 - l) put(x, G + 12 + l, z, B.ROOFB);
  }
  put(tx, G + 1, tz + 3, 0); put(tx, G + 2, tz + 3, 0); put(tx, G + 6, tz + 3, B.GLASS); put(tx, G + 1, tz, B.LAMP);
  // lamp posts
  for (const [lx, lz] of [[89, 89], [103, 89], [89, 103], [103, 103]]) { box(lx, G + 1, lz, lx, G + 3, lz, B.LOG); put(lx, G + 4, lz, B.LAMP); }
  // merchant stall
  box(97, G + 1, 106, 101, G + 1, 106, B.PLANK); box(97, G + 2, 107, 97, G + 3, 107, B.LOG); box(101, G + 2, 107, 101, G + 3, 107, B.LOG);
  put(97, G + 1, 107, B.LOG); put(101, G + 1, 107, B.LOG);
  for (let x = 96; x <= 102; x++) for (let z = 106; z <= 108; z++) put(x, G + 4, z, (x & 1) ? B.ROOFB : B.SNOW);
  put(98, G + 2, 106, B.CHEST); put(100, G + 2, 106, B.LAMP);
  // north wall
  for (let x = 82; x <= 100; x++) { box(x, G + 1, 84, x, G + 2, 84, B.COBBLE); if (x & 1) put(x, G + 3, 84, B.COBBLE); }
  put(91, G + 1, 84, 0); put(91, G + 2, 84, 0); put(92, G + 1, 84, 0); put(92, G + 2, 84, 0);
}

/* ---- cutaway (so you can see yourself underground) ---- */
const cut = { on: false, x: 0, y: 0, z: 0, r2: 0 };
const hiddenAt = (x, y, z) => cut.on && y >= cut.y && ((x + .5 - cut.x) * (x + .5 - cut.x) + (z + .5 - cut.z) * (z + .5 - cut.z)) < cut.r2;

/* ---- meshing ---- */
class MBuf {
  constructor() { this.p = new Float32Array(60000); this.c = new Uint8Array(80000); this.i = new Uint32Array(30000); this.nv = 0; this.ni = 0; }
  reset() { this.nv = 0; this.ni = 0; }
  need() {
    if ((this.nv + 4) * 3 > this.p.length) { const p = new Float32Array(this.p.length * 2); p.set(this.p); this.p = p; const c = new Uint8Array(this.c.length * 2); c.set(this.c); this.c = c; }
    if (this.ni + 6 > this.i.length) { const i = new Uint32Array(this.i.length * 2); i.set(this.i); this.i = i; }
  }
}
const MO = new MBuf(), MT = new MBuf();
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], u: 1, v: 2 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], u: 1, v: 2 },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], u: 0, v: 2 },
  { n: [0, -1, 0], c: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]], u: 0, v: 2 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], u: 0, v: 1 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], u: 0, v: 1 }
];
const AOT = [0.52, 0.7, 0.86, 1.0];
function meshChunk(ch) {
  const x0 = ch.cx * CS, z0 = ch.cz * CS; MO.reset(); MT.reset();
  const cOn = cut.on, cY = cut.y, cX = cut.x, cZ = cut.z, cR = cut.r2;
  const hid = (x, y, z) => cOn && y >= cY && ((x + .5 - cX) * (x + .5 - cX) + (z + .5 - cZ) * (z + .5 - cZ)) < cR;
  const op = (x, y, z) => { if (y < 0) return 1; if (y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) return 0; if (cOn && hid(x, y, z)) return 0; return OPQ[vox[(x * WZ + z) * WY + y]]; };
  const q = [0, 0, 0], ao = [3, 3, 3, 3];
  for (let x = x0; x < x0 + CS; x++) for (let z = z0; z < z0 + CS; z++) {
    const base = (x * WZ + z) * WY, top = colTop[x * WZ + z];
    for (let y = 0; y <= top; y++) {
      const id = vox[base + y]; if (!id || (cOn && hid(x, y, z))) continue;
      const bl = BL[id], jit = 0.93 + 0.14 * hash3(x, y, z);
      for (let f = 0; f < 6; f++) {
        const F = FACES[f], nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2]; if (ny < 0) continue;
        const out = nx < 0 || nz < 0 || nx >= WX || nz >= WZ || ny >= WY;
        const nb = out ? 0 : vox[(nx * WZ + nz) * WY + ny], nh = !out && nb !== 0 && cOn && hid(nx, ny, nz);
        let slice = false;
        if (id === B.WATER) { if (out || nb !== 0) continue; }
        else if (nh) slice = OPQ[nb] === 1 && OPQ[id] === 1;
        else if (id === B.GLASS) { if (nb === B.GLASS || OPQ[nb]) continue; }
        else if (OPQ[nb]) continue;
        const tr = id === B.WATER || id === B.GLASS, M = tr ? MT : MO; M.need();
        const lowTop = id === B.WATER && getB(x, y + 1, z) !== B.WATER;
        let cr, cg, cb;
        if (slice) { cr = bl.c[0] * .22 + 22; cg = bl.c[1] * .22 + 21; cb = bl.c[2] * .22 + 30; }
        else { const c = f === 2 ? bl.ct : bl.c; cr = c[0] * jit; cg = c[1] * jit; cb = c[2] * jit; }
        const flag = f | (bl.ore && !slice ? 8 : 0) | (bl.emis && !slice ? 16 : 0) | (id === B.GLASS ? 32 : 0);
        const doAO = !tr && !slice && !bl.emis;
        for (let k = 0; k < 4; k++) {
          const c = F.c[k]; let a = 3;
          if (doAO) {
            const du = c[F.u] * 2 - 1, dv = c[F.v] * 2 - 1;
            q[0] = nx; q[1] = ny; q[2] = nz; q[F.u] += du; const s1 = op(q[0], q[1], q[2]);
            q[F.v] += dv; const cn = op(q[0], q[1], q[2]);
            q[F.u] -= du; const s2 = op(q[0], q[1], q[2]);
            a = (s1 && s2) ? 0 : 3 - (s1 + s2 + cn);
          }
          ao[k] = a; const m = AOT[a], pi = M.nv * 3, ci = M.nv * 4;
          M.p[pi] = x + c[0]; M.p[pi + 1] = y + c[1] - (lowTop && c[1] ? 0.14 : 0); M.p[pi + 2] = z + c[2];
          M.c[ci] = Math.min(255, cr * m); M.c[ci + 1] = Math.min(255, cg * m); M.c[ci + 2] = Math.min(255, cb * m); M.c[ci + 3] = flag; M.nv++;
        }
        const v = M.nv - 4, ii = M.ni;
        if (ao[0] + ao[2] < ao[1] + ao[3]) { M.i[ii] = v + 1; M.i[ii + 1] = v + 2; M.i[ii + 2] = v + 3; M.i[ii + 3] = v + 1; M.i[ii + 4] = v + 3; M.i[ii + 5] = v; }
        else { M.i[ii] = v; M.i[ii + 1] = v + 1; M.i[ii + 2] = v + 2; M.i[ii + 3] = v; M.i[ii + 4] = v + 2; M.i[ii + 5] = v + 3; }
        M.ni += 6;
      }
    }
  }
  ch.dirty = false;
}

/* ---- voxel raycast (Amanatides-Woo) ---- */
function raycast(ox, oy, oz, dx, dy, dz, maxD, useCut) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx ? Math.abs(1 / dx) : 1e30, tdy = dy ? Math.abs(1 / dy) : 1e30, tdz = dz ? Math.abs(1 / dz) : 1e30;
  let tx = dx ? ((dx > 0 ? x + 1 - ox : ox - x) * tdx) : 1e30, ty = dy ? ((dy > 0 ? y + 1 - oy : oy - y) * tdy) : 1e30, tz = dz ? ((dz > 0 ? z + 1 - oz : oz - z) * tdz) : 1e30;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 700; i++) {
    if (y >= 0 && y < WY && x >= 0 && z >= 0 && x < WX && z < WZ) {
      const b = vox[(x * WZ + z) * WY + y];
      if (b && b !== B.WATER && b !== B.LAVA && !(useCut && hiddenAt(x, y, z))) return { x, y, z, nx, ny, nz, id: b, t };
    } else if (y < 0) return null;
    if (tx < ty && tx < tz) { t = tx; tx += tdx; x += sx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { t = ty; ty += tdy; y += sy; nx = 0; ny = -sy; nz = 0; }
    else { t = tz; tz += tdz; z += sz; nx = 0; ny = 0; nz = -sz; }
    if (t > maxD) return null;
  }
  return null;
}

/* ---- save / load ---- */
function encodeWorld() {
  const out = []; let i = 0; const n = vox.length;
  while (i < n) { const v = vox[i]; let r = 1; while (i + r < n && r < 255 && vox[i + r] === v) r++; out.push(r, v); i += r; }
  let s = ''; for (let k = 0; k < out.length; k += 8190) s += String.fromCharCode.apply(null, out.slice(k, k + 8190));
  return btoa(s);
}
function decodeWorld(b64) {
  const s = atob(b64); let i = 0;
  for (let k = 0; k < s.length; k += 2) { const r = s.charCodeAt(k), v = s.charCodeAt(k + 1); vox.fill(v, i, i + r); i += r; }
  if (i !== vox.length) throw new Error('bad save');
  recalcTops(); for (const c of chunks) c.dirty = true;
}
