'use strict';
/* ==========================================================================
   render.js - WebGL2 renderer: voxel chunks, dynamic box batches, sun shadows
   ========================================================================== */
let gl, cv, progW, progS, UW = {}, US = {}, shadowFB, shadowTex;
const SHADOW_RES = 2048, SUN = (() => { const v = [0.48, 0.82, 0.31], l = Math.hypot(...v); return v.map(a => a / l); })();
const cam = { yaw: 0.65, pitch: 0.86, dist: 30, tx: 0, ty: 0, tz: 0, shake: 0, pos: [0, 0, 0], vp: M4.ident(), ivp: M4.ident(), w: 1, h: 1 };
const Env = { k: 0 };   // 0 = daylight surface, 1 = deep underground mood

const VS_W = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in vec3 aNrm;
uniform mat4 uVP,uSVP; uniform float uDyn,uTime,uTrans;
out vec3 vCol; out vec3 vWP; out vec3 vN; out vec4 vSP; out float vFlag;
const vec3 NT[6]=vec3[6](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1));
void main(){ float f=floor(aCol.a*255.+.5); int nid=int(mod(f,8.)); vFlag=floor(f/8.);
  vec3 n=uDyn>.5?aNrm:NT[nid]; vec3 p=aPos;
  if(uTrans>.5&&uDyn<.5&&vFlag<3.5&&nid==2) p.y+=sin(uTime*1.6+p.x*.9+p.z*.7)*.04;
  vN=n; vWP=p; vCol=aCol.rgb; vSP=uSVP*vec4(p+n*.07,1.); gl_Position=uVP*vec4(p,1.); }`;
const FS_W = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vCol; in vec3 vWP; in vec3 vN; in vec4 vSP; in float vFlag;
uniform vec3 uSun,uSunCol,uAmbS,uAmbG,uFog,uCam,uPl; uniform float uLamp,uFogA,uFogB,uAlpha,uTrans; uniform sampler2DShadow uShadow;
out vec4 o;
float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
void main(){ vec3 n=normalize(vN); float fl=vFlag+.25; bool glass=fl>=4.; if(glass)fl-=4.; bool emis=fl>=2.; if(emis)fl-=2.; bool ore=fl>=1.;
  vec3 col=vCol; float h=hash(floor((vWP-n*.02)*4.)); float glow=emis?1.:0.;
  if(ore){ if(h<=.6){ col=(vWP.y<9.5?vec3(.33,.35,.43):vec3(.56,.57,.6))*(.93+.12*h); glow=0.; } }
  else col*=.975+.05*h;
  vec3 sp=vSP.xyz/vSP.w*.5+.5; float sh=1.;
  if(sp.x>0.&&sp.x<1.&&sp.y>0.&&sp.y<1.&&sp.z<1.){ float t=.8/${SHADOW_RES}.; float b=sp.z-.0009;
    sh=(texture(uShadow,vec3(sp.xy+vec2(-t,-t),b))+texture(uShadow,vec3(sp.xy+vec2(t,-t),b))+texture(uShadow,vec3(sp.xy+vec2(-t,t),b))+texture(uShadow,vec3(sp.xy+vec2(t,t),b)))*.25; }
  float ndl=max(dot(n,uSun),0.);
  vec3 lit=col*(mix(uAmbG,uAmbS,n.y*.5+.5)+uSunCol*ndl*sh);
  float a=max(0.,1.-distance(vWP,uPl)/17.); lit+=col*vec3(1.,.76,.46)*a*a*uLamp;
  lit=mix(lit,col*1.18,glow*.88);
  float alpha=1.;
  if(uTrans>.5){ alpha=(glass?.36:.8)*uAlpha; if(!glass) lit+=vec3(.16)*pow(max(0.,dot(reflect(-uSun,n),normalize(uCam-vWP))),28.)*sh; }
  float fg=smoothstep(uFogA,uFogB,distance(vWP,uCam));
  o=vec4(mix(lit,uFog,fg),alpha); }`;
