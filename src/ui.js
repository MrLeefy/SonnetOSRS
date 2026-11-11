/* ui.js - DOM HUD: bars, action pads, target frame, overhead plates, damage numbers, menus */
import { STYLES, SPECIALS, STYLE_IDS } from './data.js';
import { N, C, ARENA_R, blockAt } from './world.js';

const G = {
  melee: '<path d="M20 4 9.5 14.5M20 4h-4.5M20 4v4.5M6.5 11.5l6 6M8.5 15.5 4 20"/>',
  ranged: '<path d="M7 3c9 3 9 15 0 18M7 3v18M3 12h17M17 9l3 3-3 3"/>',
  magic: '<path d="M5 21 15 8"/><circle cx="17.5" cy="5.5" r="2.5"/><path d="M6 5v3M4.5 6.5h3M20 14v3M18.5 15.5h3"/>',
  shield: '<path class="sh" d="M12 2.5 20 5.5V11c0 5-3.4 8.7-8 10.5C7.4 19.7 4 16 4 11V5.5z"/>',
  food: '<path d="M14.5 4.5c3-1.5 6.5 2 5 5-1.2 2.6-4 4.2-7 3.5l-2 2c.8 1.6-.8 3.2-2.3 2.4-.3 1.6-2.6 2-3.3.5-.8-1.6.9-2.8 2.2-2.4-.6-1.4.8-2.9 2.4-2.2l2-2c-.7-3 .5-5.6 3-6.8z"/>',
  tonic: '<path d="M9.5 3h5M10.5 3v5.5L5.6 17a3 3 0 0 0 2.6 4.5h7.6a3 3 0 0 0 2.6-4.5L13.5 8.5V3M7.5 15h9"/>',
  target: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  spec: '<path d="M12 2.5 14.7 9l6.8.5-5.2 4.4 1.7 6.6L12 16.9 6 20.5l1.7-6.6L2.5 9.5 9.3 9z"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  tap: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11l5.2 1.2a2 2 0 0 1 1.5 2.3L18 19a3 3 0 0 1-3 2.5h-3.2a3 3 0 0 1-2.4-1.2L5.5 15a1.6 1.6 0 0 1 2.5-2z"/>'
};
export function icon(name) {
  if (name.startsWith('ward')) { const s = name.slice(4); return `<svg viewBox="0 0 24 24">${G.shield}<g transform="translate(6.6 5.6) scale(0.45)" stroke-width="3.4">${G[s]}</g></svg>`; }
  return `<svg viewBox="0 0 24 24">${G[name]}</svg>`;
}
const $ = id => document.getElementById(id);
const TIPS = [
  'Watch the icon above a rival: it shows which attack type they are warding. Hit them with something else.',
  'A rival holding a staff will try to root you. Ward magic, or switch to your Bow - leathers shrug off spells.',
  'Rooted? You can still fight. Switch to Bow or Staff and keep attacking.',
  'Robes are fragile. If a Blade or Bow user rushes you, swap out of your Staff stance.',
  'Golden loot left by fallen fighters restores food, tonics and special energy. Walk over it.',
  'Wards drain focus while they are up. Drop them between fights to recover.',
  'Deadeye (Bow special) never misses and mostly ignores wards - a great finisher.'
];

