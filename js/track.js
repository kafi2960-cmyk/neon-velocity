import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Track generation: a closed spline sampled every ~2m into frames
// (position, tangent, side=right, up) with banking, then swept into meshes.
// Cars live in track space: distance along the loop + lateral offset.
// ---------------------------------------------------------------------------

export const ROAD_HALF = 12;
const SAMPLE_DS = 2;

export const THEMES = {
  city: { sky: ['#03010d', '#3a0d5c', '#05010f'], fog: '#1a0733', fogFar: 1500, road: '#0c0b16', lane: '#00e5ff',
    edgeL: '#ff2d95', edgeR: '#00e5ff', arch: '#ff2d95', arch2: '#00e5ff', pad: '#ffd60a', orb: '#a3ff12', deck: '#1a1626',
    hemi: ['#7b6bff', '#2a0b3d', 1.1], dir: ['#ff9ad5', 1.2], stars: true },
  desert: { sky: ['#14062e', '#e8553a', '#2b0f2e'], fog: '#6e2a4a', fogFar: 1800, road: '#141019', lane: '#ffd60a',
    edgeL: '#ff6b00', edgeR: '#ffd60a', arch: '#ff6b00', arch2: '#ff2d95', pad: '#00e5ff', orb: '#a3ff12', deck: '#2a1a24',
    hemi: ['#ffb38a', '#3b1a2f', 0.7], dir: ['#ffc38a', 1.0], sun: { color: '#ffcf5c', dir: [0, 0.07, -1], size: 0.16 } },
  grid: { sky: ['#000000', '#001a26', '#000000'], fog: '#001820', fogFar: 1400, road: '#03060c', lane: '#00e5ff',
    edgeL: '#00e5ff', edgeR: '#39ff14', arch: '#00e5ff', arch2: '#ff2d95', pad: '#ff2d95', orb: '#ffd60a', deck: '#0b1220',
    hemi: ['#3fd0ff', '#001018', 0.9], dir: ['#9be9ff', 1.0], stars: true },
  ice: { sky: ['#01030d', '#0c2d52', '#020617'], fog: '#0f2f52', fogFar: 1600, road: '#0b1424', lane: '#7dd3fc',
    edgeL: '#7dd3fc', edgeR: '#c084fc', arch: '#7dd3fc', arch2: '#c084fc', pad: '#39ff14', orb: '#ffd60a', deck: '#1c2a40',
    hemi: ['#9cc9ff', '#1d3557', 1.2], dir: ['#cfe8ff', 1.3], stars: true, aurora: true }
};

const rand = (a, b) => a + Math.random() * (b - a);
function canvas2d(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function controlPoints(def) {
  const pts = [], N = 28;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    let r = 1, y = 0;
    for (const [n, amp, ph] of def.harm) r += amp * Math.cos(n * a + ph);
    for (const [n, amp, ph] of def.elev) y += amp * Math.sin(n * a + ph);
    pts.push(new THREE.Vector3(Math.cos(a) * r * def.R, y, Math.sin(a) * r * def.R));
  }
  return pts;
}

function smooth(arr, n, win, passes) {
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -win; k <= win; k++) s += arr[(i + k + n) % n];
      out[i] = s / (2 * win + 1);
    }
    arr.set(out);
  }
}

export function trackLength(def) {
  return new THREE.CatmullRomCurve3(controlPoints(def), true, 'centripetal').getLength();
}

