/* world.js - arena layout, collision grid, pathfinding and line of sight.
   Tile coords (x, y); the renderer maps them to 3D as X = x, Z = y. Tile centre is +0.5. */
import { mulberry32 } from './data.js';

export const N = 48, C = 24;          // grid size and centre
export const ARENA_R = 20.2;          // walkable radius
export const PLAZA_R = 17;            // paved radius

const grid = new Uint8Array(N * N);   // 0 free, 1 blocks movement, 2 blocks movement + sight
export const props = [];              // decorative/obstacle descriptors for the renderer

export function inMap(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
export function blockAt(x, y) { return inMap(x, y) ? grid[y * N + x] : 2; }
export function passable(x, y) { return inMap(x, y) && grid[y * N + x] === 0; }
function setBlock(x, y, v) { if (inMap(x, y)) grid[y * N + x] = Math.max(grid[y * N + x], v); }

(function build() {
  const rnd = mulberry32(4117);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (Math.hypot(x + 0.5 - C, y + 0.5 - C) > ARENA_R) grid[y * N + x] = 2;
  }
  // central monument: 3x3
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setBlock(C + dx, C + dy, 2);
  props.push({ type: 'monument', x: C + 0.5, y: C + 0.5 });
  // braziers on the diagonals
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, x = Math.floor(C + 0.5 + Math.cos(a) * 6.4), y = Math.floor(C + 0.5 + Math.sin(a) * 6.4);
    setBlock(x, y, 1); props.push({ type: 'brazier', x: x + 0.5, y: y + 0.5 });
  }
  // ruined wall segments: axis-aligned runs so they read cleanly on the tile grid
  const walls = [
    [C - 11, C - 4, 1, 5], [C + 10, C, 1, 5], [C - 3, C - 12, 6, 1], [C - 2, C + 11, 6, 1],
    [C - 9, C + 6, 4, 1], [C + 6, C - 8, 4, 1], [C + 7, C + 7, 1, 4], [C - 8, C - 10, 1, 3]
  ];
  for (const [x0, y0, w, h] of walls) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setBlock(x, y, 2);
    props.push({ type: 'wall', x: x0, y: y0, w, h, seed: Math.floor(rnd() * 1e6) });
  }
  // colonnade around the plaza edge
  for (let k = 0; k < 16; k++) {
    const a = (k + 0.5) / 16 * Math.PI * 2, x = Math.floor(C + 0.5 + Math.cos(a) * 16), y = Math.floor(C + 0.5 + Math.sin(a) * 16);
    if (grid[y * N + x]) continue;
    setBlock(x, y, 2); props.push({ type: 'pillar', x: x + 0.5, y: y + 0.5, broken: rnd() < 0.4, seed: Math.floor(rnd() * 1e6) });
  }
  // scattered rubble / crates
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2, r = 4 + rnd() * 14, x = Math.floor(C + Math.cos(a) * r), y = Math.floor(C + Math.sin(a) * r);
    if (grid[y * N + x]) continue;
    let near = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (blockAt(x + dx, y + dy) && Math.hypot(x + dx + 0.5 - C, y + dy + 0.5 - C) < ARENA_R - 1) near = true;
    if (near) continue;
    setBlock(x, y, 1); props.push({ type: rnd() < 0.5 ? 'rock' : 'crate', x: x + 0.5, y: y + 0.5, seed: Math.floor(rnd() * 1e6) });
  }
  // trees on the grass ring (decor only, outside the walkable disc edge tiles are blocked anyway)
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = 21.5 + rnd() * 5;
    props.push({ type: 'tree', x: C + Math.cos(a) * r, y: C + Math.sin(a) * r, s: 0.8 + rnd() * 0.7, seed: Math.floor(rnd() * 1e6) });
  }
})();

export function cheb(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }

export function canStep(x, y, dx, dy) {
  if (!passable(x + dx, y + dy)) return false;
  if (dx && dy) return passable(x + dx, y) && passable(x, y + dy);  // no corner cutting
  return true;
}

export function hasLoS(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy, x = x0, y = y0;
  for (let i = 0; i < 200; i++) {
    if (x === x1 && y === y1) return true;
    if ((x !== x0 || y !== y0) && blockAt(x, y) === 2) return false;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return true;
}

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const prev = new Int32Array(N * N), queue = new Int32Array(N * N), seen = new Uint32Array(N * N);
let stamp = 0;
/* BFS. goal(x, y) -> bool. If no goal tile is reachable, heads for the reachable tile closest to (tx, ty). */
export function findPath(sx, sy, goal, tx, ty) {
  stamp++; let head = 0, tail = 0; const s = sy * N + sx;
  queue[tail++] = s; seen[s] = stamp; prev[s] = -1;
  let best = -1, bestD = 1e9, found = -1;
  while (head < tail) {
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
  const out = [];
  while (end !== s && end >= 0) { out.push({ x: end % N, y: (end / N) | 0 }); end = prev[end]; }
  return out.reverse();
}

export function randomFreeTile(minR, maxR, rnd = Math.random) {
  for (let i = 0; i < 300; i++) {
    const a = rnd() * Math.PI * 2, r = minR + rnd() * (maxR - minR), x = Math.floor(C + 0.5 + Math.cos(a) * r), y = Math.floor(C + 0.5 + Math.sin(a) * r);
    if (passable(x, y)) return { x, y };
  }
  return { x: C, y: C + 5 };
}
export { DIRS };
