'use strict';
/* ==========================================================================
   main.js  -  boot sequence, login screen, main loop
   ========================================================================== */
const App = {
  mode: 'load', progress: 0, status: 'Loading - please wait.', ctx: null, R: null, cam: null, loginStage: 0, user: 'Pk_Player', pass: '', field: 0, prev: 0, scale: 1, msg: '',
  logout() { this.mode = 'login'; this.loginStage = 0; G.dialog = null; UI.menu = null; },
  onDown(e) { loginDown(e); },
  onKey(e) { loginKey(e); }
};
const tick = () => new Promise(r => setTimeout(r, 0));

/* extra player loadouts (bank restock) */
LOADOUTS.pmelee = {
  eq: { head: 'rhelm', cape: 'firecape', neck: 'glory', weapon: 'whip', body: 'rbody', shield: 'rkite', legs: 'rlegs', hands: 'bgloves', feet: 'rboots' },
  inv: ['dds', 'gmaul', 'ags', 'dscim', 'supstr', 'supdef', 'prayer', 'prayer', 'prayer', 'restore', 'restore', 'shark*16']
};
LOADOUTS.pranged = {
  eq: { head: 'coif', cape: 'firecape', neck: 'glory', weapon: 'rcb', body: 'bdbody', legs: 'bdchaps', hands: 'bgloves', feet: 'rboots', ammo: 'dbolts:400' },
  inv: ['whip', 'rkite', 'ranging', 'prayer', 'prayer', 'prayer', 'restore', 'restore', 'shark*19']
};
LOADOUTS.pmage = {
  eq: { head: 'mhat', cape: 'firecape', neck: 'glory', weapon: 'ancstaff', body: 'mtop', legs: 'mbottom', hands: 'bgloves', feet: 'mboots' },
  inv: ['whip', 'dds', 'death:800', 'blood:600', 'water:1500', 'prayer', 'prayer', 'prayer', 'restore', 'restore', 'shark*16'], autocast: 'iceBarrage'
};

