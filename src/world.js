/* world.js - the island of Hollowmere: zones, collision grid, prop placement, pathfinding, line of sight.
   Tile coords (x, y); the renderer maps them to 3D as X = x, Z = y. Tile centre is +0.5. North is -y. */
import { mulberry32 } from './data.js';

export const N = 96;
export const TOWN = { x0: 31, y0: 56, x1: 65, y1: 87 };          // safe zone rectangle
export const SPAWN = { x: 48, y: 72 };
export const WILDS = { x: 48, y: 25, r: 19 }, PLAZA_R = 13;      // PvP ruins
export const GRAVE = { x: 15, y: 63, r: 10 };                    // undead
export const FOREST = { x: 81, y: 66, r: 9 }, MINE = { x: 80, y: 38, r: 7 };
export const ROADS = [[48, 62, 48, 40], [43, 68, 24, 64], [54, 68, 73, 66], [56, 60, 76, 42]];

const grid = new Uint8Array(N * N);   // 0 free, 1 blocks movement, 2 blocks movement + sight
export const props = [];              // { m: model name, x, z, y, ry, s } - instanced by the renderer
export const lamps = [];              // { x, y(height), z } - glowing lanterns
export const npcSpots = { banker: { x: 48, y: 82, face: Math.PI }, smith: { x: 41, y: 66, face: Math.PI / 2 }, merchant: { x: 55, y: 66, face: -Math.PI / 2 } };

const noiseR = mulberry32(99), lat = new Float32Array(64 * 64).map(() => noiseR());
export function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), sm = t => t * t * (3 - 2 * t), fx = sm(x - xi), fy = sm(y - yi), g = (a, b) => lat[((b & 63) * 64) + (a & 63)];
  const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/* > 0 on land, growing inland; < 0 in the lake */
export function landDist(x, y) { const dx = (x - 48) / 45, dy = (y - 50) / 46; return 1 - Math.sqrt(dx * dx + dy * dy) - (noise(x * 0.09, y * 0.09) - 0.5) * 0.16; }
export function roadDist(x, y) {
  let best = 99;
  for (const [ax, ay, bx, by] of ROADS) { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t)); }
  return best;
}
export function zoneAt(x, y) {
  if (x >= TOWN.x0 && x <= TOWN.x1 && y >= TOWN.y0 && y <= TOWN.y1) return 'town';
  if (Math.hypot(x - GRAVE.x, y - GRAVE.y) <= GRAVE.r + 1) return 'grave';
  if (y < 50 && x < 70) return 'wilds';
  return 'fields';
}
export const ZONE_NAMES = { town: 'Hollowmere', wilds: 'The Ashen Wilds', grave: 'Barrow Yard', fields: 'The Greenway' };

export function inMap(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
export function blockAt(x, y) { return inMap(x, y) ? grid[y * N + x] : 2; }
export function passable(x, y) { return inMap(x, y) && grid[y * N + x] === 0; }
function setBlock(x, y, v) { x = Math.floor(x); y = Math.floor(y); if (inMap(x, y)) grid[y * N + x] = Math.max(grid[y * N + x], v); }
function rect(x0, y0, w, h, v = 2) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setBlock(x, y, v); }
function P(m, x, z, ry = 0, s = 0.5, y = 0) { props.push({ m, x, z, y, ry, s }); }
const free = (x, y) => blockAt(Math.floor(x), Math.floor(y)) === 0;