// ---------------------------------------------------------------------------
export function buildTrack(def) {
  const theme = THEMES[def.theme];
  const curve = new THREE.CatmullRomCurve3(controlPoints(def), true, 'centripetal');
  const L = curve.getLength();
  const n = Math.round(L / SAMPLE_DS), ds = L / n;
  const pts = curve.getSpacedPoints(n);
  const P = new Float32Array(n * 3), Tn = new Float32Array(n * 3), S = new Float32Array(n * 3), U = new Float32Array(n * 3), K = new Float32Array(n);
  const Y = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(), s = new THREE.Vector3(), u = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
    t.subVectors(pts[(i + 1) % n], pts[(i - 1 + n) % n]).normalize();
    Tn.set([t.x, t.y, t.z], i * 3);
  }
  for (let i = 0; i < n; i++) {
    t.fromArray(Tn, i * 3);
    s.crossVectors(t, Y).normalize();
    S.set([s.x, s.y, s.z], i * 3);
  }
  // signed curvature: + means the road bends toward `side` (a right-hand turn)
  const tA = new THREE.Vector3(), tB = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    tA.fromArray(Tn, ((i - 1 + n) % n) * 3); tB.fromArray(Tn, ((i + 1) % n) * 3);
    s.fromArray(S, i * 3);
    K[i] = tB.sub(tA).dot(s) / (2 * ds);
  }
  smooth(K, n, 6, 3);
  // banking: roll the frame around the tangent so the inside edge drops
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    t.fromArray(Tn, i * 3); s.fromArray(S, i * 3);
    u.crossVectors(s, t).normalize();
    const th = THREE.MathUtils.clamp(K[i] * 28, -0.32, 0.32), c = Math.cos(th), sn = Math.sin(th);
    const s2 = s.clone().multiplyScalar(c).addScaledVector(u, -sn);
    const u2 = u.clone().multiplyScalar(c).addScaledVector(s, sn);
    S.set([s2.x, s2.y, s2.z], i * 3); U.set([u2.x, u2.y, u2.z], i * 3);
    minY = Math.min(minY, P[i * 3 + 1]); maxY = Math.max(maxY, P[i * 3 + 1]);
  }
  const groundY = minY - 26;

  const T = { def, theme, L, n, ds, P, Tn, S, U, K, groundY, group: new THREE.Group(), pads: [], orbs: [], animated: [] };

  const lerp3 = (A, i, j, f, out) => out.set(A[i * 3] + (A[j * 3] - A[i * 3]) * f, A[i * 3 + 1] + (A[j * 3 + 1] - A[i * 3 + 1]) * f, A[i * 3 + 2] + (A[j * 3 + 2] - A[i * 3 + 2]) * f);
  T.wrap = d => ((d % L) + L) % L;
  T.frameAt = (dist, F) => {
    const f = T.wrap(dist) / ds, i = Math.floor(f) % n, j = (i + 1) % n, fr = f - Math.floor(f);
    lerp3(P, i, j, fr, F.pos); lerp3(Tn, i, j, fr, F.tan).normalize();
    lerp3(S, i, j, fr, F.side).normalize(); lerp3(U, i, j, fr, F.up).normalize();
    F.k = K[i] + (K[j] - K[i]) * fr;
    return F;
  };
  T.curvAt = dist => K[Math.floor(T.wrap(dist) / ds) % n];
  T.newFrame = () => ({ pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3(), up: new THREE.Vector3(), k: 0 });

  // Sweep a cross-section profile ([side, up] pairs) along samples i0..i1.
  T.sweep = (profile, vTile, i0 = 0, i1 = n) => {
    const m = profile.length, count = i1 - i0 + 1;
    const pos = new Float32Array(count * m * 3), uv = new Float32Array(count * m * 2), idx = [];
    for (let a = 0; a < count; a++) {
      const i = (i0 + a) % n, dist = (i0 + a) * ds;
      for (let j = 0; j < m; j++) {
        const [x, y] = profile[j], k = a * m + j;
        for (let c = 0; c < 3; c++) pos[k * 3 + c] = P[i * 3 + c] + S[i * 3 + c] * x + U[i * 3 + c] * y;
        uv[k * 2] = j / (m - 1); uv[k * 2 + 1] = dist / vTile;
      }
    }
    for (let a = 0; a < count - 1; a++)
      for (let j = 0; j < m - 1; j++) {
        const A = a * m + j, D = A + 1, B = A + m, C = B + 1;
        idx.push(A, D, B, D, C, B);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  buildRoad(T);
  buildSetPieces(T);
  buildEnvironment(T);

  T.minimap = [];
  for (let i = 0; i < n; i += 6) T.minimap.push([P[i * 3], P[i * 3 + 2]]);

  T.update = (dt, time, camera) => { for (const fn of T.animated) fn(dt, time, camera); };
  T.dispose = () => T.group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); }
  });
  return T;
}