/* ---------------- loading screen (classic red bar) ---------------- */
function drawLoading(ctx) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2 + 6;
  if (Fonts.b12) { drawTextC(ctx, 'b12', 'RuneScape is loading - please wait...', cx, cy - 30, 0xffffff, false); }
  fillR(ctx, cx - 152, cy - 18, 304, 34, 0x8c1111); fillR(ctx, cx - 150, cy - 16, 300, 30, 0x000000);
  fillR(ctx, cx - 148, cy - 14, Math.round(296 * App.progress), 26, 0x8c1111);
  if (Fonts.b12) drawTextC(ctx, 'b12', App.status + ' ' + Math.round(App.progress * 100) + '%', cx, cy + 4, 0xffffff, false);
}
/* ---------------- login screen ---------------- */
let LOGIN_BG = null;
function buildLoginBg() {
  const p = new Pix(W, H); const r = mulberry32(3);
  noiseFill(p, 0, 0, W, H, 0x4a4a44, 6, 21);
  for (let row = 0; row < H / 26; row++) { const y = row * 26, off = (row & 1) ? 34 : 0; p.rect(0, y, W, 2, 0x2a2a26); for (let x = off; x < W + 68; x += 68) p.rect(x, y, 2, 26, 0x2a2a26); }
  // columns
  for (const cx of [130, 560]) { p.rect(cx, 0, 78, H, 0x6a6a64); for (let y = 0; y < H; y++) { for (let x = 0; x < 78; x++) { const t = x / 78; const c = 0x6a6a64 * 0 + rgb(clamp(90 + 40 * Math.sin(t * Math.PI) - (r() * 8) | 0, 0, 255), clamp(90 + 40 * Math.sin(t * Math.PI) | 0, 0, 255), clamp(84 + 40 * Math.sin(t * Math.PI) | 0, 0, 255)); p.set(cx + x, y, c); } } p.rect(cx - 8, 440, 94, 63, 0x4a4a46); }
  // torches
  for (const tx of [30, 705]) { p.rect(tx + 14, 300, 6, 180, 0x2a2a2a); p.ellipse(tx + 17, 300, 22, 10, 0x1a1a1a); for (let i = 0; i < 90; i++) { const fx = tx + 17 + Math.round((r() - 0.5) * 34 * (1 - i / 120)), fy = 296 - i * 1.3 * r() * 2; p.rect(fx, Math.round(fy), 3, 3, i < 40 ? 0xf0c030 : i < 70 ? 0xf08a20 : 0xc83c10); } }
  // vignette
  const q = p.canvas(); LOGIN_BG = q;
}
const LB = { boxX: 202, boxY: 190, boxW: 360, boxH: 200 };
function loginStoneBox(ctx, x, y, w, h) {
  fillR(ctx, x, y, w, h, 0x000000); fillR(ctx, x + 3, y + 3, w - 6, h - 6, 0x50504c);
  const rr = mulberry32(8); for (let i = 0; i < 900; i++) { const px = x + 4 + (rr() * (w - 8) | 0), py = y + 4 + (rr() * (h - 8) | 0); ctx.fillStyle = css(rr() < 0.5 ? 0x5e5e5a : 0x444440); ctx.fillRect(px, py, 2, 1); }
  frameR(ctx, x + 3, y + 3, w - 6, h - 6, 0x2a2a28); frameR(ctx, x + 4, y + 4, w - 8, h - 8, 0x6a6a66);
}
function loginBtn(ctx, x, y, w, h, label, hov) { fillR(ctx, x, y, w, h, 0x000000); fillR(ctx, x + 2, y + 2, w - 4, h - 4, hov ? 0x5c5c58 : 0x48484a); frameR(ctx, x + 2, y + 2, w - 4, h - 4, 0x6a6a6a); drawTextC(ctx, 'b12', label, x + w / 2, y + h / 2 + 5, 0xffffff, true); }
const LBTN = { newUser: { x: 232, y: 300, w: 148, h: 34 }, exist: { x: 384, y: 300, w: 148, h: 34 }, login: { x: 232, y: 336, w: 148, h: 34 }, cancel: { x: 384, y: 336, w: 148, h: 34 } };
function drawLogin(ctx) {
  if (!LOGIN_BG) buildLoginBg();
  ctx.drawImage(LOGIN_BG, 0, 0);
  // title (plain text; no logo)
  drawTextC(ctx, 'q16', 'RuneScape', W / 2, 90, 0xd8d8d0, true);
  loginStoneBox(ctx, LB.boxX, LB.boxY, LB.boxW, LB.boxH);
  const m = UI.mouse;
  if (App.loginStage === 0) {
    drawTextC(ctx, 'b12', 'Welcome to RuneScape', W / 2, 262, 0xffff00, true);
    loginBtn(ctx, LBTN.newUser.x, LBTN.newUser.y, LBTN.newUser.w, LBTN.newUser.h, 'New user', inRect(m.x, m.y, LBTN.newUser));
    loginBtn(ctx, LBTN.exist.x, LBTN.exist.y, LBTN.exist.w, LBTN.exist.h, 'Existing User', inRect(m.x, m.y, LBTN.exist));
    drawTextC(ctx, 'p11', 'Grand Exchange PvP - World 301', W / 2, 372, 0xc8c8c0, true);
  } else if (App.loginStage === 1) {
    drawTextC(ctx, 'b12', 'Welcome to RuneScape', W / 2, 232, 0xffff00, true);
    drawTextC(ctx, 'p11', App.msg || 'Enter your username & password.', W / 2, 252, 0xffffff, true);
    const blink = Math.floor(performance.now() / 500) % 2 ? '|' : '';
    drawText(ctx, 'b12', 'Username: ', 246, 278, 0xffffff, true); drawText(ctx, 'b12', App.user + (App.field === 0 ? blink : ''), 320, 278, 0xffff00, true);
    drawText(ctx, 'b12', 'Password: ', 246, 298, 0xffffff, true); drawText(ctx, 'b12', '*'.repeat(App.pass.length) + (App.field === 1 ? blink : ''), 320, 298, 0xffff00, true);
    loginBtn(ctx, LBTN.login.x, LBTN.login.y + 10, LBTN.login.w, LBTN.login.h, 'Login', inRect(m.x, m.y - 10, LBTN.login));
    loginBtn(ctx, LBTN.cancel.x, LBTN.cancel.y + 10, LBTN.cancel.w, LBTN.cancel.h, 'Cancel', inRect(m.x, m.y - 10, LBTN.cancel));
  } else {
    drawTextC(ctx, 'b12', 'Connecting to server...', W / 2, 270, 0xffff00, true); drawTextC(ctx, 'p11', 'Please wait...', W / 2, 290, 0xffffff, true);
  }
  ctx.drawImage(IC.cursor, m.x, m.y);
}
function loginDown(e) {
  const p = clientPos(e); UI.mouse = p; if (App.mode !== 'login') return;
  if (App.loginStage === 0) {
    if (inRect(p.x, p.y, LBTN.exist) || inRect(p.x, p.y, LBTN.newUser)) App.loginStage = 1;
  } else if (App.loginStage === 1) {
    if (inRect(p.x, p.y - 10, LBTN.login)) doLogin();
    else if (inRect(p.x, p.y - 10, LBTN.cancel)) App.loginStage = 0;
    else if (p.y > 266 && p.y < 286) App.field = 0; else if (p.y >= 286 && p.y < 304) App.field = 1;
  }
}
function loginKey(e) {
  if (App.mode !== 'login' || App.loginStage !== 1) return; const k = e.key;
  if (k === 'Enter') { doLogin(); return; } if (k === 'Tab') { App.field ^= 1; e.preventDefault(); return; }
  const f = App.field === 0 ? 'user' : 'pass';
  if (k === 'Backspace') App[f] = App[f].slice(0, -1); else if (k.length === 1 && App[f].length < 12) { App[f] += k; e.preventDefault(); }
}
function doLogin() {
  const nm = App.user.trim() || 'Pk_Player'; App.loginStage = 2;
  setTimeout(() => { startGame(nm); }, 700);
}

