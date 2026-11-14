'use strict';
/* ==========================================================================
   ui.js - HUD, menus, touch + keyboard input, minimap, labels, sound
   ========================================================================== */
const $ = id => document.getElementById(id);
let paused = true, started = false, soundOn = true, hadSave = false, camYawT = cam.yaw, camPitchOff = 0;
const ICON = {
  pick: '<path d="M5 20 15 9"/><path d="M8 5c5-1.5 9.5 1 11.5 6.500"/>',
  shovel: '<path d="M4 20 13 11"/><path d="m12 7 5 5 4-6-3-3z"/><path d="M3 18l3 3"/>',
  drill: '<path d="M3 8h9v7H3z"/><path d="m12 9.500 9 2-9 2"/><path d="M6 15v5h3"/>',
  dyn: '<path d="M8 10h8v10H8z"/><path d="M12 10c0-4 2-6 5-6"/><path d="m19 2 .5 1.500M21 5l-1.500.2"/>',
  ration: '<path d="M12 8c-4.500-3-8 1-6.500 6.500C6.500 18.500 9 20.500 12 19.500c3 1 5.500-1 6.500-5C20 9 16.500 5 12 8z"/><path d="M12 8c0-2 .8-3.500 2.500-4.500"/>',
  rot: '<path d="M20 12a8 8 0 1 1-2.600-5.900"/><path d="M20 3.500V8h-4.500"/>',
  bag: '<path d="M6 8h12l1 12H5z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>',
  pause: '<path d="M8.500 5v14M15.500 5v14"/>',
  star: '<path d="m12 3 2.700 5.600 6.100.8-4.500 4.300 1.100 6.100L12 16.900 6.600 19.800l1.100-6.100L3.200 9.400l6.100-.8z"/>',
  jump: '<path d="M12 20V6"/><path d="m5.500 12 6.500-6.500 6.500 6.500"/>',
  hammer: '<path d="M4 20 13 11"/><path d="m11 6 7 7 3-3-7-7z"/>'
};
const ico = (n, col) => `<svg viewBox="0 0 24 24" fill="none" stroke="${col || 'currentColor'}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n].replace(/(\d)\.(\d)00/g, '$1.$2')}</svg>`;
const hex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function cube(id) {
  const b = BL[id], t = b.ct, s = b.c;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.500 21 7.500 12 12.500 3 7.500z" fill="${hex(t.map(v => v * 1.08))}"/><path d="M3 7.500 12 12.500V22L3 17z" fill="${hex(s.map(v => v * .86))}"/><path d="M21 7.500 12 12.500V22l9-5z" fill="${hex(s.map(v => v * .64))}"/></svg>`;
}

/* ---- sound ---- */
let AC = null; const sfxLast = {};
function audioInit() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } if (AC && AC.state === 'suspended') AC.resume().catch(() => { }); }
function tone(f, d, type, vol, f2, delay) {
  const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .02);
}
let noiseBuf = null;
function noise(d, vol, fc, delay) {
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const a = noiseBuf.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; }
  const t = AC.currentTime + (delay || 0), s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.value = fc;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d); s.connect(f).connect(g).connect(AC.destination); s.start(t, Math.random() * .5); s.stop(t + d + .02);
}
const SFX = {
  hit: () => { noise(.06, .22, 2200); tone(520 + Math.random() * 80, .04, 'square', .03); }, dirt: () => noise(.08, .2, 700), dig: () => noise(.13, .3, 520),
  break: () => { noise(.13, .32, 1400); tone(170, .09, 'square', .06, 90); }, drill: () => { noise(.06, .1, 3200); tone(140, .06, 'sawtooth', .04); },
  place: () => tone(210, .08, 'triangle', .22, 320), coin: () => { tone(988, .08, 'square', .06); tone(1319, .14, 'square', .06, 0, .07); },
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .16, 'triangle', .16, 0, i * .09)), quest: () => [659, 880, 1175].forEach((f, i) => tone(f, .14, 'triangle', .14, 0, i * .08)),
  boom: () => { noise(.8, .9, 420); tone(70, .55, 'sine', .6, 28); }, hammer: () => { noise(1.3, 1, 600); tone(55, .9, 'sine', .8, 22); noise(.3, .5, 4000); },
  throw: () => tone(520, .16, 'sine', .12, 220), jump: () => tone(300, .09, 'sine', .08, 470), hurt: () => tone(210, .2, 'sawtooth', .14, 90), eat: () => { noise(.06, .2, 1200); noise(.06, .2, 1200, .12); },
  timber: () => { noise(.5, .4, 900); tone(120, .4, 'triangle', .2, 50); }, baa: () => { tone(430, .12, 'sawtooth', .07, 400); tone(400, .2, 'sawtooth', .07, 350, .12); },
  engine: () => tone(60, .5, 'sawtooth', .16, 110), whistle: () => tone(1700, .95, 'sine', .12, 260), no: () => tone(160, .14, 'square', .08, 120)
};
sfx = n => { if (!soundOn || !AC || !SFX[n]) return; const now = performance.now(); if (now - (sfxLast[n] || 0) < 45) return; sfxLast[n] = now; try { SFX[n](); } catch (e) { } if ((n === 'boom' || n === 'hammer') && navigator.vibrate) try { navigator.vibrate(n === 'hammer' ? 90 : 40); } catch (e) { } };