// ---------------------------------------------------------------------------
function buildRoad(T) {
  const th = T.theme, H = ROAD_HALF, vTile = T.L / Math.round(T.L / 40);

  // road surface: albedo + emissive lane markings
  const [c1, x1] = canvas2d(512, 1024);
  x1.fillStyle = th.road; x1.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 4000; i++) { x1.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x1.fillRect(Math.random() * 512, Math.random() * 1024, 2, 2); }
  x1.strokeStyle = 'rgba(255,255,255,0.05)'; x1.lineWidth = 2;
  for (let y = 0; y < 1024; y += 128) { x1.beginPath(); x1.moveTo(0, y); x1.lineTo(512, y); x1.stroke(); }
  const [c2, x2] = canvas2d(512, 1024);
  x2.fillStyle = '#000'; x2.fillRect(0, 0, 512, 1024);
  x2.fillStyle = th.edgeL; x2.fillRect(8, 0, 10, 1024);
  x2.fillStyle = th.edgeR; x2.fillRect(494, 0, 10, 1024);
  x2.fillStyle = th.lane;
  for (const x of [512 / 3, 1024 / 3]) x2.fillRect(x - 4, 0, 8, 360);
  x2.globalAlpha = 0.25;
  for (const x of [512 / 3, 1024 / 3]) x2.fillRect(x - 2, 360, 4, 664);
  x2.globalAlpha = 1;
  const road = new THREE.Mesh(T.sweep([[-H, 0], [H, 0]], vTile), new THREE.MeshStandardMaterial({
    map: tex(c1), emissiveMap: tex(c2), emissive: '#ffffff', emissiveIntensity: 1.4, roughness: 0.38, metalness: 0.55 }));
  T.group.add(road);

  // deck underside and ledges
  const deck = new THREE.Mesh(T.sweep([[-H, -0.02], [-H - 1.6, -0.02], [-H - 1.6, -2], [H + 1.6, -2], [H + 1.6, -0.02], [H, -0.02]], vTile),
    new THREE.MeshStandardMaterial({ color: th.deck, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide }));
  T.group.add(deck);
  for (const [sx, col] of [[-1, th.edgeL], [1, th.edgeR]]) {
    const strip = new THREE.Mesh(T.sweep([[sx * (H + 1.62), -0.7], [sx * (H + 1.62), -1.1]], vTile),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    T.group.add(strip);
  }

  // energy-barrier rails with flowing texture and a bright top tube
  const [c3, x3] = canvas2d(64, 256);
  const g = x3.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
  x3.fillStyle = g; x3.fillRect(0, 0, 64, 256);
  x3.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = 0; y < 256; y += 32) x3.fillRect(0, y, 64, 6);
  const railTex = tex(c3, 1, 1, false);
  for (const [sx, col] of [[-1, th.edgeL], [1, th.edgeR]]) {
    const wall = new THREE.Mesh(T.sweep([[sx * H, 0], [sx * H, 1.5]], 24), new THREE.MeshBasicMaterial({
      map: railTex, color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    T.group.add(wall);
    const tube = new THREE.Mesh(T.sweep([[sx * (H - 0.14), 1.52], [sx * (H + 0.14), 1.52]], 24),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    T.group.add(tube);
  }
  T.animated.push(dt => { railTex.offset.y -= dt * 1.5; });

  // support pillars
  const pil = [];
  for (let i = 0; i < T.n; i += 30) {
    const top = new THREE.Vector3(T.P[i * 3], T.P[i * 3 + 1], T.P[i * 3 + 2]).addScaledVector(new THREE.Vector3().fromArray(T.U, i * 3), -2);
    const h = top.y - T.groundY;
    if (h > 3) pil.push([top.x, T.groundY + h / 2, top.z, h]);
  }
  const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.4, 2, 1, 10), new THREE.MeshStandardMaterial({ color: th.deck, roughness: 0.6, metalness: 0.6 }), pil.length);
  const m = new THREE.Matrix4();
  pil.forEach(([x, y, z, h], i) => pm.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1))));
  T.group.add(pm);
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1.75, 0.18, 6, 20), new THREE.MeshBasicMaterial({ color: th.edgeR }), pil.length);
  const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  pil.forEach(([x, y, z, h], i) => rings.setMatrixAt(i, m.compose(new THREE.Vector3(x, T.groundY + h * 0.55, z), rq, new THREE.Vector3(1, 1, 1))));
  T.group.add(rings);
}