/* ---------------- game start ---------------- */
function startGame(name) {
  if (!App.gameInit) { initWorldState(); App.gameInit = true; }
  const pl = G.player; pl.name = name; respawnNow(pl);
  UI.tab = 3; UI.menu = null; G.dialog = null; UI.chatInput = '';
  G.msgs.length = 0; gameMsg('Welcome to RuneScape.');
  gameMsg('You are at the Grand Exchange, Varrock - a multi-combat PvP zone.', 'game');
  gameMsg('Right-click players to attack. Ice Barrage + special attacks win fights!');
  App.mode = 'game'; G.lastTick = performance.now(); pl.protectUntil = G.tick + 25; App.camSnap = true;
}
function respawnNow(a) {
  a.dead = false; a.hp = a.maxHp; a.pp = a.stats.pray; a.cur = Object.assign({}, a.stats); a.run = 100; a.spec = 100; a.frozen = 0; a.skull = 0; a.anim = null; a.prayers.clear(); a.overhead = null;
  const sp = spawnPoint(true); a.x = sp.x; a.y = sp.y; a.path.length = 0; a.target = null; a.seg.length = 0; a.splats.length = 0; applyLoadout(a, a.loadoutKind || 'main');
}
function initWorldState() {
  initLoS(); createPlayer(); createClerks(); G.player.loadoutKind = 'main'; UI.botCount = 0; setBotCount(6);
}

/* ---------------- window fitting ---------------- */
function fit() {
  const wrap = document.getElementById('wrap'); const dpr = window.devicePixelRatio || 1;
  let s = Math.min(innerWidth / W, innerHeight / H); s = Math.max(0.5, Math.min(s, 6));
  let sd = s * dpr; const r = Math.round(sd);
  if (Math.abs(sd - r) < 0.1 * dpr || UI.sharp) sd = UI.sharp && sd >= 1 ? Math.floor(sd) : (Math.abs(sd - r) < 0.1 * dpr ? r : sd);
  if (sd > s * dpr + 1e-6) sd = s * dpr; // snapping up must never push the page past the window
  s = sd / dpr; App.scale = s;
  const integer = sd === Math.floor(sd) && sd >= 1;
  // the 3D backing store is supersampled: nearest-neighbour only when each backing pixel covers a whole number of device pixels
  const g = sd / (App.R ? App.R.ss : 1);
  if (INP.canvas) INP.canvas.style.imageRendering = integer ? 'pixelated' : 'auto';
  if (App.glCanvas) App.glCanvas.style.imageRendering = g >= 1 && g === Math.floor(g) ? 'pixelated' : 'auto';
  wrap.style.transform = 'translate(' + Math.floor((innerWidth - W * s) / 2) + 'px,' + Math.floor((innerHeight - H * s) / 2) + 'px) scale(' + s + ')';
}

/* ---------------- camera follow ---------------- */
const CAM_POS_RATE = 9, CAM_ROT_RATE = 14; // damping rates per second (frame-rate independent)
/* eases the look-at point toward the player and yaw/pitch/dist toward their goals. A jump larger
   than a normal tick step (login, respawn) snaps instead of gliding across the map. */
