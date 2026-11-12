/* ui.js - DOM HUD: bars, action pads, target frame, overhead plates, damage numbers, menus */
import { STYLES, SPECIALS, STYLE_IDS } from './data.js';
import { N, TOWN, WILDS, GRAVE, PLAZA_R, blockAt, landDist, roadDist, zoneAt, ZONE_NAMES } from './world.js';
import { ITEMS, TIERS, SLOTS, SMITH_STOCK, MARKET_STOCK, sellPrice, levelOf, xpForLevel, SKILLS, TASKS, skillLevel, skillXp } from './items.js';

const G = {
  melee: '<path d="M20 4 9.5 14.5M20 4h-4.5M20 4v4.5M6.5 11.5l6 6M8.5 15.5 4 20"/>',
  ranged: '<path d="M7 3c9 3 9 15 0 18M7 3v18M3 12h17M17 9l3 3-3 3"/>',
  magic: '<path d="M5 21 15 8"/><circle cx="17.5" cy="5.5" r="2.5"/><path d="M6 5v3M4.5 6.5h3M20 14v3M18.5 15.5h3"/>',
  shield: '<path class="sh" d="M12 2.5 20 5.5V11c0 5-3.4 8.7-8 10.5C7.4 19.7 4 16 4 11V5.5z"/>',
  food: '<path d="M14.5 4.5c3-1.5 6.5 2 5 5-1.2 2.6-4 4.2-7 3.5l-2 2c.8 1.6-.8 3.2-2.3 2.4-.3 1.6-2.6 2-3.3.5-.8-1.6.9-2.8 2.2-2.4-.6-1.4.8-2.9 2.4-2.2l2-2c-.7-3 .5-5.6 3-6.8z"/>',
  tonic: '<path d="M9.5 3h5M10.5 3v5.5L5.6 17a3 3 0 0 0 2.6 4.5h7.6a3 3 0 0 0 2.6-4.5L13.5 8.5V3M7.5 15h9"/>',
  target: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  spec: '<path d="M12 2.5 14.7 9l6.8.5-5.2 4.4 1.7 6.6L12 16.9 6 20.5l1.7-6.6L2.5 9.5 9.3 9z"/>',
  bag: '<path d="M6 8h12l1.5 12h-15zM9 8V6a3 3 0 0 1 6 0v2"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  tap: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11l5.2 1.2a2 2 0 0 1 1.5 2.3L18 19a3 3 0 0 1-3 2.5h-3.2a3 3 0 0 1-2.4-1.2L5.5 15a1.6 1.6 0 0 1 2.5-2z"/>'
};
export function icon(name) {
  if (name.startsWith('ward')) { const s = name.slice(4); return `<svg viewBox="0 0 24 24">${G.shield}<g transform="translate(6.6 5.6) scale(0.45)" stroke-width="3.4">${G[s]}</g></svg>`; }
  return `<svg viewBox="0 0 24 24">${G[name]}</svg>`;
}
const $ = id => document.getElementById(id);
const TIPS = [
  'Bank your coins before leaving town - anything you carry is dropped where you fall.',
  'The Barrow Yard to the west is the place to start: thralls hit softly and drop coins.',
  'Watch the icon above a rival: it shows which attack type they are warding. Hit them with something else.',
  'Rooted? You can still fight. Switch to Crossbow or Staff and keep attacking.',
  'The Smith sells stronger gear. A better weapon hits harder; better armour protects you in that stance.',
  'Rivals in the Ashen Wilds carry more coins the better their gear - and sometimes drop a piece of it.',
  'Resting in town slowly restores health and focus for free.'
];

