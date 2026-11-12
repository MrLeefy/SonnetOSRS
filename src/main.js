/* main.js - boot, main loop, and the glue between the simulation, renderer, HUD, input and audio */
import * as THREE from 'three';
import { TICK, clamp } from './data.js';
import { cheb, ZONE_NAMES, SPAWN } from './world.js';
import { Game, renderPos } from './sim.js';
import { ITEMS, TIERS, WEAPON_SLOT, levelOf } from './items.js';
import { loadAssets } from './assets.js';
import { World3D } from './gfx/scene.js';
import { Character } from './gfx/character.js';
import { FX, STYLE_COLOR } from './gfx/fx.js';
import { renderIcons } from './gfx/icons.js';
import { Nodes } from './gfx/nodes.js';
import { nodes as WORLD_NODES } from './world.js';
import { HUD } from './ui.js';
import { initInput } from './input.js';
import { Sound } from './audio.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem('hm_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hm_' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const coarse = matchMedia('(pointer: coarse)').matches;
const settings = { quality: store.get('quality', null), sound: store.get('sound', true), haptics: store.get('haptics', true) };
let autoQuality = !settings.quality; if (!settings.quality) settings.quality = coarse ? 'med' : 'high';
const $ = id => document.getElementById(id);

async function boot() {
  await loadAssets(f => { $('lfill').style.width = Math.round(f * 85) + '%'; });
  const canvas = $('c'), world = new World3D(canvas, settings.quality), fx = new FX(world.scene);
  const cam = { yaw: 0, pitch: 0.82, dist: 13, minDist: 6, maxDist: 26, x: SPAWN.x, z: SPAWN.y, shake: 0 };
  const nodeFx = new Nodes(world.scene, WORLD_NODES.map((n, i) => Object.assign({ id: i, depleted: false }, n)), m => world.seeThrough(m));
  const views = new Map(), timers = [], tmp = new THREE.Vector3(), rp = { x: 0, y: 0 };
  let game = null, mode = 'title', acc = 0, last = performance.now(), deadTimer = 0, fpsT = 0, fpsN = 0, mmT = 0, saveT = 0, shopNpc = null;
  let save = store.get('save2', null);
  Sound.setEnabled(settings.sound);
  const buzz = ms => { if (settings.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } };
  const later = (t, fn) => timers.push({ t, fn });
  const volAt = a => { const p = game.player; if (!p || mode === 'title') return 0; if (a === p) return 1; return clamp(1 - cheb(a.x, a.y, p.x, p.y) / 18, 0, 1) * 0.7; };
  const gearTints = a => { const o = {}; for (const st in WEAPON_SLOT) o[st] = TIERS[a.isPlayer ? ITEMS[a.eq[WEAPON_SLOT[st]]].tier : a.tier || 0].c; return o; };

  /* ---------------- views ---------------- */
  function addView(a) {
    if (views.has(a.id)) return views.get(a.id);
    const ch = new Character(a.look, a.scale || 1), v = { a, ch, pos: new THREE.Vector3(a.x + 0.5, 0, a.y + 0.5), chest: new THREE.Vector3(a.x + 0.5, 1, a.y + 0.5), h: 1.75 * (a.scale || 1) };
    ch.yaw = a.face; if (a.kind === 'player' || a.kind === 'rival') ch.setGear(gearTints(a)); world.scene.add(ch.root); views.set(a.id, v); return v;
  }
  function dropView(id) { const v = views.get(id); if (!v) return; world.scene.remove(v.ch.root); v.ch.dispose(); views.delete(id); hud.removePlate(id); }
  function screenOf(v3) { tmp.copy(v3).project(world.camera); return tmp.z < 1 && tmp.z > -1 ? { x: (tmp.x * 0.5 + 0.5) * world.w, y: (-tmp.y * 0.5 + 0.5) * world.h } : null; }
  function splatAt(a, text, cls) { const v = views.get(a.id); if (!v || mode === 'title') return; tmp.copy(v.pos); tmp.y = v.h; const s = screenOf(tmp); if (s && s.x > -40 && s.x < world.w + 40) hud.splat(s.x, s.y, text, cls); }

  /* ---------------- simulation events -> sights and sounds ---------------- */
  function onEvent(type, d) {
    const p = game.player;
    if (type === 'spawn') { const v = addView(d.a); v.ch.age = 0; fx.burst(d.a.x + 0.5, 1, d.a.y + 0.5, d.a.kind === 'monster' ? 0x9cff9a : 0xbfe6ff, 22, 2.2, 0.3, 0.7, -1, 1.5); Sound.play('spawn', volAt(d.a) * 0.6); }
    else if (type === 'remove') dropView(d.a.id);
    else if (type === 'attack') {
      const v = views.get(d.a.id), tv = views.get(d.t.id); if (!v || !tv) return; const vol = volAt(d.a);
      v.ch.play(d.spec ? (d.style === 'melee' ? 'spin' : d.style === 'magic' ? 'magicspec' : d.style) : d.style);
      if (d.spec) { fx.burst(v.pos.x, 1.2, v.pos.z, 0xffd76a, 26, 3, 0.34, 0.6, 0, 1); Sound.play('spec', vol); }
      if (d.style === 'melee') Sound.play('swing', vol);
      else {
        const rel = d.style === 'ranged' ? 0.3 : 0.38, fly = Math.max(0.16, d.delay * TICK - rel);
        later(rel, () => { if (!views.has(d.a.id)) return; tmp.copy(v.pos); tmp.y = d.style === 'ranged' ? 0.95 * v.ch.size : 1.5; fx.shoot(d.style, tmp, tv.chest, fly, !!d.spec); Sound.play(d.style === 'ranged' ? 'bow' : 'cast', vol); });
      }
    } else if (type === 'hit') {
      const show = () => {
        const tv = views.get(d.t.id); if (!tv) return; const vol = Math.max(volAt(d.t), d.src === p ? 1 : 0), c = tv.chest, mine = d.t === p;
        if (d.dmg > 0) {
          splatAt(d.t, d.dmg, mine ? 'hit me' : (d.dmg >= 25 ? 'hit big' : 'hit'));
          tv.ch.flash = 1; if (!tv.ch.act) tv.ch.play(d.warded ? 'block' : 'hurt');
          fx.burst(c.x, c.y, c.z, d.style === 'magic' ? 0x8fdcff : d.style === 'ranged' ? 0xffe9a8 : 0xffb070, 8 + Math.min(18, d.dmg), 3.2, 0.24, 0.45, 9, 1.5);
          Sound.play(d.style === 'melee' ? 'hitMelee' : d.style === 'ranged' ? 'hitRanged' : 'hitMagic', vol);
          if (d.warded) { fx.bubble(c, STYLE_COLOR[d.style]); Sound.play('ward', vol); }
          if (mine) { hud.hurtFlash(); cam.shake = Math.min(0.5, 0.12 + d.dmg * 0.012); buzz(Math.min(60, 15 + d.dmg * 1.5)); Sound.play('hurt', 0.7); }
        } else { splatAt(d.t, 'miss', 'miss'); Sound.play('miss', vol); }
        if (d.froze) { fx.burst(c.x, 0.5, c.z, 0xbfeaff, 30, 3, 0.3, 0.8, 5, 2); Sound.play('freeze', vol); if (mine) hud.toast('Rooted! Switch to Crossbow or Staff and keep fighting.'); }
      };
      if (d.style === 'melee') later(d.late ? 0.5 : 0.3, show); else show();
    } else if (type === 'eat' || type === 'tonic') {
      const v = views.get(d.a.id); if (!v) return; v.ch.play('eat');
      if (type === 'eat') { splatAt(d.a, '+' + d.heal, 'heal'); fx.burst(v.pos.x, 1.2, v.pos.z, 0x73e079, 12, 1.2, 0.22, 0.7, -1.5, 0.6); } else fx.burst(v.pos.x, 1.2, v.pos.z, 0x6ec8ff, 14, 1.2, 0.22, 0.7, -1.5, 0.6);
      Sound.play(type, d.a === p ? 1 : volAt(d.a) * 0.4);
    } else if (type === 'death') {
      const v = views.get(d.a.id); if (v) fx.burst(v.pos.x, 1, v.pos.z, 0xff5a48, 30, 3.5, 0.3, 0.8, 8, 2);
      Sound.play('death', Math.max(volAt(d.a), d.killer === p ? 1 : 0));
      if (mode !== 'title' && (d.a.kind !== 'monster' || d.killer === p) && volAt(d.a) > 0) hud.feed(`<b>${d.killer ? esc(d.killer.name) : '?'}</b> defeated <i>${esc(d.a.name)}</i>`);
      if (p && d.killer === p && d.a !== p) {
        const pv = views.get(p.id); if (pv && !pv.ch.act) pv.ch.play('cheer');
        if (d.a.kind === 'rival' || d.a.boss) { hud.banner(`${d.a.name.toUpperCase()} DEFEATED`, d.a.boss ? 'THE BARROW IS QUIET... FOR NOW' : game.streak > 1 ? `STREAK x${game.streak}` : 'LOOT THE CHEST'); Sound.play('kill'); buzz([30, 40, 60]); }
      }
      if (d.a === p) { deadTimer = 1.6; buzz(200); cam.shake = 0.6; hud.closePanel(); }
    } else if (type === 'stance') { const v = views.get(d.a.id); if (v) fx.burst(v.pos.x, 1.1, v.pos.z, STYLE_COLOR[d.a.stance], 10, 1.8, 0.22, 0.4, 0, 0.5); if (d.a === p) Sound.play('stance'); }
    else if (type === 'ward') { if (d.a === p) Sound.play('wardUp', d.a.ward ? 1 : 0.5); }
    else if (type === 'spec') { if (d.a === p && p.specArmed) Sound.play('spec', 0.6); }
    else if (type === 'thaw') { fx.burst(d.a.x + 0.5, 0.5, d.a.y + 0.5, 0xbfeaff, 14, 2.5, 0.24, 0.6, 6, 1.5); }
    else if (type === 'pickup') { fx.burst(d.x + 0.5, 0.6, d.y + 0.5, 0xffd76a, 24, 2.4, 0.28, 0.7, -1, 1.5); Sound.play('pickup'); hud.toast('Looted: ' + d.text); buzz(15); const v = views.get(p.id); if (v && !v.ch.act) v.ch.play('pickup'); }
    else if (type === 'loot') fx.syncLoot(game.loot);
    else if (type === 'node') nodeFx.sync(d.n);
    else if (type === 'swing') { const v = views.get(d.a.id); if (v) v.ch.play(d.n.type === 'fish' ? 'pickup' : d.n.type === 'fire' ? 'eat' : 'melee'); Sound.play(d.n.type === 'tree' || d.n.type === 'rock' ? 'swing' : 'ui', 0.6);
      if (d.n.type === 'tree' || d.n.type === 'rock') later(0.3, () => { fx.burst(d.n.x + 0.5, 1, d.n.y + 0.5, d.n.type === 'tree' ? 0xc9a36a : 0xd9d2c4, 8, 2.2, 0.2, 0.45, 9, 1.2); Sound.play('hitRanged', 0.5); }); else if (d.n.type === 'fish') fx.burst(d.n.x + 0.5, -0.3, d.n.y + 0.5, 0xdff6ff, 6, 1.5, 0.18, 0.5, 6, 2); }
    else if (type === 'gather') { if (d.item) { splatAt(d.a, '+1 ' + ITEMS[d.item].name, 'heal'); Sound.play('pickup', 0.7); buzz(10); } else { hud.toast(d.text); Sound.play('deny'); } }
    else if (type === 'skill') { hud.banner(d.name.toUpperCase() + ' ' + d.level, 'SKILL LEVEL UP'); Sound.play('kill'); }
    else if (type === 'task') { hud.banner('TASK COMPLETE', `${d.task.t.toUpperCase()}  +${d.task.r} COINS`); Sound.play('kill'); document.getElementById('btn-bag').classList.add('hasnew'); }
    else if (type === 'equip') { const v = views.get(p.id); if (v) v.ch.setGear(gearTints(p)); Sound.play('stance'); hud.toast('Equipped ' + ITEMS[d.id].name); }
    else if (type === 'trade') Sound.play('pickup', 0.6);
    else if (type === 'level') { hud.banner('LEVEL ' + d.level, 'MAX HEALTH ' + p.maxHp); Sound.play('kill'); const v = views.get(p.id); if (v) fx.burst(v.pos.x, 1, v.pos.z, 0xffd76a, 40, 3, 0.3, 1, -2, 2); }
    else if (type === 'interact') { shopNpc = d.npc; if (d.npc.npc === 'banker') hud.openPanel('bank'); else hud.openPanel('shop', d.npc.npc === 'smith' ? 'smith' : 'market'); Sound.play('ui'); }
    else if (type === 'zone') {
      if (!d.from || mode !== 'play') return;
      if (d.zone === 'wilds') { hud.banner('THE ASHEN WILDS', 'PVP - YOU DROP COINS AND SUPPLIES IF YOU FALL'); Sound.play('deny'); buzz([20, 30, 20]); }
      else if (d.zone === 'town') { hud.banner('HOLLOWMERE', 'SAFE ZONE'); Sound.play('wardUp'); }
      else if (d.zone === 'grave') hud.banner('BARROW YARD', 'THE DEAD DO NOT REST HERE');
    }
    else if (type === 'msg') { if (mode === 'play') { hud.toast(d.text); if (!d.soft) Sound.play('deny'); } }
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function newGame(opts) {
    for (const id of Array.from(views.keys())) dropView(id);
    timers.length = 0; hud.cache = {}; acc = 0; deadTimer = 0;
    game = new Game(opts); game.on(onEvent); fx.syncLoot(game.loot); nodeFx.syncAll(game.nodes);
    for (const a of game.actors) addView(a);
    window.__hm = { game, cam, views, world, hud };
  }
  const persist = () => { if (game && game.player) { save = game.save; store.set('save2', save); game.dirty = false; } };

  /* ---------------- player actions ---------------- */
  const playing = () => mode === 'play' && game.player && !game.player.dead;
  function tapWorld(x, y) {
    if (!playing()) return; const p = game.player; if (hud.mode) hud.closePanel();
    let bestA = null, bd = 1e9;
    for (const v of views.values()) {
      const a = v.a; if (a === p || a.dead) continue;
      tmp.copy(v.pos); const f = screenOf(tmp); tmp.copy(v.pos); tmp.y = v.h; const h = screenOf(tmp); if (!f || !h) continue;
      const hh = Math.max(30, f.y - h.y), rad = Math.max(coarse ? 30 : 20, hh * 0.5), cx = (f.x + h.x) / 2, cy = (f.y + h.y) / 2;
      if (Math.abs(x - cx) < rad && y > h.y - rad * 0.6 && y < f.y + rad * 0.5) { const dd = Math.hypot(x - cx, y - cy); if (dd < bd) { bd = dd; bestA = a; } }
    }
    if (bestA) { game.cmdAttack(bestA); const v = views.get(bestA.id); fx.marker(v.pos.x, v.pos.z, bestA.kind === 'npc' ? 0x6ee0ff : 0xff4433); Sound.play('ui'); buzz(8); return; }
    // resource nodes: trees, ore, fishing ripples, the campfire
    let bestN = null; bd = coarse ? 46 : 34;
    for (const n of game.nodes) { if (Math.abs(n.x - p.x) + Math.abs(n.y - p.y) > 40) continue; tmp.set(n.x + 0.5, n.type === 'tree' ? 1.6 : n.type === 'fish' ? -0.3 : 0.6, n.y + 0.5); const s = screenOf(tmp); if (!s) continue; const dd = Math.hypot(x - s.x, (y - s.y) * (n.type === 'tree' ? 0.5 : 1)); if (dd < bd) { bd = dd; bestN = n; } }
    if (bestN) { game.cmdGather(bestN); fx.marker(bestN.x + 0.5, bestN.y + 0.5, 0x7fe07a); Sound.play('ui'); buzz(8); return; }
    tmp.set(x / world.w * 2 - 1, -(y / world.h) * 2 + 1, 0.5).unproject(world.camera).sub(world.camera.position).normalize();
    if (tmp.y > -0.02) return; const t = -world.camera.position.y / tmp.y, gx = world.camera.position.x + tmp.x * t, gz = world.camera.position.z + tmp.z * t;
    if (Math.hypot(gx - p.x, gz - p.y) > 45) return;
    game.cmdMove(Math.floor(gx), Math.floor(gz)); const dst = p.path.length ? p.path[p.path.length - 1] : p;
    fx.marker(dst.x + 0.5, dst.y + 0.5, 0xffe066); Sound.play('ui', 0.5);
  }
  function cycleTarget() {
    if (!playing()) return; const p = game.player;
    const list = game.actors.filter(a => a !== p && !a.dead && a.kind !== 'npc' && !game.safe(a) && cheb(a.x, a.y, p.x, p.y) <= 16).sort((a, b) => cheb(a.x, a.y, p.x, p.y) - cheb(b.x, b.y, p.x, p.y));
    if (!list.length) { hud.toast('No foes nearby.'); return; }
    const t = list[(list.indexOf(p.target) + 1) % Math.min(list.length, 4)]; game.cmdAttack(t); const v = views.get(t.id); if (v) fx.marker(v.pos.x, v.pos.z, 0xff4433); Sound.play('ui'); buzz(8);
  }
  const act = {
    stance: s => { if (playing()) { game.setStance(game.player, s); buzz(8); } },
    ward: s => { if (playing()) { game.setWard(game.player, s); buzz(8); } },
    eat: () => { if (playing()) { const p = game.player; if (!game.eat(p)) { Sound.play('deny'); hud.toast(p.food <= 0 ? 'No food - buy some at the Market.' : p.hp >= p.maxHp ? 'Already at full health.' : 'Still chewing...'); } } },
    tonic: () => { if (playing()) { const p = game.player; if (!game.tonic(p)) { Sound.play('deny'); hud.toast(p.tonics <= 0 ? 'No tonics - the Market sells them.' : p.focus >= 100 ? 'Focus is already full.' : 'Not yet...'); } } },
    spec: () => { if (playing()) { game.toggleSpec(game.player); buzz(12); } },
    cycle: cycleTarget,
    useSlot: i => { if (playing()) game.useSlot(i); }, dropSlot: i => { if (playing()) game.dropSlot(i); },
    deposit: i => game.deposit(i), withdraw: id => game.withdraw(id), depositAll: () => { game.depositAll(); Sound.play('pickup', 0.6); }, coins: toBank => { game.moveCoins(toBank); Sound.play('pickup', 0.6); },
    buy: id => game.buy(id), sell: i => game.sell(i), forge: id => game.forge(id),
    pause: () => { if (mode === 'play') { mode = 'pause'; hud.setOptions(settings); hud.show('pause'); Sound.play('ui'); persist(); } },
    resume: () => { if (mode === 'pause') { mode = 'play'; hud.show('game'); last = performance.now(); } },
    play: () => { Sound.unlock(); newGame({ save: save || undefined }); mode = 'play'; hud.show('game'); const p = game.player; cam.yaw = 0; cam.pitch = 0.82; cam.dist = 13; cam.x = p.x + 0.5; cam.z = p.y + 0.5; Sound.play('spawn');
      hud.toast(game.save.kills + game.save.deaths === 0 ? 'Welcome to Hollowmere. The Banker, Smith and Merchant are nearby - tap them.' : 'Welcome back.'); persist(); },
    newChar: () => { save = null; store.set('save2', null); hud.show('title', {}); },
    respawn: () => { if (mode === 'dead') { game.respawnPlayer(); mode = 'play'; hud.show('game'); hud.cache = {}; persist(); } },
    quit: () => { persist(); newGame({ spectate: true }); mode = 'title'; hud.show('title', save ? { level: levelOf(save.xp), coins: save.coins + save.bank.coins } : {}); },
    quality: q => { settings.quality = q; autoQuality = false; store.set('quality', q); world.setQuality(q); hud.setOptions(settings); },
    sound: () => { settings.sound = !settings.sound; store.set('sound', settings.sound); Sound.setEnabled(settings.sound); hud.setOptions(settings); },
    haptics: () => { settings.haptics = !settings.haptics; store.set('haptics', settings.haptics); hud.setOptions(settings); buzz(20); }
  };
  const hud = new HUD(act);
  $('lfill').style.width = '92%'; await new Promise(r => setTimeout(r, 0));
  hud.icons = renderIcons(world.renderer);
  const KEYS = { '1': () => act.stance('melee'), '2': () => act.stance('ranged'), '3': () => act.stance('magic'), q: () => act.ward('melee'), w: () => act.ward('ranged'), e: () => act.ward('magic'),
    f: act.eat, r: act.tonic, ' ': act.spec, Tab: act.cycle, b: () => (hud.mode ? hud.closePanel() : hud.openPanel('bag')), Escape: () => (hud.mode ? hud.closePanel() : mode === 'pause' ? act.resume() : act.pause()), p: () => (mode === 'pause' ? act.resume() : act.pause()) };
  const input = initInput(canvas, cam, { tap: tapWorld, gesture: () => Sound.unlock(), key: k => { if (KEYS[k] && mode !== 'title') { KEYS[k](); return true; } return false; } });
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  addEventListener('resize', () => world.resize()); addEventListener('orientationchange', () => setTimeout(() => world.resize(), 250));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { act.pause(); persist(); Sound.suspend(); } else { Sound.resume(); last = performance.now(); } });
  addEventListener('pagehide', persist);

  newGame({ spectate: true }); hud.show('title', save ? { level: levelOf(save.xp), coins: save.coins + save.bank.coins } : {});
  $('loading').remove();

  /* ---------------- frame loop ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const running = mode !== 'pause';
    if (running) {
      acc += dt; let guard = 0; while (acc >= TICK && guard++ < 4) { game.step(); acc -= TICK; } if (acc >= TICK) acc = 0;
      for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { timers.splice(i, 1); t.fn(); } }
      if (deadTimer > 0) { deadTimer -= dt; if (deadTimer <= 0 && game.player && game.player.dead) { mode = 'dead'; const k = game.player.lastAttacker, L = game.lost || {};
        hud.show('dead', { by: k && k.name, streak: game.lastStreak || 0, kills: game.save.kills, best: game.save.best, lost: L.coins || L.items ? `You dropped ${L.coins} coins${L.items ? ' and your supplies' : ''}.` : 'You were carrying nothing of value.' }); persist(); } }
      saveT += dt; if (saveT > 3 && game.dirty) { saveT = 0; persist(); }
    }
    const frac = acc / TICK, p = game.player, sdt = running ? dt : 0;
    for (const v of views.values()) {
      const a = v.a; renderPos(a, frac, rp); v.pos.set(rp.x, 0, rp.y); v.chest.set(rp.x, a.dead ? 0.3 : 0.95 * v.ch.size, rp.y);
      if (Math.abs(rp.x - cam.x) + Math.abs(rp.y - cam.z) < 60) { v.ch.root.visible = true; v.ch.update(sdt, { x: rp.x, z: rp.y, face: a.face, dead: a.dead, frozen: a.frozen > 0, stance: a.stance }); } else v.ch.root.visible = false;
    }
    input.update(dt);
    if (mode === 'title') { cam.yaw += dt * 0.05; cam.pitch = 0.5; cam.dist = 30; cam.x = 48.5; cam.z = 66; }
    else if (p) { const pv = views.get(p.id); if (pv) { const k = 1 - Math.exp(-dt * 9); cam.x += (pv.pos.x - cam.x) * k; cam.z += (pv.pos.z - cam.z) * k; if (Math.abs(pv.pos.x - cam.x) > 20) { cam.x = pv.pos.x; cam.z = pv.pos.z; } } }
    cam.shake = Math.max(0, cam.shake - dt * 1.6);
    const chh = Math.cos(cam.pitch) * cam.dist, sh = cam.shake * cam.shake * 1.2, c3 = world.camera;
    c3.position.set(cam.x + Math.sin(cam.yaw) * chh + (Math.random() - 0.5) * sh, Math.sin(cam.pitch) * cam.dist + 1 + (Math.random() - 0.5) * sh, cam.z + Math.cos(cam.yaw) * chh + (Math.random() - 0.5) * sh);
    c3.lookAt(cam.x, 1.0, cam.z); c3.updateMatrixWorld();
    world.setHole(mode !== 'title' && p && views.get(p.id) ? views.get(p.id).chest : null);
    const tv = p && p.target && !p.target.dead ? views.get(p.target.id) : null;
    fx.targetRing.visible = !!tv; if (tv) { fx.targetRing.position.set(tv.pos.x, 0.09, tv.pos.z); }
    const pv = p && !p.dead && mode !== 'title' ? views.get(p.id) : null; fx.selfRing.visible = !!pv; if (pv) fx.selfRing.position.set(pv.pos.x, 0.09, pv.pos.z);
    if (running) {
      for (const v of views.values()) if (v.a.specArmed && Math.random() < dt * 20) fx.spark(v.pos.x + (Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 1.4, v.pos.z + (Math.random() - 0.5) * 0.6, 0, 1, 0, 1, 0.8, 0.3, 0.2, 0.5);
      fx.update(dt, world.time, world.h); nodeFx.update(world.time, fx, dt); tmp.set(cam.x, 0, cam.z); world.update(dt, tmp);
    }
    if (mode !== 'title') {
      for (const v of views.values()) {
        const a = v.a; let s = null; if (!a.dead && v.ch.root.visible) { tmp.copy(v.pos); tmp.y = v.h + 0.2; s = screenOf(tmp); }
        hud.setPlate(a, s ? s.x : 0, s ? s.y : 0, !!s, !!(p && p.target === a));
      }
      hud.update(game, dt);
      if (hud.mode && (hud.mode === 'bank' || hud.mode === 'shop') && shopNpc && cheb(p.x, p.y, shopNpc.x, shopNpc.y) > 4) hud.closePanel();
      mmT -= dt; if (mmT <= 0) { mmT = 0.12; hud.minimap(game, cam.yaw, a => views.get(a.id) ? views.get(a.id).pos : { x: a.x, z: a.y }, cam.x, cam.z); }
    }
    world.render();
    if (autoQuality && running) {
      fpsT += dt; fpsN++;
      if (fpsT >= 4) { const fps = fpsN / fpsT; fpsT = 0; fpsN = 0; if (fps < 30 && settings.quality !== 'low') { settings.quality = settings.quality === 'high' ? 'med' : 'low'; world.setQuality(settings.quality); } }
    }
  }
  requestAnimationFrame(frame);
}

boot().catch(err => {
  console.error(err); const f = document.getElementById('fatal'); f.classList.remove('hidden'); const l = document.getElementById('loading'); if (l) l.remove();
  f.textContent = 'Hollowmere could not start.\n\nThis game needs WebGL - try a current version of Chrome, Safari or Firefox.\n\n' + (err && err.message || err);
});