/* ---- toasts, feed, floating text, flash ---- */
toast = (msg, cls) => {
  const box = $('toasts'); for (const c of box.children) if (c.textContent === msg) return;
  const d = document.createElement('div'); d.textContent = msg; if (cls) d.className = cls; box.appendChild(d); while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { d.style.opacity = 0; d.style.transform = 'translateY(-8px)'; setTimeout(() => d.remove(), 420); }, cls ? 3200 : 2400);
};
const feedMap = new Map();
feed = (name, n, col) => {
  let f = feedMap.get(name);
  if (!f) { const el = document.createElement('div'); el.innerHTML = '<i></i><span></span>'; el.firstChild.style.background = '#' + col.toString(16).padStart(6, '0'); $('feed').appendChild(el); f = { el, n: 0 }; feedMap.set(name, f); while ($('feed').children.length > 5) { const first = $('feed').firstChild; for (const [k, v] of feedMap) if (v.el === first) { clearTimeout(v.t); feedMap.delete(k); } first.remove(); } }
  f.n += n; f.el.lastChild.textContent = '+' + f.n + ' ' + name; f.el.style.opacity = 1; clearTimeout(f.t);
  f.t = setTimeout(() => { f.el.style.opacity = 0; setTimeout(() => { if (feedMap.get(name) === f) feedMap.delete(name); f.el.remove(); }, 420); }, 1900);
};
const floats = [];
floatText = (txt, x, y, z, col) => { const el = document.createElement('div'); el.className = 'wl float'; el.textContent = txt; el.style.color = col; $('labels').appendChild(el); floats.push({ el, x, y, z, t: 0 }); };
let flashV = 0;
flash = (a, col) => { flashV = Math.max(flashV, a); $('flash').style.background = col || '#fff'; };
onQuest = () => { const q = QUESTS[P.quest]; $('quest').innerHTML = q ? `<small>GOAL</small>${q.t} <b>${q.n > 1 ? Math.min(P.qn | 0, q.n) + '/' + q.n : ''}</b>` : '<small>FREE PLAY</small>The island is yours'; };

/* ---- world labels ---- */
const labels = [];
function mkLabel(cls, txt, get) { const el = document.createElement('div'); el.className = 'wl ' + cls; el.textContent = txt; el.hidden = true; $('labels').appendChild(el); labels.push({ el, get, off: 1 }); }
function initLabels() {
  for (const n of npcs) mkLabel('npc', n.name, () => [n.x, n.y + 2.0, n.z]);
  mkLabel('you', 'You', () => { const b = body(); return [b.x, b.y - b.lift + (P.mounted ? 2.5 : 2.0), b.z]; });
  mkLabel('rig', 'Bore Rig', () => P.mounted ? null : [rig.x, rig.y + 2.5, rig.z]);
  mkLabel('camp', 'Deepmere Camp', () => Math.hypot(P.x - CAMPX, P.z - CAMPZ) > 20 ? [CAMPX + .5, CAMPY + 8, CAMPZ + .5] : null);
}
function updateLabels(dt) {
  for (const l of labels) { const w = l.get(), p = w && project(w[0], w[1], w[2]); if (!p || p[0] < -80 || p[0] > cam.w + 80 || p[1] < -30 || p[1] > cam.h + 30) { if (!l.off) { l.el.hidden = true; l.off = 1; } continue; } if (l.off) { l.el.hidden = false; l.off = 0; } l.el.style.transform = `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px) translate(-50%,-100%)`; }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; const p = project(f.x, f.y + f.t * 1.6, f.z); if (f.t > 1.2 || !p) { f.el.remove(); floats.splice(i, 1); continue; } f.el.style.transform = `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px) translate(-50%,-100%)`; f.el.style.opacity = Math.min(1, (1.2 - f.t) * 3); }
  if (flashV > 0.004) { flashV *= Math.exp(-dt * 7); $('flash').style.opacity = flashV; } else if (flashV) { flashV = 0; $('flash').style.opacity = 0; }
}

