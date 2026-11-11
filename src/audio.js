/* audio.js - small procedural WebAudio sound set (no asset files) */
let ctx = null, master = null, noiseBuf = null, enabled = true, wind = null;

export const Sound = {
  get enabled() { return enabled; },
  setEnabled(v) { enabled = v; if (master) master.gain.value = v ? 0.5 : 0; },
  /* must be called from a user gesture */
  unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      ctx = new AC(); master = ctx.createGain(); master.gain.value = enabled ? 0.5 : 0; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // quiet wind bed
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; const g = ctx.createGain(); g.gain.value = 0.05;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 0.025; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      src.connect(f); f.connect(g); g.connect(master); src.start(); wind = src;
    } catch (e) { ctx = null; }
  },
  suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
  resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
  play(name, vol = 1) { if (!ctx || !enabled || vol <= 0.02 || ctx.state !== 'running') return; const fn = SFX[name]; if (fn) fn(ctx.currentTime, Math.min(1, vol)); }
};

function tone(t, type, f0, f1, dur, vol, delay = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; t += delay;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(t, ftype, f0, f1, dur, vol, q = 1, delay = 0) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(), g = ctx.createGain(); t += delay;
  f.type = ftype; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const SFX = {
  swing: (t, v) => noise(t, 'bandpass', 500, 2600, 0.16, 0.35 * v, 1.5),
  hitMelee: (t, v) => { noise(t, 'lowpass', 1800, 200, 0.12, 0.6 * v); tone(t, 'triangle', 170, 60, 0.14, 0.5 * v); },
  bow: (t, v) => { tone(t, 'triangle', 340, 120, 0.12, 0.4 * v); noise(t, 'highpass', 2500, 5000, 0.1, 0.15 * v); },
  hitRanged: (t, v) => { noise(t, 'bandpass', 2400, 600, 0.07, 0.5 * v, 2); tone(t, 'square', 120, 70, 0.06, 0.2 * v); },
  cast: (t, v) => { tone(t, 'sawtooth', 300, 950, 0.28, 0.16 * v); tone(t, 'sine', 600, 1900, 0.28, 0.2 * v); },
  hitMagic: (t, v) => { noise(t, 'bandpass', 3800, 900, 0.22, 0.4 * v, 3); tone(t, 'sine', 1300, 400, 0.22, 0.25 * v); },
  freeze: (t, v) => { for (let i = 0; i < 4; i++) tone(t, 'sine', 1900 + i * 420, 1500 + i * 300, 0.25, 0.14 * v, i * 0.035); noise(t, 'highpass', 5000, 7000, 0.25, 0.2 * v); },
  miss: (t, v) => noise(t, 'bandpass', 900, 500, 0.08, 0.14 * v, 3),
  ward: (t, v) => { tone(t, 'square', 880, 660, 0.12, 0.14 * v); tone(t, 'sine', 1320, 1320, 0.2, 0.2 * v); },
  wardUp: (t, v) => { tone(t, 'sine', 520, 780, 0.12, 0.2 * v); },
  stance: (t, v) => { noise(t, 'bandpass', 1500, 3200, 0.07, 0.25 * v, 2); tone(t, 'triangle', 260, 320, 0.06, 0.2 * v); },
  eat: (t, v) => { for (let i = 0; i < 3; i++) noise(t, 'bandpass', 900 + i * 200, 500, 0.06, 0.4 * v, 2, i * 0.09); },
  tonic: (t, v) => { for (let i = 0; i < 3; i++) tone(t, 'sine', 300 + i * 90, 520 + i * 90, 0.09, 0.3 * v, i * 0.08); },
  hurt: (t, v) => tone(t, 'sawtooth', 190, 90, 0.16, 0.25 * v),
  death: (t, v) => { tone(t, 'sawtooth', 220, 45, 0.7, 0.3 * v); noise(t, 'lowpass', 900, 100, 0.6, 0.4 * v); },
  kill: (t, v) => { [523, 659, 784, 1047].forEach((f, i) => tone(t, 'triangle', f, f, 0.22, 0.28 * v, i * 0.07)); },
  spec: (t, v) => { tone(t, 'sawtooth', 110, 440, 0.3, 0.2 * v); tone(t, 'sine', 880, 1760, 0.3, 0.2 * v); },
  pickup: (t, v) => { tone(t, 'sine', 700, 1050, 0.1, 0.3 * v); tone(t, 'sine', 1050, 1400, 0.12, 0.3 * v, 0.08); },
  ui: (t, v) => tone(t, 'sine', 620, 620, 0.05, 0.2 * v),
  deny: (t, v) => tone(t, 'square', 150, 110, 0.12, 0.15 * v),
  spawn: (t, v) => { tone(t, 'sine', 260, 780, 0.35, 0.25 * v); }
};