export class HUD {
  constructor(h) {
    this.h = h; this.cache = {}; this.plates = new Map(); this.toastT = 0;
    $('btn-pause').innerHTML = icon('pause'); $('btn-food').querySelector('.ico').innerHTML = icon('food'); $('btn-tonic').querySelector('.ico').innerHTML = icon('tonic');
    $('btn-target').querySelector('.ico').innerHTML = icon('target'); $('btn-spec').querySelector('.ico').innerHTML = icon('spec');
    document.querySelectorAll('[data-ico]').forEach(e => e.innerHTML = icon(e.dataset.ico));
    this.wardBtns = {}; this.stanceBtns = {};
    for (const s of STYLE_IDS) {
      const w = document.createElement('button'); w.className = 'gbtn ward ' + s; w.innerHTML = `<span class="ico">${icon('ward' + s)}</span>`; w.setAttribute('aria-label', 'Ward against ' + STYLES[s].label);
      $('wards').appendChild(w); this.wardBtns[s] = w; this.tap(w, () => h.ward(s));
      const b = document.createElement('button'); b.className = 'gbtn ' + s; b.innerHTML = `<span class="ico">${icon(s)}</span>`; b.setAttribute('aria-label', STYLES[s].label + ' stance');
      $('stances').appendChild(b); this.stanceBtns[s] = b; this.tap(b, () => h.stance(s));
    }
    this.tap($('btn-food'), h.eat); this.tap($('btn-tonic'), h.tonic); this.tap($('btn-target'), h.cycle); this.tap($('btn-spec'), h.spec); this.tap($('btn-pause'), h.pause);
    this.tap($('btn-play'), () => h.play(this.diff)); this.tap($('btn-resume'), h.resume); this.tap($('btn-respawn'), h.respawn); this.tap($('btn-quit'), h.quit); this.tap($('btn-quit2'), h.quit);
    this.diff = 'normal';
    for (const b of $('diff').children) this.tap(b, () => this.setDiff(b.dataset.d));
    for (const b of $('opt-quality').children) this.tap(b, () => h.quality(b.dataset.q));
    this.tap($('opt-sound'), () => h.sound()); this.tap($('opt-haptics'), () => h.haptics());
    const fs = $('btn-fs'), el = document.documentElement;
    if (!(el.requestFullscreen || el.webkitRequestFullscreen)) fs.classList.add('hidden');
    this.tap(fs, () => { try { if (document.fullscreenElement) document.exitFullscreen(); else (el.requestFullscreen || el.webkitRequestFullscreen).call(el); } catch (e) { /* unsupported */ } });
    this.mm = $('minimap').getContext('2d'); this.mmBg = null;
  }
  /* fast tap: fire on pointerdown so there is no click delay on phones */
  tap(el, fn) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('press'); setTimeout(() => el.classList.remove('press'), 110); fn(); });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  setDiff(d) { this.diff = d; for (const b of $('diff').children) b.classList.toggle('on', b.dataset.d === d); }
  setOptions(o) {
    for (const b of $('opt-quality').children) b.classList.toggle('on', b.dataset.q === o.quality);
    $('opt-sound').classList.toggle('on', o.sound); $('opt-haptics').classList.toggle('on', o.haptics);
  }
  show(name, data = {}) {
    $('screen-title').classList.toggle('hidden', name !== 'title'); $('screen-pause').classList.toggle('hidden', name !== 'pause'); $('screen-dead').classList.toggle('hidden', name !== 'dead');
    $('hud').classList.toggle('hidden', name === 'title');
    if (name === 'title') { $('best-line').textContent = data.best ? `Best streak: ${data.best}` : ''; this.clearPlates(); $('vignette').className = ''; }
    if (name === 'dead') {
      $('dead-by').textContent = data.by ? `Struck down by ${data.by}` : ''; $('d-streak').textContent = data.streak; $('d-kills').textContent = data.kills; $('d-best').textContent = data.best;
      $('dead-tip').textContent = 'Tip: ' + TIPS[(Math.random() * TIPS.length) | 0];
    }
  }
  set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } }
  update(g, dt) {
    const p = g.player, s = g.stats;
    this.set('hp', p.hp, v => { $('hp-txt').textContent = v; document.querySelector('.me .hp i').style.transform = `scaleX(${v / p.maxHp})`; });
    this.set('focus', p.focus, v => { $('focus-txt').textContent = v; document.querySelector('.me .focus i').style.transform = `scaleX(${v / 100})`; });
    this.set('kills', s.kills, v => $('st-kills').textContent = v); this.set('streak', s.streak, v => $('st-streak').textContent = v); this.set('score', s.score, v => $('st-score').textContent = v);
    this.set('food', p.food, v => { const b = $('btn-food'); b.querySelector('.badge').textContent = v; b.classList.toggle('empty', v <= 0); });
    this.set('tonics', p.tonics, v => { const b = $('btn-tonic'); b.querySelector('.badge').textContent = v; b.classList.toggle('empty', v <= 0); });
    this.set('eatCd', p.eatCd, v => { const k = `scaleY(${Math.min(1, v / 3)})`; $('btn-food').querySelector('.cd').style.transform = k; $('btn-tonic').querySelector('.cd').style.transform = k; });
    this.set('stance', p.stance, v => { for (const k in this.stanceBtns) this.stanceBtns[k].classList.toggle('on', k === v); $('spec-name').textContent = SPECIALS[v].name; });
    this.set('ward', p.ward, v => { for (const k in this.wardBtns) this.wardBtns[k].classList.toggle('on', k === v); });
    const cost = SPECIALS[p.stance].cost;
    this.set('spec', p.spec, v => { $('spec-pct').textContent = v + '%'; $('btn-spec').querySelector('.fill').style.transform = `scaleX(${v / 100})`; });
    this.set('specOff', p.spec < cost && !p.specArmed, v => $('btn-spec').classList.toggle('off', v));
    this.set('armed', p.specArmed, v => $('btn-spec').classList.toggle('armed', v));
    // target frame, plus a nudge toward the ward that counters whoever is attacking us
    const t = p.target && !p.target.dead ? p.target : null;
    this.set('tgt', t ? t.id : 0, v => { $('tgt').classList.toggle('hidden', !v); if (t) $('tgt-name').textContent = t.name; });
    if (t) {
      this.set('tHp', t.hp, v => $('tgt-hp').style.transform = `scaleX(${v / t.maxHp})`);
      this.set('tSt', t.id + t.stance, () => { const e = $('tgt-stance'); e.className = 'chip ' + t.stance; e.innerHTML = icon(t.stance); });
      this.set('tWd', t.id + (t.ward || '-'), () => { const e = $('tgt-ward'); e.className = 'chip w ' + (t.ward || 'none'); e.innerHTML = t.ward ? icon('ward' + t.ward) : `<svg viewBox="0 0 24 24">${G.shield}</svg>`; });
    }
    const threat = p.lastAttacker && !p.lastAttacker.dead && g.tick - p.lastHurtTick < 6 ? p.lastAttacker : null;
    const hint = threat && p.ward !== threat.stance && p.focus > 0 ? threat.stance : '';
    this.set('hint', hint, v => { for (const k in this.wardBtns) this.wardBtns[k].classList.toggle('hint', k === v); });
    this.set('status', p.frozen > 0 ? 'ROOTED' : (g.tick < p.protectUntil ? 'PROTECTED' : ''), v => $('status').textContent = v);
    const vg = p.frozen > 0 ? 'frozen' : (p.hp <= 25 && !p.dead ? 'low' : '');
    this.set('vg', vg, v => { const e = $('vignette'); e.classList.toggle('low', v === 'low'); e.classList.toggle('frozen', v === 'frozen'); });
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('show'); }
  }
  hurtFlash() { const e = $('vignette'); e.classList.add('hit'); requestAnimationFrame(() => requestAnimationFrame(() => e.classList.remove('hit'))); }
  toast(text) { const e = $('toast'); e.textContent = text; e.classList.add('show'); this.toastT = 2.2; }
  banner(title, sub) { const e = $('banner'); e.firstElementChild.textContent = title; e.lastElementChild.textContent = sub || ''; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }
  feed(html) { const f = $('feed'), d = document.createElement('div'); d.innerHTML = html; f.prepend(d); while (f.children.length > 4) f.lastChild.remove(); setTimeout(() => d.remove(), 5000); }

  /* ---- overhead plates ---- */
  plate(a) {
    let pl = this.plates.get(a.id);
    if (!pl) {
      const el = document.createElement('div'); el.className = 'plate' + (a.isPlayer ? ' me' : '');
      el.innerHTML = `<div><div class="wd"></div><div class="nm"></div><div class="hpb"><i></i></div></div>`;
      el.querySelector('.nm').textContent = a.name; $('plates').appendChild(el);
      pl = { el, wd: el.querySelector('.wd'), hp: el.querySelector('i'), c: {} }; this.plates.set(a.id, pl);
    }
    return pl;
  }
  setPlate(a, x, y, vis, isTarget) {
    const pl = this.plate(a), c = pl.c;
    if (c.vis !== vis) { c.vis = vis; pl.el.style.display = vis ? '' : 'none'; }
    if (!vis) return;
    pl.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    if (c.hp !== a.hp) { c.hp = a.hp; const f = a.hp / a.maxHp; pl.hp.style.transform = `scaleX(${f})`; pl.hp.style.background = f > 0.5 ? '#58d05a' : f > 0.25 ? '#e8c14a' : '#e8483a'; }
    if (c.ward !== a.ward) { c.ward = a.ward; pl.wd.className = 'wd ' + (a.ward || ''); pl.wd.innerHTML = a.ward ? icon('ward' + a.ward) : ''; pl.wd.style.display = a.ward ? '' : 'none'; }
    if (c.tg !== isTarget) { c.tg = isTarget; pl.el.classList.toggle('tg', isTarget); }
  }
  removePlate(id) { const pl = this.plates.get(id); if (pl) { pl.el.remove(); this.plates.delete(id); } }
  clearPlates() { for (const id of Array.from(this.plates.keys())) this.removePlate(id); }
  splat(x, y, text, cls) {
    const d = document.createElement('div'); d.className = 'splat ' + cls; d.textContent = text;
    d.style.setProperty('--x', (x + (Math.random() - 0.5) * 22).toFixed(0) + 'px'); d.style.setProperty('--y', (y + (Math.random() - 0.5) * 12).toFixed(0) + 'px');
    $('plates').appendChild(d); setTimeout(() => d.remove(), 950);
  }
  /* ---- minimap: rotates with the camera so "up" is always forward ---- */
  minimap(g, yaw, pos) {
    const c = this.mm, S = 192, sc = S / (ARENA_R * 2 + 3);
    if (!this.mmBg) {
      const b = this.mmBg = document.createElement('canvas'); b.width = b.height = S; const k = b.getContext('2d');
      k.translate(S / 2, S / 2); k.fillStyle = '#58683a'; k.beginPath(); k.arc(0, 0, ARENA_R * sc, 0, 7); k.fill(); k.fillStyle = '#8d897e'; k.beginPath(); k.arc(0, 0, 17 * sc, 0, 7); k.fill();
      k.fillStyle = '#3b3833'; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (blockAt(x, y) && Math.hypot(x + 0.5 - C, y + 0.5 - C) < ARENA_R) k.fillRect((x - C) * sc, (y - C) * sc, sc + 0.5, sc + 0.5);
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S, S); c.translate(S / 2, S / 2); c.rotate(yaw); c.drawImage(this.mmBg, -S / 2, -S / 2);
    for (const l of g.loot) { c.fillStyle = '#ffd76a'; c.fillRect((l.x + 0.5 - C) * sc - 3, (l.y + 0.5 - C) * sc - 3, 6, 6); }
    for (const a of g.actors) {
      if (a.dead) continue; const v = pos(a); c.beginPath(); c.arc((v.x - C) * sc, (v.z - C) * sc, a.isPlayer ? 6 : 5, 0, 7);
      c.fillStyle = a.isPlayer ? '#fff' : (g.player && g.player.target === a ? '#ff3b2f' : '#ff9a3a'); c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#000'; c.stroke();
    }
  }
}