function frameBasis(T, i, flip) {
  const side = new THREE.Vector3().fromArray(T.S, i * 3), up = new THREE.Vector3().fromArray(T.U, i * 3), tan = new THREE.Vector3().fromArray(T.Tn, i * 3);
  const z = flip ? tan.clone().negate() : tan;
  const x = new THREE.Vector3().crossVectors(up, z);
  return { pos: new THREE.Vector3().fromArray(T.P, i * 3), side, up, tan, q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z)) };
}

function textTexture(lines, w, h, color, bg) {
  const [c, x] = canvas2d(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = color; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach(([str, size], i) => {
    x.font = `900 ${size}px Orbitron, Arial Black, sans-serif`;
    x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 18;
    x.fillText(str, w / 2, h * (i + 1) / (lines.length + 1));
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSetPieces(T) {
  const th = T.theme, H = ROAD_HALF;

  // start/finish gantry
  const b = frameBasis(T, 0, true);
  const gantry = new THREE.Group();
  gantry.position.copy(b.pos); gantry.quaternion.copy(b.q);
  const dark = new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.8, roughness: 0.35 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * H + 6, 3, 1.6), dark); beam.position.y = 10;
  gantry.add(beam);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 11.5, 1.4), dark); leg.position.set(sx * (H + 3), 4.5, 0); gantry.add(leg);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 11.5, 0.3), new THREE.MeshBasicMaterial({ color: sx < 0 ? th.edgeL : th.edgeR }));
    glow.position.set(sx * (H + 3), 4.5, 0.8); gantry.add(glow);
  }
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(2 * H + 4, 2.6), new THREE.MeshBasicMaterial({
    map: textTexture([['NEON VELOCITY', 120]], 1600, 200, th.arch, '#05030c') }));
  banner.position.set(0, 10, 0.82);
  gantry.add(banner);
  T.group.add(gantry);
  const [cc, cx] = canvas2d(256, 32);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { cx.fillStyle = (i + j) % 2 ? '#0b0b0f' : '#8a94a6'; cx.fillRect(i * 16, j * 16, 16, 16); }
  const checker = new THREE.Mesh(T.sweep([[-H, 0.03], [H, 0.03]], 4, 0, 2), new THREE.MeshBasicMaterial({ map: tex(cc, 1, 1) }));
  T.group.add(checker);

  // neon arches
  const archGeo = new THREE.TorusGeometry(H + 3.5, 0.45, 8, 48, Math.PI);
  const archA = new THREE.MeshBasicMaterial({ color: th.arch }), archB = new THREE.MeshBasicMaterial({ color: th.arch2 });
  for (let d = 160; d < T.L - 120; d += 280) {
    const fb = frameBasis(T, Math.round(d / T.ds) % T.n, false);
    const a1 = new THREE.Mesh(archGeo, archA); a1.position.copy(fb.pos); a1.quaternion.copy(fb.q);
    const a2 = new THREE.Mesh(archGeo, archB); a2.position.copy(fb.pos).addScaledVector(fb.tan, 3); a2.quaternion.copy(fb.q); a2.scale.setScalar(0.94);
    T.group.add(a1, a2);
  }

  // boost pads on the straightest sections
  const [pc, px] = canvas2d(128, 128);
  px.fillStyle = '#000'; px.fillRect(0, 0, 128, 128);
  px.strokeStyle = '#fff'; px.lineWidth = 14; px.lineJoin = 'miter';
  for (const y of [40, 100]) { px.beginPath(); px.moveTo(18, y + 22); px.lineTo(64, y - 18); px.lineTo(110, y + 22); px.stroke(); }
  const padTex = tex(pc, 1, 1, false);
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, color: th.pad, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const cands = [];
  for (let d = 220; d < T.L - 160; d += 20) {
    let k = 0;
    for (let a = 0; a < 160; a += 10) k += Math.abs(T.curvAt(d + a));
    cands.push([d, k]);
  }
  cands.sort((a, b2) => a[1] - b2[1]);
  for (const [d] of cands) {
    if (T.pads.length >= 6) break;
    if (T.pads.some(p => Math.abs(p.s0 - d) < 380)) continue;
    const lane = [-6, 0, 6][Math.floor(Math.random() * 3)], i0 = Math.round(d / T.ds);
    T.group.add(new THREE.Mesh(T.sweep([[lane - 3, 0.05], [lane + 3, 0.05]], 6, i0, i0 + 8), padMat));
    T.pads.push({ s0: d, s1: d + 16, d: lane });
  }
  T.animated.push(dt => { padTex.offset.y -= dt * 2.5; });

  // energy orbs (refill boost)
  const orbGeo = new THREE.OctahedronGeometry(0.6), orbMat = new THREE.MeshBasicMaterial({ color: th.orb });
  const F = T.newFrame();
  for (let gI = 0; gI < 8; gI++) {
    const base = 300 + (T.L - 500) * gI / 8 + rand(0, 80), lane = [-6, 0, 6][Math.floor(Math.random() * 3)];
    for (let k = 0; k < 4; k++) {
      const s = base + k * 12;
      T.frameAt(s, F);
      const mesh = new THREE.Mesh(orbGeo, orbMat);
      mesh.position.copy(F.pos).addScaledVector(F.side, lane).addScaledVector(F.up, 1.3);
      T.group.add(mesh);
      T.orbs.push({ s, d: lane, mesh, active: true });
    }
  }
  T.animated.push((dt, t) => { for (const o of T.orbs) { o.mesh.rotation.y = t * 3; o.mesh.visible = o.active; } });
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------
function farFromTrack(T, x, z, clearance) {
  const c2 = clearance * clearance;
  for (let i = 0; i < T.n; i += 6) {
    const dx = T.P[i * 3] - x, dz = T.P[i * 3 + 2] - z;
    if (dx * dx + dz * dz < c2) return false;
  }
  return true;
}
function scatter(T, count, near, far, clearance) {
  const out = [];
  for (let tries = 0; out.length < count && tries < count * 8; tries++) {
    const i = Math.floor(Math.random() * T.n), sgn = Math.random() < 0.5 ? -1 : 1, off = rand(near, far);
    const sx = T.S[i * 3], sz = T.S[i * 3 + 2], l = Math.hypot(sx, sz) || 1;
    const x = T.P[i * 3] + sx / l * off * sgn, z = T.P[i * 3 + 2] + sz / l * off * sgn;
    if (farFromTrack(T, x, z, clearance)) out.push([x, z]);
  }
  return out;
}