const VS_S = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uSVP; void main(){ gl_Position=uSVP*vec4(aPos,1.); }`;
const FS_S = `#version 300 es
precision mediump float; void main(){}`;

function mkProg(vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); gl.attachShader(p, s); }
  gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
  return [p, u];
}

class Dyn {
  constructor(maxV) {
    this.max = maxV; this.p = new Float32Array(maxV * 3); this.n = new Float32Array(maxV * 3); this.c = new Uint8Array(maxV * 4); this.nv = 0;
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.bp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bp); gl.bufferData(gl.ARRAY_BUFFER, this.p.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.bc = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bc); gl.bufferData(gl.ARRAY_BUFFER, this.c.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    this.bn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bn); gl.bufferData(gl.ARRAY_BUFFER, this.n.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }
  reset() { this.nv = 0; }
  /* box centred at (cx,cy,cz) with half extents, in the frame of matrix m. fl: 2 = emissive */
  box(m, cx, cy, cz, hx, hy, hz, col, fl) {
    if (this.nv + 36 > this.max) return;
    const r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255, a = (fl || 0) * 8, P = this.p, N = this.n, C = this.c;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], fn = F.n;
      let nx = m[0] * fn[0] + m[4] * fn[1] + m[8] * fn[2], ny = m[1] * fn[0] + m[5] * fn[1] + m[9] * fn[2], nz = m[2] * fn[0] + m[6] * fn[1] + m[10] * fn[2];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let t = 0; t < 6; t++) {
        const c = F.c[t === 0 ? 0 : t === 1 ? 1 : t === 2 ? 2 : t === 3 ? 0 : t === 4 ? 2 : 3];
        const lx = cx + (c[0] * 2 - 1) * hx, ly = cy + (c[1] * 2 - 1) * hy, lz = cz + (c[2] * 2 - 1) * hz, i = this.nv * 3, j = this.nv * 4;
        P[i] = m[0] * lx + m[4] * ly + m[8] * lz + m[12]; P[i + 1] = m[1] * lx + m[5] * ly + m[9] * lz + m[13]; P[i + 2] = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        N[i] = nx; N[i + 1] = ny; N[i + 2] = nz; C[j] = r; C[j + 1] = g; C[j + 2] = b; C[j + 3] = a; this.nv++;
      }
    }
  }
  flush() {
    if (!this.nv) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bp); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.p, 0, this.nv * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bc); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.c, 0, this.nv * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bn); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.n, 0, this.nv * 3);
  }
  draw() { if (!this.nv) return; gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, this.nv); }
}
let DYN, DYNT, DYNH;
const ID4 = M4.ident();

function initGL() {
  cv = document.getElementById('gl');
  gl = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 is not available in this browser');
  [progW, UW] = mkProg(VS_W, FS_W); [progS, US] = mkProg(VS_S, FS_S);
  shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_RES, SHADOW_RES, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  shadowFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  DYN = new Dyn(160000); DYNT = new Dyn(3000); DYNH = new Dyn(400);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
}

function uploadPart(slot, M) {
  if (!M.ni) { if (slot.vao) slot.n = 0; return slot; }
  if (!slot.vao) {
    slot.vao = gl.createVertexArray(); slot.bp = gl.createBuffer(); slot.bc = gl.createBuffer(); slot.bi = gl.createBuffer();
    gl.bindVertexArray(slot.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.bp); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.bc); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.bi);
  }
  gl.bindVertexArray(slot.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, slot.bp); gl.bufferData(gl.ARRAY_BUFFER, M.p.subarray(0, M.nv * 3), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, slot.bc); gl.bufferData(gl.ARRAY_BUFFER, M.c.subarray(0, M.nv * 4), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slot.bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, M.i.subarray(0, M.ni), gl.STATIC_DRAW);
  gl.bindVertexArray(null); slot.n = M.ni; return slot;
}
function remeshDirty(budgetMs, px, pz) {
  const t0 = performance.now(); let best;
  for (; ;) {
    best = null; let bd = 1e9;
    for (const c of chunks) if (c.dirty) { const d = Math.abs(c.cx * CS + 8 - px) + Math.abs(c.cz * CS + 8 - pz); if (d < bd) { bd = d; best = c; } }
    if (!best) return true;
    meshChunk(best); best.o = uploadPart(best.o || {}, MO); best.t = uploadPart(best.t || {}, MT);
    if (performance.now() - t0 > budgetMs) return false;
  }
}

function resizeGL() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  cam.w = cv.clientWidth; cam.h = cv.clientHeight;
}
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function renderFrame(time, focus, hi) {
  resizeGL();
  // camera
  const cp = Math.cos(cam.pitch), sx = (Math.random() - .5) * cam.shake, sy = (Math.random() - .5) * cam.shake;
  const tgt = [cam.tx + sx, cam.ty + sy, cam.tz];
  cam.pos = [tgt[0] + Math.sin(cam.yaw) * cp * cam.dist, tgt[1] + Math.sin(cam.pitch) * cam.dist, tgt[2] + Math.cos(cam.yaw) * cp * cam.dist];
  const asp = cv.width / cv.height, fov = asp < 1 ? 0.7 : 0.52;
  cam.vp = M4.mul(M4.persp(fov, asp, 0.5, 420), M4.lookAt(cam.pos, tgt, [0, 1, 0])); cam.ivp = M4.inv(cam.vp);
  // sun shadow matrix, centred on the focus and snapped to whole blocks
  const SR = 46, c = [Math.round(focus[0]), Math.round(focus[1]), Math.round(focus[2])];
  const svp = M4.mul(M4.ortho(-SR, SR, -SR, SR, 1, 190), M4.lookAt([c[0] + SUN[0] * 90, c[1] + SUN[1] * 90, c[2] + SUN[2] * 90], c, [0, 1, 0]));
  DYN.flush(); DYNT.flush(); DYNH.flush();

  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.viewport(0, 0, SHADOW_RES, SHADOW_RES); gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.useProgram(progS); gl.uniformMatrix4fv(US.uSVP, false, svp); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3); gl.disable(gl.BLEND); gl.depthMask(true);
  const near = [];
  for (const ch of chunks) { if (!ch.o) continue; const dx = ch.cx * CS + 8 - focus[0], dz = ch.cz * CS + 8 - focus[2]; if (Math.abs(dx) < SR + 34 && Math.abs(dz) < SR + 34 && ch.o.n) near.push(ch); }
  for (const ch of near) { gl.bindVertexArray(ch.o.vao); gl.drawElements(gl.TRIANGLES, ch.o.n, gl.UNSIGNED_INT, 0); }
  DYN.draw(); gl.disable(gl.POLYGON_OFFSET_FILL);

  const k = Env.k, fog = mix3([0.72, 0.83, 0.9], [0.07, 0.08, 0.13], k);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(fog[0], fog[1], fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(progW);
  gl.uniformMatrix4fv(UW.uVP, false, cam.vp); gl.uniformMatrix4fv(UW.uSVP, false, svp);
  gl.uniform3fv(UW.uSun, SUN); gl.uniform3fv(UW.uSunCol, mix3([1.02, 0.95, 0.82], [0.3, 0.33, 0.46], k));
  gl.uniform3fv(UW.uAmbS, mix3([0.5, 0.56, 0.66], [0.3, 0.33, 0.46], k)); gl.uniform3fv(UW.uAmbG, mix3([0.36, 0.34, 0.33], [0.2, 0.2, 0.29], k));
  gl.uniform3fv(UW.uFog, fog); gl.uniform3fv(UW.uCam, cam.pos); gl.uniform3f(UW.uPl, focus[0], focus[1] + 1.2, focus[2]);
  gl.uniform1f(UW.uLamp, 0.12 + k * 1.7); gl.uniform1f(UW.uFogA, lerp(cam.dist + 60, cam.dist + 12, k)); gl.uniform1f(UW.uFogB, lerp(cam.dist + 190, cam.dist + 55, k));
  gl.uniform1f(UW.uTime, time); gl.uniform1f(UW.uAlpha, 1); gl.uniform1f(UW.uTrans, 0); gl.uniform1f(UW.uDyn, 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.uniform1i(UW.uShadow, 0);
  gl.vertexAttrib3f(2, 0, 1, 0);
  for (const ch of chunks) if (ch.o && ch.o.n) { gl.bindVertexArray(ch.o.vao); gl.drawElements(gl.TRIANGLES, ch.o.n, gl.UNSIGNED_INT, 0); }
  gl.uniform1f(UW.uDyn, 1); DYN.draw();
  // translucent: water + glass, effects, target highlight
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.uniform1f(UW.uTrans, 1); gl.uniform1f(UW.uDyn, 0);
  for (const ch of chunks) if (ch.t && ch.t.n) { gl.bindVertexArray(ch.t.vao); gl.drawElements(gl.TRIANGLES, ch.t.n, gl.UNSIGNED_INT, 0); }
  gl.uniform1f(UW.uDyn, 1); DYNT.draw();
  if (DYNH.nv) { gl.uniform1f(UW.uAlpha, hi); gl.disable(gl.CULL_FACE); DYNH.draw(); gl.enable(gl.CULL_FACE); }
  gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
}

/* screen <-> world */
function project(x, y, z) { const p = M4.tp(cam.vp, x, y, z); if (p[3] <= 0.01) return null; return [(p[0] / p[3] * .5 + .5) * cam.w, (1 - (p[1] / p[3] * .5 + .5)) * cam.h, p[3]]; }
function screenRay(sx, sy) {
  const nx = sx / cam.w * 2 - 1, ny = 1 - sy / cam.h * 2, a = M4.tp(cam.ivp, nx, ny, -1), b = M4.tp(cam.ivp, nx, ny, 1);
  const o = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], e = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
  const d = [e[0] - o[0], e[1] - o[1], e[2] - o[2]], l = Math.hypot(d[0], d[1], d[2]);
  return { o, d: [d[0] / l, d[1] / l, d[2] / l] };
}