/* ---- minimap ---- */
const mapC = document.createElement('canvas'); mapC.width = WX; mapC.height = WZ; const mapX = mapC.getContext('2d'); let mapImg = null, mapDirty = true, mapT = 0;
function mapCol(x, z) {
  let y = colTop[x * WZ + z]; const id = vox[(x * WZ + z) * WY + y], c = BL[id].ct, sh = id === B.WATER ? 1 : clamp(.62 + (y - SEA) * .03, .45, 1.25), i = (z * WX + x) * 4, d = mapImg.data;
  d[i] = Math.min(255, c[0] * sh); d[i + 1] = Math.min(255, c[1] * sh); d[i + 2] = Math.min(255, c[2] * sh); d[i + 3] = 255;
}
function initMap() { mapImg = mapX.createImageData(WX, WZ); for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) mapCol(x, z); mapDirty = true; onMapCol = (x, z) => { mapCol(x, z); mapDirty = true; }; }
function drawMini(dt) {
  mapT -= dt; if (mapT > 0) return; mapT = .08;
  if (mapDirty) { mapX.putImageData(mapImg, 0, 0); mapDirty = false; }
  const c = $('mini'), g = c.getContext('2d'), S = c.width, h = S / 2, sc = 1.9, b = body();
  g.fillStyle = '#3d74b8'; g.fillRect(0, 0, S, S); g.save(); g.beginPath(); g.arc(h, h, h, 0, 7); g.clip(); g.translate(h, h); g.rotate(cam.yaw); g.scale(sc, sc); g.imageSmoothingEnabled = false; g.drawImage(mapC, -b.x, -b.z);
  const dot = (x, z, col, r) => { g.fillStyle = col; g.beginPath(); g.arc(x - b.x, z - b.z, r, 0, 7); g.fill(); };
  for (const n of npcs) dot(n.x, n.z, '#7fd9ff', 2.2); if (!P.mounted) dot(rig.x, rig.z, '#ff7a3d', 2.4);
  g.rotate(-b.face + Math.PI); g.fillStyle = '#fff'; g.strokeStyle = '#14161b'; g.lineWidth = .8; g.beginPath(); g.moveTo(0, -4.2); g.lineTo(3, 3); g.lineTo(0, 1.4); g.lineTo(-3, 3); g.closePath(); g.fill(); g.stroke(); g.restore();
}