function makeSky(T) {
  const th = T.theme, sun = th.sun;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(th.sky[0]) }, horizon: { value: new THREE.Color(th.sky[1]) }, bottom: { value: new THREE.Color(th.sky[2]) },
      sunColor: { value: new THREE.Color(sun ? sun.color : '#000') }, sunDir: { value: new THREE.Vector3(...(sun ? sun.dir : [0, 1, 0])).normalize() },
      sunSize: { value: sun ? sun.size : 0 }, time: { value: 0 }
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top, horizon, bottom, sunColor, sunDir; uniform float sunSize, time; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.5)) : mix(horizon, bottom, pow(clamp(-h,0.0,1.0), 0.35));
        if (sunSize > 0.0) {
          float dist = distance(d, sunDir);
          float disc = smoothstep(sunSize, sunSize - 0.004, dist);
          float yy = (d.y - sunDir.y) / sunSize;
          float band = step(0.35, fract(yy * 7.0 - time * 0.15));
          disc *= yy > 0.1 ? 1.0 : band;
          vec3 sc = mix(sunColor, vec3(1.0, 0.2, 0.55), clamp(0.5 - yy * 0.6, 0.0, 1.0));
          col = mix(col, sc * 1.6, disc);
          col += sunColor * 0.45 * exp(-dist * 5.0);
        }
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
  sky.renderOrder = -1;
  T.group.add(sky);
  T.animated.push((dt, t, cam) => { if (cam) sky.position.copy(cam.position); mat.uniforms.time.value = t; });

  if (th.stars) {
    const pos = [];
    for (let i = 0; i < 2500; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0.05, 1), rand(-1, 1)).normalize().multiplyScalar(2800);
      pos.push(v.x, v.y, v.z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    T.group.add(stars);
    T.animated.push((dt, t, cam) => { if (cam) stars.position.copy(cam.position); });
  }
}