(function build() {
  const rnd = mulberry32(4117), R = (a, b) => a + rnd() * (b - a), pick = a => a[Math.floor(rnd() * a.length)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (landDist(x + 0.5, y + 0.5) < 0.035) grid[y * N + x] = 2;

  /* ---------------- Hollowmere (safe town) ---------------- */
  const B = 5.5; // building scale
  // north wall with a gate facing the wilds road
  for (const x of [30, 36, 42, 54, 60, 66]) P('wall_straight', x, 55, 0, 3);
  P('wall_straight_gate', 48, 55, 0, 3); rect(27, 54, 20, 2); rect(50, 54, 20, 2);
  // bank pavilion: back wall, pillars, counter, vault goods
  for (const x of [45, 47, 49, 51]) P(x === 47 || x === 49 ? 'wall' : 'wall_cracked', x, 83.5, 0, 0.5); rect(44, 83, 8, 1);
  for (const [x, z] of [[43.5, 83.5], [52.5, 83.5], [43.5, 78.5], [52.5, 78.5]]) { P('hw_pillar', x, z, 0, 0.85); setBlock(x, z, 2); }
  P('table_long_decorated_A', 48, 81.5, Math.PI / 2, 0.5); rect(46, 81, 4, 1, 1); rect(44, 82, 8, 1, 1);
  P('chest_gold', 45.2, 82.6, 0.3, 0.55); P('chest', 50.8, 82.6, -0.3, 0.55); P('coin_stack_medium', 46.4, 82.7, 1, 0.5); P('coin_stack_small', 49.7, 82.6, 2, 0.5); P('coin_stack_medium', 51.5, 81.6, 0, 0.5);
  P('banner_patternC_yellow', 46, 83.0, Math.PI, 0.6, 0.3); P('banner_patternC_yellow', 50, 83.0, Math.PI, 0.6, 0.3); P('sword_shield_gold', 48, 83.0, Math.PI, 0.6, 1.7);
  // blacksmith (west), market (east), well in the square
  P('building_blacksmith_blue', 36.5, 66, Math.PI / 2, B); rect(33, 63, 7, 7);
  for (let i = 0; i < 3; i++) { P('weaponrack', 40.6, 63.6 + i * 0.9 + (i > 0 ? 2.6 : 0), Math.PI / 2, 4); } setBlock(40, 63, 1); setBlock(40, 67, 1); setBlock(40, 68, 1);
  P('building_market_blue', 60, 66, -Math.PI / 2, B); rect(57, 61, 7, 10);
  P('barrel_large', 56.3, 62.5, 0, 0.5); P('crates_stacked', 56.4, 69.6, 0.4, 0.5); P('box_large', 56.3, 68.2, 0.2, 0.5); for (const y of [62, 68, 69]) setBlock(56, y, 1);
  P('building_well_blue', 48, 67.5, 0, 4.5); rect(47, 66, 3, 3, 1);
  // houses, tavern, church, keep
  P('building_tavern_blue', 37, 79, Math.PI / 2, B); rect(34, 75, 7, 8);
  P('building_home_A_blue', 59, 77, -Math.PI / 2, B); rect(57, 75, 5, 5); P('building_home_B_red', 60, 83.5, -Math.PI / 2, B); rect(57, 81, 6, 5);
  P('building_home_A_red', 36, 59.5, 0, B); rect(34, 57, 5, 5); P('building_church_blue', 60, 58.5, 0, B); rect(57, 56, 6, 5);
  P('building_castle_blue', 48, 91, Math.PI, 5.5); rect(42, 86, 13, 8);
  for (const [x, z] of [[42.5, 62.5], [53.5, 62.5], [42.5, 73.5], [53.5, 73.5], [45.5, 57.5], [50.5, 57.5], [44.5, 77.5], [51.5, 77.5]]) { P('hw_post_lantern', x, z, x < 48 ? Math.PI / 2 : -Math.PI / 2, 0.75); setBlock(x, z, 1); lamps.push({ x: x + (x < 48 ? 0.75 : -0.75), y: 1.75, z }); }
  P('target', 41.5, 71.5, Math.PI / 2, 4); setBlock(41, 71, 1); P('barrel', 40.5, 74.5, 0, 4); setBlock(40, 74, 1); P('wheelbarrow', 54.5, 75.5, 1, 4); setBlock(54, 75, 1);

  /* ---------------- The Ashen Wilds (PvP ruins) ---------------- */
  const W = WILDS, wx = W.x, wy = W.y;
  rect(wx - 1, wy - 1, 3, 3); // monument
  P('floor_foundation_allsides', wx + 0.5, wy + 0.5, 0, 1.3); P('hw_shrine_candles', wx + 0.5, wy + 0.5, 0, 1.5, 2.55);
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; P('column', wx + 0.5 + Math.cos(a) * 1.55, wy + 0.5 + Math.sin(a) * 1.55, 0, 0.8, 2.55); }
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, x = Math.floor(wx + 0.5 + Math.cos(a) * 6.4), y = Math.floor(wy + 0.5 + Math.sin(a) * 6.4); setBlock(x, y, 1); P('hw_lantern_standing', x + 0.5, y + 0.5, a, 1.5); lamps.push({ x: x + 0.5, y: 0.75, z: y + 0.5 }); }
  // ruined walls: [x, y, lengthTiles (even), alongX]
  for (const [x0, y0, len, ax] of [[wx - 11, wy - 4, 4, 0], [wx + 10, wy, 4, 0], [wx - 3, wy - 12, 6, 1], [wx - 2, wy + 11, 6, 1], [wx - 9, wy + 6, 4, 1], [wx + 6, wy - 8, 4, 1], [wx + 7, wy + 7, 4, 0], [wx - 8, wy - 10, 2, 0]]) {
    rect(x0, y0, ax ? len : 1, ax ? 1 : len);
    for (let i = 0; i < len; i += 2) { const m = pick(['wall', 'wall_broken', 'wall_cracked', 'wall_broken']); if (ax) P(m, x0 + i + 1, y0 + 0.5, 0, 0.5); else P(m, x0 + 0.5, y0 + i + 1, Math.PI / 2, 0.5); }
    if (rnd() < 0.7) { if (ax) P('rubble_half', x0 + len + 0.2, y0 + 0.5, 0, 0.3); else P('rubble_half', x0 + 0.5, y0 - 0.2, Math.PI / 2, 0.3); }
  }
  for (let k = 0; k < 14; k++) { // colonnade
    const a = (k + 0.5) / 14 * Math.PI * 2, x = Math.floor(wx + 0.5 + Math.cos(a) * 15), y = Math.floor(wy + 0.5 + Math.sin(a) * 15); if (!free(x, y)) continue;
    setBlock(x, y, 2); P(rnd() < 0.3 ? 'pillar' : 'hw_pillar', x + 0.5, y + 0.5, -a + Math.PI / 2, rnd() < 0.3 ? 0.6 : 0.9);
    if (k % 3 === 0) P(pick(['banner_patternA_red', 'banner_patternB_blue', 'banner_shield_green']), x + 0.5 - Math.cos(a) * 0.1, y + 0.5 - Math.sin(a) * 0.1, -a - Math.PI / 2, 0.55, 1.2);
  }
  for (let i = 0; i < 12; i++) { // cover
    const a = rnd() * 6.28, r = R(4, 17), x = Math.floor(wx + Math.cos(a) * r), y = Math.floor(wy + Math.sin(a) * r);
    let near = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!free(x + dx, y + dy)) near = true; if (near) continue;
    setBlock(x, y, 1); const m = pick(['barrel_large', 'box_large', 'crates_stacked', 'keg', 'trunk_large_A', 'barrel_small_stack']); P(m, x + 0.5, y + 0.5, rnd() * 6, 0.5);
  }
  P('hw_arch', 48, 44.5, 0, 0.9); setBlock(46, 44, 2); setBlock(49, 44, 2); P('building_destroyed', 62, 40, 1, 5); rect(59, 37, 6, 6); P('building_tower_A_blue', 33, 43, 0, 5); rect(31, 41, 5, 5);

  /* ---------------- Barrow Yard (undead) ---------------- */
  const G = GRAVE;
  P('hw_crypt', G.x - 5, G.y - 4, Math.PI / 2, 0.6); rect(G.x - 8, G.y - 6, 5, 4);
  for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28 + 0.2; if (Math.abs(a - 0.2) < 0.5) continue; const x = G.x + Math.cos(a) * G.r, y = G.y + Math.sin(a) * G.r; P('hw_fence', x, y, -a + Math.PI / 2, 0.55); setBlock(x, y, 1); setBlock(x - Math.sin(a), y + Math.cos(a), 1); setBlock(x + Math.sin(a), y - Math.cos(a), 1); }
  for (let i = 0; i < 16; i++) { const x = Math.floor(G.x + R(-7, 7)), y = Math.floor(G.y + R(-7, 7)); if (!free(x, y) || Math.hypot(x - G.x, y - G.y) > 8) continue; setBlock(x, y, 1); P(i % 5 === 4 ? 'hw_skull_candle' : 'hw_gravestone', x + 0.5, y + 0.5, R(-0.3, 0.3), 0.55); }
  for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, x = Math.floor(G.x + Math.cos(a) * R(5, 12)), y = Math.floor(G.y + Math.sin(a) * R(5, 12)); if (!free(x, y)) continue; setBlock(x, y, 2); P('hw_tree_dead_large', x + 0.5, y + 0.5, rnd() * 6, R(0.6, 0.9)); }

  /* ---------------- forest and mine (resource areas) ---------------- */
  P('building_lumbermill_blue', 88, 70, -Math.PI / 2, B); rect(85, 67, 7, 7); P('resource_lumber', 83.5, 71.5, 0.5, 4); setBlock(83, 71, 1);
  for (let i = 0; i < 46; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * FOREST.r, x = Math.floor(FOREST.x + Math.cos(a) * r), y = Math.floor(FOREST.y + Math.sin(a) * r); if (!free(x, y) || roadDist(x, y) < 2) continue; setBlock(x, y, 2); P(i % 9 === 8 ? 'tree_single_A_cut' : pick(['tree_single_A', 'tree_single_B', 'tree_single_B']), x + 0.5, y + 0.5, rnd() * 6, R(3.6, 5.4)); }
  P('mountain_B', 86, 33, 0.6, 8); rect(80, 27, 13, 12); P('building_mine_blue', 81, 40.5, Math.PI, 5); rect(77, 37, 8, 6);
  for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, x = Math.floor(MINE.x + Math.cos(a) * R(4, 8)), y = Math.floor(MINE.y + 3 + Math.sin(a) * R(3, 7)); if (!free(x, y) || roadDist(x, y) < 1.5) continue; setBlock(x, y, 1); P(i % 4 === 3 ? 'resource_stone' : pick(['rock_single_C', 'rock_single_E']), x + 0.5, y + 0.5, rnd() * 6, i % 4 === 3 ? 3.5 : R(4, 6)); }

  /* ---------------- scattered nature across the island ---------------- */
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(R(3, 93)), y = Math.floor(R(3, 93)); if (!free(x, y) || roadDist(x, y) < 2.2 || zoneAt(x, y) === 'town') continue;
    if (Math.hypot(x - W.x, y - W.y) < 17 || Math.hypot(x - G.x, y - G.y) < 11) continue;
    const t = rnd();
    if (t < 0.62) { setBlock(x, y, 2); P(pick(['tree_single_A', 'tree_single_B', 'hw_tree_pine_yellow_medium']), x + 0.5, y + 0.5, rnd() * 6, t < 0.5 ? R(3.4, 5.2) : 0.5); }
    else if (t < 0.85) { setBlock(x, y, 1); P(pick(['rock_single_C', 'rock_single_E', 'rock_single_A']), x + 0.5, y + 0.5, rnd() * 6, R(3.5, 6)); }
    else if (zoneAt(x, y) === 'wilds') { setBlock(x, y, 1); P(pick(['rubble_half', 'hw_gravestone', 'column']), x + 0.5, y + 0.5, rnd() * 6, 0.4); }
  }
})();

