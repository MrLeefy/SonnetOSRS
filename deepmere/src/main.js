'use strict';
/* ==========================================================================
   main.js - boot and main loop
   ========================================================================== */
let lastT = 0, booted = false;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, Math.max(0, (t - lastT) / 1000)); lastT = t;
  if (!booted) return;
  if (!paused) { promoteHolds(); update(dt); }
  const b = body(), k = 1 - Math.exp(-dt * 9);
  cam.tx += (b.x - cam.tx) * k; cam.tz += (b.z - cam.tz) * k; cam.ty += (b.y - b.lift + 1.1 - cam.ty) * (1 - Math.exp(-dt * 6));
  cam.yaw += (camYawT - cam.yaw) * (1 - Math.exp(-dt * 10));
  cam.pitch += (clamp((cut.on ? 1.04 : .84) + camPitchOff, .35, 1.4) - cam.pitch) * (1 - Math.exp(-dt * 4));
  remeshDirty(6, b.x, b.z);
  const hi = buildScene();
  renderFrame(t / 1000, [b.x, b.y, b.z], hi);
  if (started) { hudUpdate(); updateLabels(dt); drawMini(dt); }
  if (!paused) { saveAcc += dt; if (saveAcc > 40) { saveAcc = 0; if (World.dirty) saveGame(); } }
}
function boot() {
  try { initGL(); } catch (e) { $('card').innerHTML = '<h1>Deepmere</h1><p class="tag">This browser could not start 3D graphics (WebGL 2). Try a recent Chrome, Safari or Firefox.</p>'; return; }
  hadSave = loadGame();
  if (!hadSave) newGame((Math.random() * 1e9) | 0);
  spawnCritters(); initMap(); buildHud(); initLabels(); initInput();
  const b = body(); cam.tx = b.x; cam.ty = b.y + 1.1; cam.tz = b.z; camYawT = cam.yaw;
  remeshDirty(1e9, b.x, b.z);
  booted = true; openTitle();
  document.addEventListener('visibilitychange', () => { if (document.hidden && started && World.dirty) saveGame(); });
  window.addEventListener('pagehide', () => { if (started && World.dirty) saveGame(); });
}
requestAnimationFrame(frame);
setTimeout(boot, 30);