function buildEnvironment(T) {
  const th = T.theme, gY = T.groundY;
  makeSky(T);
  T.group.add(new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]));
  const dl = new THREE.DirectionalLight(th.dir[0], th.dir[1]); dl.position.set(-300, 500, 200);
  T.group.add(dl);
  T.fog = new THREE.Fog(th.fog, 120, th.fogFar);
  ({ city: envCity, desert: envDesert, grid: envGrid, ice: envIce })[T.def.theme](T, gY);
}

function gridFloor(T, gY, color, major, opacity) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: '#030208', roughness: 0.3, metalness: 0.7 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = gY;
  T.group.add(ground);
  const grid = new THREE.GridHelper(9000, major, color, color);
  grid.material.transparent = true; grid.material.opacity = opacity; grid.material.depthWrite = false;
  grid.position.y = gY + 0.1;
  T.group.add(grid);
}

function envCity(T, gY) {
  gridFloor(T, gY, '#ff2d95', 180, 0.22);
  // windows texture
  const [wc, wx] = canvas2d(128, 256);
  wx.fillStyle = '#05050b'; wx.fillRect(0, 0, 128, 256);
  const lit = ['#ffd29a', '#7df9ff', '#ff7ad9', '#ffffff'];
  for (let r = 0; r < 32; r++) for (let c = 0; c < 8; c++) {
    wx.fillStyle = Math.random() < 0.38 ? lit[Math.floor(Math.random() * lit.length)] : '#11111f';
    wx.fillRect(c * 16 + 3, r * 8 + 2, 10, 4);
  }
  const winTex = tex(wc, 2, 1);
  const spots = scatter(T, 520, 40, 900, 34);
  const classes = [40, 90, 160, 260];
  const neonCols = ['#ff2d95', '#00e5ff', '#a855f7', '#ffd60a'].map(c => new THREE.Color(c));
  const rimData = [];
  classes.forEach((hBase, ci) => {
    const mine = spots.filter((_, i) => i % 4 === ci);
    const t2 = winTex.clone(); t2.needsUpdate = true; t2.repeat.set(2, hBase / 22);
    const mat = new THREE.MeshStandardMaterial({ color: '#0b0b16', emissive: '#ffffff', emissiveMap: t2, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.6 });
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, mat, mine.length);
    const m = new THREE.Matrix4();
    mine.forEach(([x, z], i) => {
      const w = rand(16, 42), d = rand(16, 42), h = hBase * rand(0.8, 1.2) + Math.random() * 30;
      im.setMatrixAt(i, m.compose(new THREE.Vector3(x, gY, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI)), new THREE.Vector3(w, h, d)));
      if (ci >= 1) rimData.push([x, gY + h, z, w, d]);
    });
    T.group.add(im);
  });
  const rims = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), rimData.length);
  const m = new THREE.Matrix4();
  rimData.forEach(([x, y, z, w, d], i) => {
    rims.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w * 0.5, 1.5, d * 0.5)));
    rims.setColorAt(i, neonCols[i % neonCols.length]);
  });
  T.group.add(rims);

  // holographic billboards beside the track
  const ads = [['NEON VELOCITY', 'APEX LEAGUE 2087'], ['KAISER', 'INDUSTRIES'], ['VOLT', 'DRINK THE STORM'], ['SYNTH//CORP', 'WE BUILD TOMORROW'], ['NEO-KYOTO', 'NEVER SLEEPS']];
  const cols = ['#ff2d95', '#00e5ff', '#ffd60a', '#a855f7', '#39ff14'];
  const boards = [];
  for (let i = 0; i < 10; i++) {
    const idx = Math.floor((i + 0.5) / 10 * T.n), b = frameBasis(T, idx, true), sgn = i % 2 ? 1 : -1;
    const col = cols[i % cols.length], ad = ads[i % ads.length];
    const mat = new THREE.MeshBasicMaterial({ map: textTexture([[ad[0], 110], [ad[1], 60]], 1024, 512, col, 'rgba(5,3,15,0.55)'),
      transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(44, 22), mat);
    board.position.copy(b.pos).addScaledVector(b.side, sgn * (ROAD_HALF + 32)).addScaledVector(b.up, 18);
    board.quaternion.copy(b.q);
    board.rotateY(sgn * -0.5);
    T.group.add(board);
    boards.push(mat);
  }
  T.animated.push((dt, t) => boards.forEach((mt, i) => { mt.opacity = 0.75 + 0.15 * Math.sin(t * 7 + i) + (Math.random() < 0.01 ? -0.5 : 0); }));

  // flying traffic in the sky lanes
  const N = 80, fly = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.8, 5), new THREE.MeshBasicMaterial(), N);
  const lanes = [];
  for (let i = 0; i < N; i++) {
    lanes.push({ r: rand(300, 1400), a: rand(0, Math.PI * 2), y: gY + rand(80, 260), sp: rand(0.03, 0.09) * (Math.random() < 0.5 ? 1 : -1) });
    fly.setColorAt(i, new THREE.Color(i % 3 ? '#ffffff' : '#ff3b5c'));
  }
  T.group.add(fly);
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), mm = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  T.animated.push(dt => lanes.forEach((l, i) => {
    l.a += l.sp * dt;
    q.setFromAxisAngle(up, -l.a + (l.sp > 0 ? 0 : Math.PI));
    fly.setMatrixAt(i, mm.compose(new THREE.Vector3(Math.cos(l.a) * l.r, l.y, Math.sin(l.a) * l.r), q, one));
    fly.instanceMatrix.needsUpdate = true;
  }));
}

