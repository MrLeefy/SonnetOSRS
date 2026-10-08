'use strict';
/* ==========================================================================
   gl.js  -  tiny WebGL renderer: matrices, mesh builder, camera, picking
   World space: X = east, Y = up, Z = south (tile y = -Z). 1 unit = 1 tile.
   ========================================================================== */
const M4 = {
  ident() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  mul(a, b) { // column-major: result = a * b
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  trans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  scale(x, y, z) { return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]; },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
  },
  lookAt(e, c, u) {
    let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2]; let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
    let sx = fy * u[2] - fz * u[1], sy = fz * u[0] - fx * u[2], sz = fx * u[1] - fy * u[0]; l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    return [sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0, -(sx * e[0] + sy * e[1] + sz * e[2]), -(ux * e[0] + uy * e[1] + uz * e[2]), (fx * e[0] + fy * e[1] + fz * e[2]), 1];
  },
  pt(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; },
  dir(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; }
};

/* lighting (baked into vertex colours, RS2 style) */
const LIGHT = (() => { const l = [-0.42, 0.78, 0.46]; const n = Math.hypot(...l); return [l[0] / n, l[1] / n, l[2] / n]; })();
let AMBIENT = 0.60, DIFFUSE = 0.52;
function lightAt(nx, ny, nz) {
  const l = Math.hypot(nx, ny, nz) || 1; const d = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / l;
  return AMBIENT + DIFFUSE * Math.max(0, d);
}

/* vertex layout (24 bytes, matches the GPU attribs): xyz uv as 5 floats, then rgba as 4 bytes.
   A Mesh owns one grow-only ArrayBuffer and writes straight into it, so per-frame meshes allocate nothing. */
