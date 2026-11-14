'use strict';
/* ==========================================================================
   core.js - constants, math, noise, block table
   ========================================================================== */
const WX = 192, WZ = 192, WY = 48, CS = 16, NCX = WX / CS, NCZ = WZ / CS, SEA = 18;
const CAMPX = 96, CAMPZ = 96, CAMPY = 22;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, z, s) { let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(s, 1442695041) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function hash3(x, y, z) { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function vnoise2(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(xi, zi, s), hash2(xi + 1, zi, s), u), lerp(hash2(xi, zi + 1, s), hash2(xi + 1, zi + 1, s), u), v);
}
function fbm2(x, z, s) { return vnoise2(x, z, s) * .5 + vnoise2(x * 2.03, z * 2.03, s + 7) * .25 + vnoise2(x * 4.1, z * 4.1, s + 13) * .15 + vnoise2(x * 8.2, z * 8.2, s + 29) * .1; }
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

/* ---- 4x4 matrices, column-major ---- */
const M4 = {
  ident() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
  persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; },
  ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; },
  lookAt(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  },
  inv(m) {
    const o = new Array(16), a = m;
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
    const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; d = 1 / d;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
    return o;
  },
  tp(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]]; }
};
/* affine helpers for model building: each returns m * op */
function mT(m, x, y, z) { const o = m.slice(); o[12] = m[0] * x + m[4] * y + m[8] * z + m[12]; o[13] = m[1] * x + m[5] * y + m[9] * z + m[13]; o[14] = m[2] * x + m[6] * y + m[10] * z + m[14]; return o; }
function mRY(m, a) { const c = Math.cos(a), s = Math.sin(a), o = m.slice(); for (let i = 0; i < 3; i++) { o[i] = m[i] * c - m[8 + i] * s; o[8 + i] = m[i] * s + m[8 + i] * c; } return o; }
function mRX(m, a) { const c = Math.cos(a), s = Math.sin(a), o = m.slice(); for (let i = 0; i < 3; i++) { o[4 + i] = m[4 + i] * c + m[8 + i] * s; o[8 + i] = -m[4 + i] * s + m[8 + i] * c; } return o; }
function mRZ(m, a) { const c = Math.cos(a), s = Math.sin(a), o = m.slice(); for (let i = 0; i < 3; i++) { o[i] = m[i] * c + m[4 + i] * s; o[4 + i] = -m[i] * s + m[4 + i] * c; } return o; }
function mAt(x, y, z, yaw) { return mRY(mT(M4.ident(), x, y, z), yaw); }

/* ---- blocks ---- */
const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, LOG: 5, LEAVES: 6, PLANK: 7, BRICK: 8, GLASS: 9, COAL: 10, COPPER: 11, IRON: 12, GOLD: 13, CRYSTAL: 14, BEDROCK: 15, WATER: 16, LAVA: 17, LAMP: 18, DEEP: 19, ROOFR: 20, ROOFB: 21, COBBLE: 22, CHEST: 23, GRAVEL: 24, SNOW: 25, PATH: 26, LEAVES2: 27 };
const NB = 28;
const BL = [], OPQ = new Uint8Array(NB), SOLID = new Uint8Array(NB);
const rgbOf = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
function defB(id, name, col, hard, o) {
  const b = Object.assign({ id, name, col, hard, soft: 0, xp: 1, val: 0, drop: id, ore: 0, emis: 0, fall: 0, opaque: 1, solid: 1 }, o || {});
  b.c = rgbOf(b.col); b.ct = rgbOf(b.top === undefined ? b.col : b.top); BL[id] = b; OPQ[id] = b.opaque; SOLID[id] = b.solid;
}
defB(B.AIR, 'Air', 0, 0, { opaque: 0, solid: 0, drop: 0 });
defB(B.GRASS, 'Grass', 0x5f9a40, .35, { top: 0x7cc04c, soft: 1, drop: B.DIRT });
defB(B.DIRT, 'Dirt', 0x8a6846, .35, { soft: 1 });
defB(B.STONE, 'Stone', 0x8f9199, .8, {});
defB(B.SAND, 'Sand', 0xe2d08c, .3, { soft: 1, fall: 1 });
defB(B.LOG, 'Wood', 0x7a4f2c, .6, { top: 0xb58d58, xp: 2 });
defB(B.LEAVES, 'Leaves', 0x3f8f4a, .15, { soft: 1, drop: 0 });
defB(B.PLANK, 'Planks', 0xb9824d, .45, {});
defB(B.BRICK, 'Brick', 0x9c4b3d, .9, {});
defB(B.GLASS, 'Glass', 0xbfe6f2, .2, { opaque: 0 });
defB(B.COAL, 'Coal', 0x26262e, 1.0, { ore: 1, xp: 3, val: 3 });
defB(B.COPPER, 'Copper', 0xe07a38, 1.2, { ore: 1, xp: 5, val: 6 });
defB(B.IRON, 'Iron', 0xe6c3a6, 1.5, { ore: 1, xp: 8, val: 12 });
defB(B.GOLD, 'Gold', 0xffcf33, 1.8, { ore: 1, xp: 12, val: 25 });
defB(B.CRYSTAL, 'Crystal', 0x6fe6ff, 2.2, { ore: 1, emis: 1, xp: 20, val: 60 });
defB(B.BEDROCK, 'Bedrock', 0x2b2d36, 1e9, { drop: 0 });
defB(B.WATER, 'Water', 0x4f93dd, 1e9, { opaque: 0, solid: 0, drop: 0 });
defB(B.LAVA, 'Lava', 0xff7a1a, 1e9, { emis: 1, solid: 0, drop: 0 });
defB(B.LAMP, 'Lamp', 0xffdf8a, .25, { emis: 1 });
defB(B.DEEP, 'Deepstone', 0x555a6b, 1.3, { xp: 2 });
defB(B.ROOFR, 'Red Roof', 0xc23a34, .45, {});
defB(B.ROOFB, 'Blue Roof', 0x2f6fc4, .45, {});
defB(B.COBBLE, 'Cobble', 0x6f717b, .8, {});
defB(B.CHEST, 'Chest', 0xc9912e, .6, { top: 0xe8b84a, xp: 15, drop: 0 });
defB(B.GRAVEL, 'Gravel', 0x9a948c, .35, { soft: 1, fall: 1 });
defB(B.SNOW, 'Snow', 0xf2f6fa, .2, { soft: 1 });
defB(B.PATH, 'Paving', 0xb3a590, .5, {});
defB(B.LEAVES2, 'Amber Leaves', 0xd9813a, .15, { soft: 1, drop: 0 });
const ORES = [B.COAL, B.COPPER, B.IRON, B.GOLD, B.CRYSTAL];