/* ---- HUD ---- */
const hudC = {};
function setT(id, v) { if (hudC[id] !== v) { hudC[id] = v; $(id).textContent = v; } }
const TOOLS = [['pick', 'pick', '#ff8a4a'], ['shovel', 'shovel', '#6fdc7a'], ['drill', 'drill', '#6cc0ff']];
function buildHud() {
  $('bBag').innerHTML = ico('bag'); $('bPause').innerHTML = ico('pause'); $('bRot').innerHTML = ico('rot'); $('bJump').innerHTML = ico('jump');
  $('bDyn').innerHTML = ico('dyn', '#ff8a4a') + '<span class="n" id="nDyn" style="color:#ff8a4a"></span>'; $('bRation').innerHTML = ico('ration', '#6cc0ff') + '<span class="n" id="nRat" style="color:#6cc0ff"></span>';
  $('bHammer').innerHTML = ico('star') + '<span><b>Sky Hammer</b><small id="hamV">0%</small></span>';
  $('tools').innerHTML = TOOLS.map(t => `<button class="sq" id="t_${t[0]}" aria-label="${t[0]}">${ico(t[1], t[2])}</button>`).join('');
  $('slots').innerHTML = [0, 1, 2].map(i => `<button class="sq" id="s_${i}" aria-label="Build slot ${i + 1}"></button>`).join('');
  const press = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audioInit(); fn(e); });
  press('bBag', () => openBag()); press('bPause', () => openPause()); press('bRot', () => { camYawT += Math.PI / 4; });
  press('bDyn', () => { if (!paused) throwDynamite(); }); press('bRation', () => { if (!paused) eatRation(); }); press('bHammer', () => { if (!paused) skyHammer(); });
  press('ctx', () => { if (!paused) doInteract(); });
  for (const t of TOOLS) press('t_' + t[0], () => { P.mode = t[0]; task = null; });
  for (let i = 0; i < 3; i++) press('s_' + i, () => { if (P.mode === 'build' && P.slot === i) openBag(); else { P.mode = 'build'; P.slot = i; task = null; } });
  const hold = (id, key) => { const el = $(id), up = () => { input[key] = false; el.classList.remove('held'); }; el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audioInit(); try { el.setPointerCapture(e.pointerId); } catch (x) { } input[key] = true; el.classList.add('held'); }); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up); };
  hold('bJump', 'jump'); hold('bUse', 'use');
  $('mini').addEventListener('pointerdown', e => { e.preventDefault(); camYawT += Math.PI / 4; });
  onQuest();
}
function hudUpdate() {
  const hp = Math.max(0, Math.ceil(P.hp)), en = Math.floor(P.en);
  setT('hpV', hp); setT('enV', en); setT('sLvl', P.lvl); setT('sCoin', P.coins); setT('sDepth', (P.depth | 0) + 'm'); setT('nDyn', P.dyn); setT('nRat', P.ration); setT('hamV', (P.charge | 0) + '%');
  const hf = (P.hp / P.maxHp).toFixed(3), ef = (P.en / P.maxEn).toFixed(3);
  if (hudC.hf !== hf) { hudC.hf = hf; $('hpF').style.transform = `scaleX(${Math.max(0, hf)})`; } if (hudC.ef !== ef) { hudC.ef = ef; $('enF').style.transform = `scaleX(${ef})`; }
  const rdy = P.charge >= 100; if (hudC.rdy !== rdy) { hudC.rdy = rdy; $('bHammer').classList.toggle('ready', rdy); }
  const key = P.mode + P.slot + '|' + P.slots.map(s => s + ':' + P.inv[s]).join(',') + P.mounted;
  if (hudC.key !== key) {
    hudC.key = key;
    for (const t of TOOLS) $('t_' + t[0]).classList.toggle('on', P.mode === t[0]);
    for (let i = 0; i < 3; i++) { const el = $('s_' + i), id = P.slots[i]; el.innerHTML = cube(id) + `<span class="n">${P.inv[id]}</span>`; el.classList.toggle('on', P.mode === 'build' && P.slot === i); el.classList.toggle('empty', P.inv[id] <= 0); }
    $('bUse').innerHTML = P.mounted ? ico('drill') : P.mode === 'build' ? cube(P.slots[P.slot]) : ico(P.mode);
  }
  const it = paused ? null : interactable(), lab = it ? it.label : '';
  if (hudC.ctx !== lab) { hudC.ctx = lab; $('ctx').hidden = !lab; $('ctx').textContent = lab; }
}