function envDesert(T, gY) {
  const geo = new THREE.PlaneGeometry(9000, 9000, 140, 140);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = [], cLow = new THREE.Color('#3b1230'), cHigh = new THREE.Color('#d9612b'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = 7 * Math.sin(x * 0.006 + z * 0.002) + 5 * Math.sin(z * 0.011 + x * 0.004) + 3 * Math.sin((x + z) * 0.02);
    pos.setY(i, gY + h);
    c.copy(cLow).lerp(cHigh, (h + 15) / 30);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  T.group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
  const grid = new THREE.GridHelper(9000, 90, '#ff2d95', '#ff2d95');
  grid.material.transparent = true; grid.material.opacity = 0.12; grid.position.y = gY + 16;
  T.group.add(grid);

  const mesaMat = new THREE.MeshStandardMaterial({ color: '#8a2f1d', roughness: 0.9, flatShading: true });
  for (let i = 0; i < 50; i++) {
    const a = rand(0, Math.PI * 2), r = rand(T.def.R * 1.7, 3200), h = rand(40, 220), rad = rand(40, 160);
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.75, rad, h, 7), mesaMat);
    mesa.position.set(Math.cos(a) * r, gY + h / 2, Math.sin(a) * r);
    T.group.add(mesa);
  }
  const obMat = new THREE.MeshStandardMaterial({ color: '#1a0b1f', roughness: 0.4, metalness: 0.8 });
  const edgeMat = new THREE.LineBasicMaterial({ color: '#ff6b00' });
  for (const [x, z] of scatter(T, 26, 60, 500, 40)) {
    const h = rand(40, 120), geo2 = new THREE.ConeGeometry(h * 0.18, h, 4);
    const ob = new THREE.Mesh(geo2, obMat); ob.position.set(x, gY + h / 2, z);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo2), edgeMat); ob.add(edges);
    T.group.add(ob);
  }
}