const VERT_BYTES = 24;
/* box helpers: scratch corners (bit0 = +x, bit1 = +y, bit2 = +z), faces ccw from outside, uv axes 0=x 1=y 2=z */
const BOX_CORNERS = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
const BOX_UVS = [[0, 0], [0, 0], [0, 0], [0, 0]];
const BOX_FACES = [
  [4, 5, 7, 6, 0, 1], // +z
  [1, 0, 2, 3, 0, 1], // -z
  [5, 1, 3, 7, 2, 1], // +x
  [0, 4, 6, 2, 2, 1], // -x
  [6, 7, 3, 2, 0, 2], // +y
  [0, 1, 5, 4, 0, 2]  // -y
];
function boxHalf(ax, hx, hy, hz) { return ax === 0 ? hx : ax === 1 ? hy : hz; }
class Mesh {
  constructor(tex) {
    this.tex = tex || 'white'; this.blend = false;
    this.n = 0; this.cap = 0; this.buf = null; this.f = null; this.u = null; this.grow(256);
  }
  get count() { return this.n; }
  grow(need) {
    let c = this.cap || 256; while (c < need) c *= 2;
    const b = new ArrayBuffer(c * VERT_BYTES), u = new Uint8Array(b);
    if (this.u) u.set(this.u.subarray(0, this.n * VERT_BYTES));
    this.buf = b; this.u = u; this.f = new Float32Array(b); this.cap = c;
  }
  clear() { this.n = 0; }
  vert(x, y, z, u, v, r, g, b, a) {
    const n = this.n; if (n >= this.cap) this.grow(n + 1);
    const o = n * 6, f = this.f;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = u; f[o + 4] = v;
    const q = o * 4 + 20, w = this.u;
    w[q] = r; w[q + 1] = g; w[q + 2] = b; w[q + 3] = a;
    this.n = n + 1;
  }
  vtx(p, uv, cc, f, A) {
    this.vert(p[0], p[1], p[2], uv ? uv[0] : 0, uv ? uv[1] : 0,
      Math.min(255, (cc >> 16 & 255) * f) | 0, Math.min(255, (cc >> 8 & 255) * f) | 0, Math.min(255, (cc & 255) * f) | 0, A);
  }
  /* one triangle with per-corner colours c0..c2 and uv pairs t0..t2 (all may be null) */
  triv(a, b, c, c0, c1, c2, sh, t0, t1, t2, alpha) {
    let f = 1;
    if (sh !== false) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (ny < 0 && sh !== 2) { nx = -nx; ny = -ny; nz = -nz; } // double-sided: light the up-facing side
      f = lightAt(nx, ny, nz);
    }
    const A = alpha === undefined ? 255 : alpha;
    this.vtx(a, t0, c0, f, A); this.vtx(b, t1, c1, f, A); this.vtx(c, t2, c2, f, A);
  }
  /* pts: 3 arrays [x,y,z]; col int or array of 3 ints; sh = apply flat face light */
  tri(a, b, c, col, sh, uvs, alpha) {
    const mc = Array.isArray(col);
    this.triv(a, b, c, mc ? col[0] : col, mc ? col[1] : col, mc ? col[2] : col, sh, uvs ? uvs[0] : null, uvs ? uvs[1] : null, uvs ? uvs[2] : null, alpha);
  }
  quad(a, b, c, d, col, sh, uvs, alpha) {
    const mc = Array.isArray(col);
    const c0 = mc ? col[0] : col, c1 = mc ? col[1] : col, c2 = mc ? col[2] : col, c3 = mc ? col[3] : col;
    const u0 = uvs ? uvs[0] : null, u1 = uvs ? uvs[1] : null, u2 = uvs ? uvs[2] : null, u3 = uvs ? uvs[3] : null;
    this.triv(a, b, c, c0, c1, c2, sh, u0, u1, u2, alpha);
    this.triv(a, c, d, c0, c2, c3, sh, u0, u2, u3, alpha);
  }
  /* box centred at (cx,cy,cz) with half extents, transformed by matrix m (or null). k = texture repeat per unit */
  box(m, cx, cy, cz, hx, hy, hz, col, k, alpha, shadeMul) {
    const P = BOX_CORNERS;
    for (let i = 0; i < 8; i++) { // the eight corners, transformed once
      const x = cx + ((i & 1) ? hx : -hx), y = cy + ((i & 2) ? hy : -hy), z = cz + ((i & 4) ? hz : -hz), p = P[i];
      if (m) { p[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; p[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; p[2] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
      else { p[0] = x; p[1] = y; p[2] = z; }
    }
    let c = col; if (shadeMul) c = shadeCol(col, shadeMul);
    for (let fi = 0; fi < 6; fi++) {
      const f = BOX_FACES[fi]; let uvs = null;
      if (k) {
        const u = boxHalf(f[4], hx, hy, hz) * 2 * k, v = boxHalf(f[5], hx, hy, hz) * 2 * k, T = BOX_UVS;
        T[0][0] = 0; T[0][1] = v; T[1][0] = u; T[1][1] = v; T[2][0] = u; T[2][1] = 0; T[3][0] = 0; T[3][1] = 0;
        uvs = T;
      }
      this.quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]], c, true, uvs, alpha);
    }
  }
  /* upright prism/cylinder with n sides around (cx,cz), from y0 to y1 */
  prism(m, cx, cz, y0, y1, rx, rz, n, col, k, rot) {
    const V = (x, y, z) => m ? M4.pt(m, x, y, z) : [x, y, z];
    const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (rot || 0); pts.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const uu = Math.hypot(b[0] - a[0], b[1] - a[1]) * (k || 0), vv = (y1 - y0) * (k || 0);
      this.quad(V(b[0], y0, b[1]), V(a[0], y0, a[1]), V(a[0], y1, a[1]), V(b[0], y1, b[1]), col, true, k ? [[0, vv], [uu, vv], [uu, 0], [0, 0]] : null);
    }
    for (let i = 1; i < n - 1; i++) this.tri(V(pts[0][0], y1, pts[0][1]), V(pts[i + 1][0], y1, pts[i + 1][1]), V(pts[i][0], y1, pts[i][1]), col, true);
  }
  /* low-poly ellipsoid */
  blob(m, cx, cy, cz, rx, ry, rz, seg, rings, col, jitter, rnd, alpha) {
    const V = (x, y, z) => m ? M4.pt(m, x, y, z) : [x, y, z];
    const R = rnd || Math.random; const grid = [];
    for (let j = 0; j <= rings; j++) {
      const row = []; const th = j / rings * Math.PI;
      for (let i = 0; i < seg; i++) {
        const ph = i / seg * TAU; const jt = jitter ? 1 + (R() - 0.5) * jitter : 1;
        row.push(V(cx + Math.sin(th) * Math.cos(ph) * rx * jt, cy + Math.cos(th) * ry * jt, cz + Math.sin(th) * Math.sin(ph) * rz * jt));
      }
      grid.push(row);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      const cvar = jitter ? shadeCol(col, 0.9 + R() * 0.2) : col;
      this.quad(grid[j][i], grid[j][i2], grid[j + 1][i2], grid[j + 1][i], cvar, 2, null, alpha);
    }
  }
}