/* ---- modals ---- */
function showCard(html) { $('card').innerHTML = html; $('modal').hidden = false; paused = true; input.jx = input.jy = 0; input.use = input.jump = false; input.hold = null; $('joy').hidden = true; }
function closeModal() { $('modal').hidden = true; paused = false; hudC.key = ''; }
const HOW = `<div class="how"><b>Drag</b><span>anywhere to walk</span><b>Tap a block</b><span>dig it, or build on it</span><b>Hold</b><span>to keep digging where you point</span><b>USE button</b><span>dig or build straight ahead</span><b>Two fingers</b><span>turn the camera, pinch to zoom</span><b>Keyboard</b><span>WASD, Space, mouse, Q/E turn, 1-6 tools, G dynamite, F interact</span></div>`;
function openTitle() {
  showCard(`<h1>Deepmere</h1><p class="tag">An island you can dig up, blow apart and rebuild, one block at a time.</p>${HOW}
  <button class="btn go" id="mStart">${hadSave ? 'Keep digging' : 'Start digging'}</button>${hadSave ? '<button class="btn" id="mNew">New island</button>' : ''}`);
  $('mStart').onclick = () => { audioInit(); started = true; $('hud').hidden = false; closeModal(); if (!hadSave) toast('Welcome to Deepmere Camp. Pick a tool and start digging!', 'gold'); };
  if (hadSave) $('mNew').onclick = () => confirmNew(openTitle);
}
function confirmNew(back) {
  showCard(`<h2>New island?</h2><p>This replaces your current island, tools and coins with a fresh one. It cannot be undone.</p><button class="btn warn" id="mYes">Start a new island</button><button class="btn" id="mNo">Keep my island</button>`);
  $('mNo').onclick = back;
  $('mYes').onclick = () => { $('card').innerHTML = '<h1>Deepmere</h1><p class="tag">Carving a new island…</p>'; setTimeout(() => { newGame((Math.random() * 1e9) | 0); spawnCritters(); initMap(); hadSave = false; saveGame(); audioInit(); started = true; $('hud').hidden = false; onQuest(); closeModal(); }, 40); };
}
function openPause() {
  showCard(`<h2>Paused <button class="x" id="mX" aria-label="Close">✕</button></h2>${HOW}
  <button class="btn go" id="mRes">Back to the island</button><button class="btn" id="mSnd">Sound: ${soundOn ? 'on' : 'off'}</button><button class="btn" id="mSave">Save now</button><button class="btn warn" id="mNew">New island</button>`);
  $('mX').onclick = $('mRes').onclick = closeModal; $('mSnd').onclick = () => { soundOn = !soundOn; openPause(); };
  $('mSave').onclick = () => { $('mSave').textContent = saveGame() ? 'Saved on this device' : 'Could not save - storage is blocked here'; }; $('mNew').onclick = () => confirmNew(openPause);
}
function openBag() {
  const tile = id => `<button class="tile${P.slots[P.slot] === id ? ' on' : ''}" data-id="${id}">${cube(id)}<b>${BL[id].name}</b><small>${P.inv[id]}${BL[id].val ? ' · ' + BL[id].val + 'c' : ''}</small></button>`;
  const blocks = [], ores = []; for (let id = 1; id < NB; id++) if (P.inv[id] > 0) (BL[id].ore ? ores : blocks).push(id);
  showCard(`<h2>Bag <button class="x" id="mX" aria-label="Close">✕</button></h2>
  <h3>BLOCKS · TAP ONE TO BUILD WITH IT (SLOT ${P.slot + 1})</h3><div class="grid">${blocks.map(tile).join('') || '<p>No blocks yet. Dig some up.</p>'}</div>
  <h3>ORE · WORTH ${oreValue()} COINS AT THE MERCHANT</h3><div class="grid">${ores.map(tile).join('') || '<p>None yet. Ore is the speckled rock underground.</p>'}</div>
  <h3>GEAR</h3><p>${PICKS[P.pick].n} · Drill Mk ${P.drill + 1} · ${P.dyn} dynamite · ${P.ration} rations${P.jet ? ' · Jetpack' : ''}</p>`);
  $('mX').onclick = closeModal;
  for (const el of $('card').querySelectorAll('.tile')) el.onclick = () => { P.slots[P.slot] = +el.dataset.id; P.mode = 'build'; closeModal(); };
}
openShop = who => {
  const items = shopItems(who);
  showCard(`<h2>${who === 'merchant' ? 'Merchant' : 'Smith'} <span class="coins">${P.coins} coins</span><button class="x" id="mX" aria-label="Close">✕</button></h2>` + items.map(it =>
    `<div class="item"><div><b>${it.name}</b><small>${it.desc}</small></div><button data-id="${it.id}" class="${it.owned || (it.cost && P.coins < it.cost) || (it.id === 'sell' && !it.gain) ? 'off' : ''}">${it.owned ? 'Owned' : it.id === 'sell' ? 'Sell +' + it.gain : it.cost + ' coins'}</button></div>`).join(''));
  $('mX').onclick = closeModal;
  for (const el of $('card').querySelectorAll('.item button')) el.onclick = () => { buy(who, el.dataset.id); openShop(who); };
};

