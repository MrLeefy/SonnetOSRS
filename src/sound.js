'use strict';
/* ==========================================================================
   sound.js  -  tiny WebAudio synth for combat/interface sound effects
   ========================================================================== */
const SND = { ctx: null, master: null, noise: null, last: {} };
function sndInit() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = SND.ctx = new AC(); SND.master = c.createGain(); SND.master.gain.value = 0.35; SND.master.connect(c.destination);
    const len = c.sampleRate * 0.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; SND.noise = buf;
  } catch (e) { SND.ctx = null; }
}
function sTone(freq, dur, type, vol, when, slideTo) {
  const c = SND.ctx, t = c.currentTime + (when || 0); const o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + dur + 0.02);
}
function sNoise(dur, vol, lo, hi, when) {
  const c = SND.ctx, t = c.currentTime + (when || 0); const s = c.createBufferSource(); s.buffer = SND.noise;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = (lo + hi) / 2; f.Q.value = 0.8;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(SND.master); s.start(t); s.stop(t + dur + 0.02);
}
const SFX = {
  slash() { sNoise(0.16, 0.5, 1800, 5000); sTone(420, 0.1, 'triangle', 0.1, 0, 200); },
  stab() { sNoise(0.1, 0.45, 2500, 6000); sTone(600, 0.08, 'triangle', 0.1, 0, 300); },
  crush() { sTone(110, 0.22, 'sine', 0.55, 0, 45); sNoise(0.08, 0.5, 200, 900); },
  bow() { sTone(520, 0.14, 'sawtooth', 0.12, 0, 160); sNoise(0.09, 0.3, 3000, 7000); },
  cast() { sTone(280, 0.32, 'sine', 0.22, 0, 900); sTone(560, 0.3, 'triangle', 0.08, 0.03, 1400); },
  hit() { sTone(150, 0.13, 'square', 0.16, 0, 70); sNoise(0.09, 0.42, 300, 1400); },
  hitbig() { sTone(120, 0.2, 'square', 0.22, 0, 50); sNoise(0.14, 0.55, 200, 1600); },
  miss() { sNoise(0.14, 0.18, 900, 2800); },
  ice() { for (let i = 0; i < 5; i++) sTone(1400 + i * 380 + Math.random() * 300, 0.32, 'sine', 0.1, i * 0.03); sNoise(0.22, 0.25, 4000, 9000); },
  blood() { sTone(90, 0.35, 'sine', 0.4, 0, 40); sNoise(0.2, 0.3, 300, 1200); },
  splash() { sNoise(0.28, 0.3, 700, 3500); },
  eat() { sNoise(0.06, 0.5, 700, 2500); sNoise(0.06, 0.5, 700, 2500, 0.1); sNoise(0.06, 0.4, 700, 2500, 0.2); },
  drink() { sTone(220, 0.12, 'sine', 0.3, 0, 330); sTone(240, 0.12, 'sine', 0.3, 0.14, 350); },
  prayon() { sTone(660, 0.35, 'sine', 0.2); sTone(990, 0.4, 'sine', 0.12, 0.05); },
  prayoff() { sTone(440, 0.3, 'sine', 0.16, 0, 330); },
  equip() { sTone(1900, 0.08, 'triangle', 0.14); sNoise(0.05, 0.25, 3000, 8000); },
  death() { sTone(220, 0.9, 'sawtooth', 0.22, 0, 45); sNoise(0.5, 0.2, 100, 700); },
  spec() { sTone(300, 0.3, 'sawtooth', 0.14, 0, 1200); sTone(1200, 0.2, 'sine', 0.12, 0.1); },
  click() { sTone(900, 0.03, 'square', 0.04); },
  freeze() { for (let i = 0; i < 6; i++) sTone(2000 + i * 400, 0.5, 'sine', 0.06, i * 0.04); }
};
/* play a sound; volume falls off with distance from the local player */
function sfx(name, x, y) {
  if (!SND.ctx || !UI.sound || !SFX[name]) return;
  const now = performance.now(); if (SND.last[name] && now - SND.last[name] < 45) return; SND.last[name] = now;
  if (x !== undefined && G.player) { const d = Math.hypot(x - G.player.x, y - G.player.y); if (d > 14) return; }
  try { SFX[name](); } catch (e) { }
}