function followCam(cam, dt, x, y, z) {
  const kp = 1 - Math.exp(-dt * CAM_POS_RATE), kr = 1 - Math.exp(-dt * CAM_ROT_RATE);
  const dx = x - cam.tx, dz = z - cam.tz;
  if (App.camSnap || dx * dx + dz * dz > 25) { App.camSnap = false; cam.tx = x; cam.ty = y; cam.tz = z; }
  else { cam.tx += dx * kp; cam.ty += (y - cam.ty) * kp; cam.tz += dz * kp; }
  cam.yaw += angDiff(cam.yaw, cam.yawG) * kr;
  cam.pitch += (cam.pitchG - cam.pitch) * kr;
  cam.dist += (cam.distG - cam.dist) * kr;
}

/* ---------------- main loop ---------------- */
function frame(t) {
  requestAnimationFrame(frame);
  const ctx = App.ctx; const dt = Math.min(0.1, (t - (App.prev || t)) / 1000); App.prev = t; G.now = t;
  if (App.mode === 'load') { drawLoading(ctx); return; }
  if (App.mode === 'login') { App.glCanvas.style.visibility = 'hidden'; drawLogin(ctx); return; }
  App.glCanvas.style.visibility = 'visible';
  // ticks: at most two per frame, and a long stall (hidden tab) resumes without replaying the missed ticks
  const lag = t - G.lastTick;
  if (lag > 1800 || lag < -1800) G.lastTick = t;
  for (let n = 0; n < 2 && t - G.lastTick >= TICK_MS; n++) { G.lastTick += TICK_MS; gameTick(); }
  if (t - G.lastTick >= TICK_MS) G.lastTick = t;
  const frac = clamp((t - G.lastTick) / TICK_MS, 0, 1);
  const cam = App.cam, pl = G.player;
  updateCameraKeys(dt);
  const rp = renderPos(pl, frac); const gh = groundH(rp[0], rp[1]);
  followCam(cam, dt, rp[0], gh + 0.6, -rp[1]);
  cam.update();
  drawDynamic(frac, dt, cam); updateScreenInfo(cam, frac);
  const R = App.R; R.begin(cam);
  for (const g of WORLD.statics) R.drawGPU(g);
  R.drawDynamic(DYN);
  R.setDepthWrite(false); R.drawDynamic(BLD); R.setDepthWrite(true);
  updateHover();
  drawUI(ctx, cam);
}

async function boot() {
  const ui = document.getElementById('ui'), glc = document.getElementById('gl');
  App.ctx = ui.getContext('2d'); App.ctx.imageSmoothingEnabled = false; App.glCanvas = glc; INP.canvas = ui; INP.glCanvas = glc;
  fit(); addEventListener('resize', fit); window.fitClient = fit;
  await initFonts(); requestAnimationFrame(frame);
  const steps = [
    ['Loading textures', () => { App.R = new Renderer(glc); App.R.fogCol = [0.02, 0.02, 0.02]; App.R.fogRange = [34, 62]; fit(); }],
    ['Constructing the Grand Exchange', () => buildWorld(App.R)],
    ['Preparing interface', () => { buildAllIcons(); buildFrame(); }],
    ['Loading items', () => { for (const id in ITEMS) itemIcon(id); }],
    ['Preparing camera', () => { App.cam = new Camera(); App.cam.yaw = 0; App.cam.pitch = 0.95; App.cam.dist = 17; App.cam.snap(); App.cam.floor = groundH; INP.cam = App.cam; }]
  ];
  for (let i = 0; i < steps.length; i++) { App.status = steps[i][0] + '.'; App.progress = i / steps.length; await tick(); await tick(); steps[i][1](); }
  App.progress = 1; App.status = 'Loaded'; await tick();
  ui.addEventListener('mousedown', onDown); addEventListener('mouseup', onUp); addEventListener('mousemove', onMove);
  ui.addEventListener('wheel', onWheel, { passive: false }); ui.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp);
  addEventListener('blur', releaseInput); document.addEventListener('visibilitychange', () => { if (document.hidden) releaseInput(); });
  ui.style.cursor = 'none';
  const q = new URLSearchParams(location.search);
  setTimeout(() => { App.mode = 'login'; if (q.get('auto')) { App.loginStage = 1; startGame(App.user); } }, 350);
}
boot().catch(err => { console.error(err); document.body.insertAdjacentHTML('beforeend', '<pre style="position:fixed;left:0;top:0;color:#f88;background:#200;padding:8px;z-index:9">' + (err && err.stack || err) + '</pre>'); });