/* ---- input ---- */
const ptrs = new Map(); let joyId = null, holdId = null;
function canvasXY(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function setHold(p) { holdId = p.id; input.hold = { x: p.x, y: p.y }; }
function endPtr(id) {
  if (joyId === id) { joyId = null; input.jx = input.jy = 0; $('joy').hidden = true; }
  if (holdId === id) { holdId = null; input.hold = null; }
  ptrs.delete(id);
}
function initInput() {
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); audioInit(); if (paused) return; try { cv.setPointerCapture(e.pointerId); } catch (x) { }
    const [x, y] = canvasXY(e), now = performance.now(), p = { id: e.pointerId, mode: 'cand', sx: x, sy: y, x, y, t0: now, mouse: e.pointerType === 'mouse' };
    if (p.mouse) { if (e.button !== 0) p.mode = 'cam'; else { p.mode = 'hold'; setHold(p); } }
    else for (const q of ptrs.values()) if (!q.mouse && (q.mode === 'cand' || q.mode === 'cam' || (q.mode === 'joy' && now - q.t0 < 260))) { if (q.mode === 'joy') { joyId = null; input.jx = input.jy = 0; $('joy').hidden = true; } q.mode = 'cam'; p.mode = 'cam'; }
    ptrs.set(p.id, p);
  });
  cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return; const [x, y] = canvasXY(e), dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
    if (p.mode === 'cand' && Math.hypot(x - p.sx, y - p.sy) > 13) { if (joyId === null) { p.mode = 'joy'; joyId = p.id; const j = $('joy'); j.hidden = false; j.style.left = p.sx + 'px'; j.style.top = p.sy + 'px'; } else { p.mode = 'hold'; setHold(p); } }
    if (p.mode === 'joy') { let jx = (x - p.sx) / 52, jy = (y - p.sy) / 52; const l = Math.hypot(jx, jy); if (l > 1) { jx /= l; jy /= l; } input.jx = jx; input.jy = -jy; $('joy').firstChild.style.transform = `translate(${jx * 34}px,${jy * 34}px)`; }
    else if (p.mode === 'hold' && holdId === p.id) { input.hold.x = x; input.hold.y = y; }
    else if (p.mode === 'cam') {
      const cams = [...ptrs.values()].filter(q => q.mode === 'cam');
      if (cams.length >= 2) { const o = cams[0] === p ? cams[1] : cams[0], d1 = Math.hypot(x - o.x, y - o.y), d0 = Math.hypot(x - dx - o.x, y - dy - o.y); if (d0 > 10) cam.dist = clamp(cam.dist * d0 / d1, 10, 62); camYawT -= dx * .004; cam.yaw -= dx * .004; camPitchOff = clamp(camPitchOff + dy * .003, -.45, .5); }
      else { camYawT -= dx * .008; cam.yaw -= dx * .008; camPitchOff = clamp(camPitchOff + dy * .005, -.45, .5); }
    }
  });
  const up = e => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dur = performance.now() - p.t0;
    if (!paused && e.type === 'pointerup' && (p.mode === 'cand' || (p.mouse && p.mode === 'hold' && dur < 240 && Math.hypot(p.x - p.sx, p.y - p.sy) < 8))) { endPtr(p.id); tapWorld(p.sx, p.sy); return; }
    endPtr(p.id);
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : .9), 10, 62); }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.repeat) return; input.keys[e.code] = true; audioInit();
    if (e.code === 'Escape') { if ($('modal').hidden) openPause(); else if (started) closeModal(); return; }
    if (paused) return;
    const d = e.code.startsWith('Digit') ? +e.code.slice(5) : 0;
    if (d >= 1 && d <= 3) { P.mode = TOOLS[d - 1][0]; task = null; } else if (d >= 4 && d <= 6) { P.mode = 'build'; P.slot = d - 4; task = null; }
    else if (e.code === 'KeyG') throwDynamite(); else if (e.code === 'KeyR') eatRation(); else if (e.code === 'KeyH') skyHammer(); else if (e.code === 'KeyF') doInteract(); else if (e.code === 'KeyB') openBag();
    else if (e.code === 'KeyQ') camYawT += Math.PI / 4; else if (e.code === 'KeyE') camYawT -= Math.PI / 4; else if (e.code === 'Enter') input.use = true;
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', e => { input.keys[e.code] = false; if (e.code === 'Enter') input.use = false; });
  window.addEventListener('blur', () => { input.keys = {}; input.use = input.jump = false; });
}
function promoteHolds() { const now = performance.now(); for (const p of ptrs.values()) if (p.mode === 'cand' && now - p.t0 > 250 && holdId === null) { p.mode = 'hold'; setHold(p); } }