export function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
export function canStep(x, y, dx, dy) {
  if (!passable(x + dx, y + dy)) return false;
  if (dx && dy) return passable(x + dx, y) && passable(x, y + dy);
  return true;
}
export function hasLoS(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy, x = x0, y = y0;
  for (let i = 0; i < 200; i++) {
    if (x === x1 && y === y1) return true;
    if ((x !== x0 || y !== y0) && blockAt(x, y) === 2) return false;
    const e2 = err * 2; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; }
  }
  return true;
}
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const prev = new Int32Array(N * N), queue = new Int32Array(N * N), seen = new Uint32Array(N * N);
let stamp = 0;
/* BFS. goal(x, y) -> bool. Falls back to the reachable tile closest to (tx, ty). maxNodes bounds the search for AI. */
export function findPath(sx, sy, goal, tx, ty, maxNodes = 1e9) {
  stamp++; let head = 0, tail = 0; const s = sy * N + sx;
  queue[tail++] = s; seen[s] = stamp; prev[s] = -1;
  let best = -1, bestD = 1e9, found = -1;
  while (head < tail && head < maxNodes) {
    const cur = queue[head++], x = cur % N, y = (cur / N) | 0;
    if (goal(x, y)) { found = cur; break; }
    if (tx !== undefined) { const d = Math.hypot(x - tx, y - ty); if (d < bestD) { bestD = d; best = cur; } }
    for (const [dx, dy] of DIRS) {
      if (!canStep(x, y, dx, dy)) continue;
      const n = (y + dy) * N + x + dx; if (seen[n] === stamp) continue;
      seen[n] = stamp; prev[n] = cur; queue[tail++] = n;
    }
  }
  let end = found >= 0 ? found : best; if (end < 0) return [];
  const out = []; while (end !== s && end >= 0) { out.push({ x: end % N, y: (end / N) | 0 }); end = prev[end]; }
  return out.reverse();
}
export function randomFreeTile(cx, cy, minR, maxR, ok) {
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR), x = Math.floor(cx + 0.5 + Math.cos(a) * r), y = Math.floor(cy + 0.5 + Math.sin(a) * r);
    if (passable(x, y) && (!ok || ok(x, y))) return { x, y };
  }
  return { x: Math.floor(cx), y: Math.floor(cy) + 3 };
}