function envGrid(T, gY) {
  gridFloor(T, gY, '#00e5ff', 220, 0.45);
  const g2 = new THREE.GridHelper(9000, 22, '#ff2d95', '#ff2d95');
  g2.material.transparent = true; g2.material.opacity = 0.6; g2.position.y = gY + 0.2;
  T.group.add(g2);
  const shapes = [], cols = ['#00e5ff', '#ff2d95', '#39ff14', '#ffd60a', '#a855f7'];
  for (let i = 0; i < 46; i++) {
    const r = rand(20, 90);
    const geo = [new THREE.IcosahedronGeometry(r, 1), new THREE.OctahedronGeometry(r), new THREE.TorusGeometry(r, r * 0.25, 8, 24), new THREE.BoxGeometry(r, r, r)][i % 4];
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], wireframe: true, transparent: true, opacity: 0.7 }));
    const a = rand(0, Math.PI * 2), d = rand(T.def.R * 0.2, 2200);
    mesh.position.set(Math.cos(a) * d, gY + rand(60, 380), Math.sin(a) * d);
    if (!farFromTrack(T, mesh.position.x, mesh.position.z, r + 60)) mesh.position.y += 200;
    mesh.userData.spin = new THREE.Vector3(rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4));
    T.group.add(mesh); shapes.push(mesh);
  }
  for (const [x, z] of scatter(T, 24, 80, 900, 50)) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 1600, 12, 1, true), new THREE.MeshBasicMaterial({
      color: Math.random() < 0.5 ? '#00e5ff' : '#ff2d95', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.set(x, gY + 800, z);
    T.group.add(beam);
  }
  T.animated.push(dt => shapes.forEach(s => { s.rotation.x += s.userData.spin.x * dt; s.rotation.y += s.userData.spin.y * dt; s.rotation.z += s.userData.spin.z * dt; }));
}

function envIce(T, gY) {
  const geo = new THREE.PlaneGeometry(9000, 9000, 100, 100);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, gY + 6 * Math.sin(pos.getX(i) * 0.005) * Math.cos(pos.getZ(i) * 0.004));
  geo.computeVertexNormals();
  T.group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#b9d4ee', roughness: 0.85, metalness: 0.05 })));

  const rockMat = new THREE.MeshStandardMaterial({ color: '#cfe0f2', roughness: 0.8, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#334a66', roughness: 0.9, flatShading: true });
  for (let i = 0; i < 70; i++) {
    const a = rand(0, Math.PI * 2), r = rand(T.def.R * 1.8, 3400), h = rand(180, 700), rad = rand(150, 420);
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 6 + Math.floor(Math.random() * 3)), i % 3 ? rockMat : darkMat);
    mtn.position.set(Math.cos(a) * r, gY + h / 2 - 10, Math.sin(a) * r);
    mtn.rotation.y = rand(0, 3);
    T.group.add(mtn);
  }
  const spots = scatter(T, 160, 30, 600, 30);
  const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1), new THREE.MeshStandardMaterial({
    color: '#7dd3fc', emissive: '#0ea5e9', emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.8 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    const s = rand(3, 12);
    crystals.setMatrixAt(i, m.compose(new THREE.Vector3(x, gY + s * 1.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3))), new THREE.Vector3(s, s * 3, s)));
  });
  T.group.add(crystals);

  // aurora curtains
  const auroraMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; varying vec2 vUv;
      void main(){
        float wave = sin(vUv.x * 18.0 + time * 0.8) * 0.5 + sin(vUv.x * 41.0 - time * 1.3) * 0.25;
        float a = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.45 + wave * 0.15, 1.0, vUv.y));
        vec3 col = mix(vec3(0.1, 1.0, 0.55), vec3(0.75, 0.3, 1.0), vUv.y);
        gl_FragColor = vec4(col * a * (0.55 + 0.45 * sin(vUv.x * 7.0 + time)), 1.0);
      }`
  });
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(3600, 520, 80, 1), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 0.003 + i) * 260);
    const mesh = new THREE.Mesh(g, auroraMat);
    mesh.position.set(rand(-600, 600), gY + 520 + i * 90, -1700 + i * 260);
    mesh.rotation.y = rand(-0.4, 0.4);
    T.group.add(mesh);
  }
  T.animated.push((dt, t) => { auroraMat.uniforms.time.value = t; });

  // snowfall around the camera
  const N = 2500, sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { sp[i * 3] = rand(-120, 120); sp[i * 3 + 1] = rand(-40, 80); sp[i * 3 + 2] = rand(-120, 120); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
  snow.frustumCulled = false;
  T.group.add(snow);
  T.animated.push((dt, t, cam) => {
    if (!cam) return;
    snow.position.copy(cam.position);
    for (let i = 0; i < N; i++) {
      sp[i * 3 + 1] -= dt * 9;
      sp[i * 3] += Math.sin(t + i) * dt * 2;
      if (sp[i * 3 + 1] < -40) sp[i * 3 + 1] += 120;
    }
    sg.attributes.position.needsUpdate = true;
  });
}
