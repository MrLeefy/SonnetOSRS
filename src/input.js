/* input.js - touch-first camera + tap handling (one finger: tap / drag to orbit, two fingers: pinch + twist) with mouse and keyboard fallbacks */
import { clamp } from './data.js';

export function initInput(el, cam, cb) {
  const pts = new Map(); let dragged = false, t0 = 0, sx = 0, sy = 0, pinch = 0, ang = 0, multi = false;
  const two = () => { const [a, b] = Array.from(pts.values()); return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) }; };
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); cb.gesture(); try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button });
    if (pts.size === 1) { dragged = false; multi = false; t0 = performance.now(); sx = e.clientX; sy = e.clientY; if (e.button === 2 || e.button === 1) dragged = true; }
    else if (pts.size === 2) { multi = true; const t = two(); pinch = t.d; ang = t.a; }
  });
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1 && !multi) {
      if (!dragged && Math.hypot(e.clientX - sx, e.clientY - sy) > (e.pointerType === 'mouse' ? 5 : 11)) dragged = true;
      if (dragged) { cam.yaw -= dx * 0.0068; cam.pitch = clamp(cam.pitch + dy * 0.005, 0.3, 1.38); }
    } else if (pts.size === 2) {
      const t = two(); if (pinch > 0) cam.dist = clamp(cam.dist * pinch / Math.max(20, t.d), cam.minDist, cam.maxDist);
      let da = t.a - ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2; cam.yaw -= da; pinch = t.d; ang = t.a;
    }
  });
  const up = e => {
    const p = pts.get(e.pointerId); if (!p) return; pts.delete(e.pointerId);
    if (pts.size === 0 && !dragged && !multi && e.type === 'pointerup' && performance.now() - t0 < 450) cb.tap(e.clientX, e.clientY);
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), cam.minDist, cam.maxDist); }, { passive: false });
  el.addEventListener('contextmenu', e => e.preventDefault());
  // stop the page itself from scrolling / zooming / rubber-banding under the game
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('.screen')) e.preventDefault(); }, { passive: false });
  const keys = new Set();
  addEventListener('keydown', e => { if (e.repeat && !e.key.startsWith('Arrow')) return; keys.add(e.key); if (cb.key(e.key.length === 1 ? e.key.toLowerCase() : e.key)) e.preventDefault(); });
  addEventListener('keyup', e => keys.delete(e.key)); addEventListener('blur', () => keys.clear());
  return {
    update(dt) {
      if (keys.has('ArrowLeft')) cam.yaw -= dt * 2; if (keys.has('ArrowRight')) cam.yaw += dt * 2;
      if (keys.has('ArrowUp')) cam.pitch = clamp(cam.pitch + dt * 1.2, 0.3, 1.38); if (keys.has('ArrowDown')) cam.pitch = clamp(cam.pitch - dt * 1.2, 0.3, 1.38);
    }
  };
}