class Renderer {
  constructor(canvas) {
    // backing store is VSS x the logical viewport; the CSS box stays VW x VH
    canvas.width = VW * VSS; canvas.height = VH * VSS;
    const gl = this.gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.canvas = canvas; this.ss = VSS;
    if (gl.drawingBufferWidth < VW * VSS || gl.drawingBufferHeight < VH * VSS) { this.ss = 1; canvas.width = VW; canvas.height = VH; }
    canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
    const vs = `attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol;
      uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uFog;
      varying vec4 vCol; varying vec2 vUV; varying float vFog;
      void main(){ gl_Position=uVP*vec4(aPos,1.0); vCol=aCol; vUV=aUV;
        float d=length(aPos-uEye); vFog=clamp((d-uFog.x)/(uFog.y-uFog.x),0.0,1.0); }`;
    const fs = `precision mediump float; uniform sampler2D uTex; uniform vec3 uFogCol;
      varying vec4 vCol; varying vec2 vUV; varying float vFog;
      void main(){ vec4 t=texture2D(uTex,vUV); vec4 c=t*vCol; if(c.a<0.02) discard;
        gl_FragColor=vec4(mix(c.rgb,uFogCol,vFog*vFog),c.a); }`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = this.prog = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    this.aPos = gl.getAttribLocation(pr, 'aPos'); this.aUV = gl.getAttribLocation(pr, 'aUV'); this.aCol = gl.getAttribLocation(pr, 'aCol');
    this.uVP = gl.getUniformLocation(pr, 'uVP'); this.uEye = gl.getUniformLocation(pr, 'uEye'); this.uFog = gl.getUniformLocation(pr, 'uFog');
    this.uFogCol = gl.getUniformLocation(pr, 'uFogCol'); this.uTex = gl.getUniformLocation(pr, 'uTex');
    this.textures = {}; this.fogCol = [0, 0, 0]; this.fogRange = [20, 34];
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.dyn = new Map(); // per-mesh grow-only GPU buffers for drawDynamic
    // white 1x1
    const w = document.createElement('canvas'); w.width = w.height = 1; const wc = w.getContext('2d'); wc.fillStyle = '#fff'; wc.fillRect(0, 0, 1, 1);
    this.makeTexture('white', w, false);
  }
  makeTexture(name, cv, repeat) {
    const gl = this.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    const pot = (cv.width & (cv.width - 1)) === 0 && (cv.height & (cv.height - 1)) === 0;
    if (pot && name !== 'white') { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const wrap = repeat && pot ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    this.textures[name] = t;
  }
  pack(mesh) { return mesh.buf.slice(0, mesh.n * VERT_BYTES); }
  upload(mesh) {
    const gl = this.gl; const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, this.pack(mesh), gl.STATIC_DRAW);
    return { buf: b, count: mesh.count, tex: mesh.tex, blend: mesh.blend };
  }
  bindAttribs() {
    const gl = this.gl;
    gl.enableVertexAttribArray(this.aPos); gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.aUV); gl.vertexAttribPointer(this.aUV, 2, gl.FLOAT, false, 24, 12);
    gl.enableVertexAttribArray(this.aCol); gl.vertexAttribPointer(this.aCol, 4, gl.UNSIGNED_BYTE, true, 24, 20);
  }
  drawGPU(g) {
    if (!g.count) return; const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf); this.bindAttribs();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures[g.tex] || this.textures.white); gl.uniform1i(this.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, g.count);
  }
  /* per-frame mesh: the GPU buffer only grows, and each frame streams the mesh's bytes into it */
  drawDynamic(mesh) {
    const n = mesh.count; if (!n) return; const gl = this.gl, bytes = n * VERT_BYTES;
    let d = this.dyn.get(mesh);
    if (!d) { d = { buf: gl.createBuffer(), cap: 0 }; this.dyn.set(mesh, d); }
    gl.bindBuffer(gl.ARRAY_BUFFER, d.buf);
    if (bytes > d.cap) { d.cap = Math.max(bytes, d.cap * 2); gl.bufferData(gl.ARRAY_BUFFER, d.cap, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.u.subarray(0, bytes)); this.bindAttribs();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures[mesh.tex] || this.textures.white); gl.uniform1i(this.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, n);
  }
  begin(cam) {
    const gl = this.gl;
    gl.viewport(0, 0, VW * this.ss, VH * this.ss);
    gl.clearColor(this.fogCol[0], this.fogCol[1], this.fogCol[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uVP, false, new Float32Array(cam.vp));
    gl.uniform3f(this.uEye, cam.eye[0], cam.eye[1], cam.eye[2]);
    gl.uniform2f(this.uFog, this.fogRange[0], this.fogRange[1]);
    gl.uniform3f(this.uFogCol, this.fogCol[0], this.fogCol[1], this.fogCol[2]);
    gl.depthMask(true);
  }
  setDepthWrite(b) { this.gl.depthMask(b); }
}