export class HUD {
  constructor(h) {
    this.h = h; this.cache = {}; this.plates = new Map(); this.toastT = 0; this.icons = {}; this.mode = null; this.sel = -1; this.rev = -1; this.game = null;
    $('btn-bag').innerHTML = icon('bag'); this.tap($('btn-bag'), () => this.mode ? this.closePanel() : this.openPanel('bag'));
    $('pclose').addEventListener('click', () => this.closePanel());
    for (const b of $('ptabs').children) b.addEventListener('click', () => this.openPanel(b.dataset.tab));
    $('pbody').addEventListener('click', e => this.panelClick(e)); $('pdetail').addEventListener('click', e => this.panelClick(e));
    let armed = 0; this.tap($('btn-new'), () => { if (Date.now() - armed < 3000) { h.newChar(); $('btn-new').textContent = 'New character'; } else { armed = Date.now(); $('btn-new').textContent = 'Tap again to erase save'; } });
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
    this.tap($('btn-play'), () => h.play()); this.tap($('btn-resume'), h.resume); this.tap($('btn-respawn'), h.respawn); this.tap($('btn-quit'), h.quit); this.tap($('btn-quit2'), h.quit);
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
  setOptions(o) {
    for (const b of $('opt-quality').children) b.classList.toggle('on', b.dataset.q === o.quality);
    $('opt-sound').classList.toggle('on', o.sound); $('opt-haptics').classList.toggle('on', o.haptics);
  }
  show(name, data = {}) {
    $('screen-title').classList.toggle('hidden', name !== 'title'); $('screen-pause').classList.toggle('hidden', name !== 'pause'); $('screen-dead').classList.toggle('hidden', name !== 'dead');
    $('hud').classList.toggle('hidden', name === 'title');
    if (name !== 'game') this.closePanel();
    if (name === 'title') { $('best-line').textContent = data.level ? `Level ${data.level} - ${data.coins} coins` : ''; this.clearPlates(); $('vignette').className = ''; }
    if (name === 'dead') {
      $('dead-by').textContent = data.by ? `Struck down by ${data.by}` : ''; $('dead-lost').textContent = data.lost || ''; $('d-streak').textContent = data.streak; $('d-kills').textContent = data.kills; $('d-best').textContent = data.best;
      $('dead-tip').textContent = 'Tip: ' + TIPS[(Math.random() * TIPS.length) | 0];
    }
  }
  set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } }
  update(g, dt) {
    const p = g.player; this.game = g;
    this.set('hp', p.hp, v => { $('hp-txt').textContent = v; document.querySelector('.me .hp i').style.transform = `scaleX(${v / p.maxHp})`; });
    this.set('focus', p.focus, v => { $('focus-txt').textContent = v; document.querySelector('.me .focus i').style.transform = `scaleX(${v / 100})`; });
    this.set('lvl', p.level, v => $('st-lvl').textContent = v); this.set('streak', g.streak, v => $('st-streak').textContent = v); this.set('coins', g.save.coins, v => $('st-coins').textContent = v > 9999 ? (v / 1000).toFixed(1) + 'k' : v);
    this.set('zone', g.zone, v => { const e = $('zone'); e.textContent = (ZONE_NAMES[v] || '') + (v === 'wilds' ? ' - PvP' : v === 'town' ? ' - safe' : ''); e.className = v === 'wilds' || v === 'grave' ? 'danger' : v === 'town' ? 'safe' : ''; });
    if (this.mode && this.rev !== g.rev) this.renderPanel();
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
    this.set('status', p.frozen > 0 ? 'ROOTED' : p.gather && !p.path.length ? SKILLS[{ tree: 'wood', rock: 'mine', fish: 'fish', fire: 'cook' }[p.gather.type]].verb : '', v => $('status').textContent = v);
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
      const el = document.createElement('div'); el.className = 'plate' + (a.isPlayer ? ' me' : a.kind === 'npc' ? ' npc' : a.boss ? ' mon boss' : a.kind === 'monster' ? ' mon' : '');
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
  /* ---- minimap: player-centred, rotates with the camera so "up" is always forward ---- */
  minimap(g, yaw, pos, cx, cz) {
    const c = this.mm, S = 192, Z = 3.4;
    if (!this.mmBg) {
      const b = this.mmBg = document.createElement('canvas'); b.width = b.height = N * 4; const k = b.getContext('2d');
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const z = zoneAt(x, y), land = landDist(x + 0.5, y + 0.5) > 0.03, bl = blockAt(x, y);
        k.fillStyle = !land ? '#2a6a86' : bl === 2 ? '#3d4238' : bl === 1 ? '#5a5a4a' : roadDist(x, y) < 1.8 ? '#a08a60' : z === 'town' ? '#a39878' : z === 'wilds' ? (Math.hypot(x - WILDS.x, y - WILDS.y) < PLAZA_R ? '#8d897e' : '#6f7358') : z === 'grave' ? '#5c5a48' : '#6f9a3c';
        k.fillRect(x * 4, y * 4, 4, 4);
      }
      k.strokeStyle = '#8fe08a'; k.lineWidth = 2; k.strokeRect(TOWN.x0 * 4, TOWN.y0 * 4, (TOWN.x1 - TOWN.x0) * 4, (TOWN.y1 - TOWN.y0) * 4);
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#2a6a86'; c.fillRect(0, 0, S, S); c.translate(S / 2, S / 2); c.rotate(yaw); c.scale(Z / 4, Z / 4); c.translate(-cx * 4, -cz * 4); c.drawImage(this.mmBg, 0, 0);
    for (const l of g.loot) { c.fillStyle = '#ffd76a'; c.fillRect(l.x * 4, l.y * 4, 5, 5); }
    for (const a of g.actors) {
      if (a.dead) continue; const v = pos(a); c.beginPath(); c.arc(v.x * 4, v.z * 4, a.isPlayer ? 5 : 4, 0, 7);
      c.fillStyle = a.isPlayer ? '#fff' : a.kind === 'npc' ? '#6ee0ff' : a.kind === 'monster' ? '#ffd27a' : (g.player && g.player.target === a ? '#ff3b2f' : '#ff7a3a'); c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#000'; c.stroke();
    }
  }

  /* ---- bag / gear / bank / shop panel ---- */
  openPanel(mode, shop) { this.mode = mode; this.shop = shop || null; this.sel = -1; $('panel').classList.remove('hidden'); $('hud').classList.add('paneled'); this.renderPanel(); }
  closePanel() { if (!this.mode) return; this.mode = null; $('panel').classList.add('hidden'); $('hud').classList.remove('paneled'); }
  cell(id, n, attr, sel) { const it = ITEMS[id]; return `<button class="cell t${it.tier || 0}${sel ? ' sel' : ''}" ${attr}><img src="${this.icons[id]}" alt="${it.name}">${n > 1 ? `<b>${n}</b>` : ''}</button>`; }
  bagGrid(act) { const p = this.game.player; return '<div class="grid">' + p.inv.map((s, i) => s ? this.cell(s.id, s.n, `data-act="${act}" data-i="${i}"`, i === this.sel) : '<div class="cell"></div>').join('') + '</div>'; }
  renderPanel() {
    const g = this.game; if (!g || !g.player) return; this.rev = g.rev; const p = g.player, sv = g.save, m = this.mode; let h = '', d = '';
    $('ptabs').style.display = m === 'bank' || m === 'shop' ? 'none' : ''; for (const b of $('ptabs').children) b.classList.toggle('on', b.dataset.tab === m);
    $('ptitle').textContent = m === 'bank' ? 'Hollowmere Vault' : m === 'shop' ? (this.shop === 'smith' ? 'Smithy' : 'Market') : ''; $('pcoins').textContent = sv.coins; $('pcoin-ico').src = this.icons.coins || '';
    const s = this.sel >= 0 ? p.inv[this.sel] : null; if (!s) this.sel = -1;
    if (m === 'bag') {
      h = this.bagGrid('sel');
      if (s) { const it = ITEMS[s.id]; d = `<div class="d"><b>${it.name}</b>${it.desc}</div><button class="act go" data-act="use" data-i="${this.sel}">${it.slot ? 'Equip' : it.kind === 'food' ? 'Eat' : 'Drink'}</button><button class="act" data-act="drop" data-i="${this.sel}">Drop</button>`; }
      else d = '<div class="d" style="opacity:.6">Tap an item to select it. Tap it again to use or equip.</div>';
    } else if (m === 'gear') {
      h = '<div class="slots">' + Object.keys(SLOTS).map(k => { const it = ITEMS[p.eq[k]]; return `<div class="slot"><img src="${this.icons[it.id]}" alt=""><div><b style="color:${TIERS[it.tier].css}">${it.name}</b>${it.desc}</div></div>`; }).join('') + '</div>';
      const l = p.level, x0 = xpForLevel(l), x1 = xpForLevel(l + 1);
      h += `<div class="sec"><span>Level ${l}</span><span>${p.maxHp} max health</span></div><div class="xp"><i style="width:${Math.min(100, (sv.xp - x0) / (x1 - x0) * 100)}%"></i></div>`;
      h += `<div class="recs"><div><b>${sv.kills}</b><small>RIVALS SLAIN</small></div><div><b>${sv.best}</b><small>BEST STREAK</small></div><div><b>${sv.bossKills}</b><small>WARDENS</small></div><div><b>${sv.deaths}</b><small>DEATHS</small></div></div>`;
    } else if (m === 'skills') {
      const row = (name, l, x, x0, x1, note) => `<div class="sk"><div><b>${name}</b><span>Level ${l}</span></div><div class="xp"><i style="width:${Math.min(100, (x - x0) / (x1 - x0) * 100)}%"></i></div><small>${note}</small></div>`;
      const notes = { wood: 'Tap a tree in the eastern forest. Logs sell at the Market.', mine: 'Tap a copper-coloured rock at the north-east mine. Ore sells well.', fish: 'Tap a ripple just off the shore.', cook: 'Tap the campfire beside the tavern with raw trout in your bag.' };
      h = row('Combat', p.level, sv.xp, xpForLevel(p.level), xpForLevel(p.level + 1), `${p.maxHp} max health. Earned by dealing damage.`);
      for (const k in SKILLS) { const l = skillLevel(sv.skills[k]); h += row(SKILLS[k].name, l, sv.skills[k], skillXp(l), skillXp(l + 1), notes[k] + ' Higher levels succeed more often.'); }
    } else if (m === 'tasks') {
      h = TASKS.map(t => `<div class="task${sv.tasks[t.id] ? ' done' : ''}"><i>${sv.tasks[t.id] ? '&#10003;' : ''}</i><span>${t.t}</span><b>+${t.r}</b></div>`).join(''); $('btn-bag').classList.remove('hasnew');
    } else if (m === 'bank') {
      const ids = Object.keys(sv.bank.items);
      h = `<div class="sec"><span>Vault - ${sv.bank.coins} coins</span><span><button data-act="coinsIn">Deposit coins</button> <button data-act="coinsOut">Withdraw coins</button></span></div>`;
      h += '<div class="grid">' + (ids.length ? ids.map(id => this.cell(id, sv.bank.items[id], `data-act="wd" data-id="${id}"`)).join('') : '<div class="cell"></div>') + '</div>';
      h += `<div class="sec"><span>Your bag - tap to deposit</span><button data-act="depAll">Deposit everything</button></div>` + this.bagGrid('dep');
    } else if (m === 'shop') {
      const stock = this.shop === 'smith' ? SMITH_STOCK : MARKET_STOCK, wealth = sv.coins + sv.bank.coins;
      h = '<div class="sec"><span>For sale - tap to buy</span><span>bank coins count too</span></div>' + stock.map(id => { const it = ITEMS[id], own = it.slot && (p.eq[it.slot] === id || p.inv.some(x => x && x.id === id));
        return `<button class="row2${wealth < it.price ? ' no' : ''}${own ? ' own' : ''}" data-act="buy" data-id="${id}"><img src="${this.icons[id]}" alt=""><span class="d"><b style="color:${it.slot ? TIERS[it.tier].css : '#fff'}">${it.name}</b>${it.desc}</span><span class="p">${it.price}</span></button>`; }).join('');
      h += '<div class="sec"><span>Your bag - tap to sell</span></div>' + this.bagGrid('sel');
      if (s) d = `<div class="d"><b>${ITEMS[s.id].name}</b>${ITEMS[s.id].desc}</div><button class="act go" data-act="sell" data-i="${this.sel}">Sell for ${sellPrice(s.id)}</button>`;
    }
    const body = $('pbody'), top = body.scrollTop; body.innerHTML = h; body.scrollTop = top; $('pdetail').innerHTML = d;
  }
  panelClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, i = +b.dataset.i, id = b.dataset.id, h = this.h;
    if (a === 'sel') { if (this.sel === i && this.mode === 'bag') h.useSlot(i); else this.sel = i; }
    else if (a === 'use') h.useSlot(i); else if (a === 'drop') { h.dropSlot(i); this.sel = -1; } else if (a === 'dep') h.deposit(i); else if (a === 'wd') h.withdraw(id);
    else if (a === 'depAll') h.depositAll(); else if (a === 'coinsIn') h.coins(true); else if (a === 'coinsOut') h.coins(false); else if (a === 'buy') h.buy(id); else if (a === 'sell') h.sell(i);
    this.renderPanel();
  }
}