/* RS2-style orbit camera. focal length 512px over a 512x334 viewport. */
const CAM_CLEAR = 0.9; // minimum eye height above the ground under the camera
class Camera {
  constructor() {
    this.tx = 0; this.ty = 0; this.tz = 0; this.yaw = 0; this.pitch = 0.78; this.dist = 15.5;
    this.vp = M4.ident(); this.eye = [0, 0, 0]; this.fovy = 2 * Math.atan(167 / 512);
    this.floor = null; // optional fn(x, tileY) -> ground height, used to keep the eye above ground
    this.snap();
  }
  /* yaw / pitch / dist ease toward these goals; input writes the goals, snap() makes them match */
  snap() { this.yawG = this.yaw; this.pitchG = this.pitch; this.distG = this.dist; }
  update() {
    const dh = Math.cos(this.pitch) * this.dist, dv = Math.sin(this.pitch) * this.dist;
    const eye = [this.tx - Math.sin(this.yaw) * dh, this.ty + dv, this.tz + Math.cos(this.yaw) * dh];
    // never let the eye dip under the ground beneath it: lift it instead, so pitch and distance stay as set
    if (this.floor) { const g = this.floor(eye[0], -eye[2]) + CAM_CLEAR; if (eye[1] < g) eye[1] = g; }
    this.eye = eye;
    const view = M4.lookAt(this.eye, [this.tx, this.ty, this.tz], [0, 1, 0]);
    this.view = view;
    this.vp = M4.mul(M4.persp(this.fovy, VW / VH, 0.4, 90), view);
    // basis for picking
    let fx = this.tx - this.eye[0], fy = this.ty - this.eye[1], fz = this.tz - this.eye[2]; const l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
    let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0; // f x up
    const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    this.fwd = [fx, fy, fz]; this.right = [rx, ry, rz]; this.up = [ux, uy, uz];
    this.tanY = Math.tan(this.fovy / 2); this.tanX = this.tanY * VW / VH;
  }
  /* world -> viewport pixels (0..512, 0..334); returns null if behind camera */
  project(x, y, z) {
    const m = this.vp; const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw < 0.4) return null;
    return [(cx / cw * 0.5 + 0.5) * VW, (1 - (cy / cw * 0.5 + 0.5)) * VH, cw];
  }
  /* ray through viewport pixel */
  ray(px, py) {
    const nx = (px / VW) * 2 - 1, ny = 1 - (py / VH) * 2;
    const d = [this.fwd[0] + this.right[0] * nx * this.tanX + this.up[0] * ny * this.tanY,
      this.fwd[1] + this.right[1] * nx * this.tanX + this.up[1] * ny * this.tanY,
      this.fwd[2] + this.right[2] * nx * this.tanX + this.up[2] * ny * this.tanY];
    const l = Math.hypot(...d); return { o: this.eye, d: [d[0] / l, d[1] / l, d[2] / l] };
  }
}
