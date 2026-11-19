import * as THREE from 'three';
import { FINISHES } from './data.js';

// ---------------------------------------------------------------------------
// Procedural hover-cars. Local axes: +Z forward, +Y up, +X left.
// outline: half-width profile [x, forward] from nose to tail.
// canopy: [forward center, length, width, height]. thr: thruster x positions.
// ---------------------------------------------------------------------------
export const MODELS = {
  striker: { outline: [[0.35, 2.3], [0.85, 2.05], [1.05, 1.0], [1.12, -0.6], [1.02, -2.0], [0.72, -2.3]], h: 0.42, canopy: [0.25, 1.35, 0.62, 0.48], thr: [-0.5, 0.5] },
  dart: { outline: [[0.12, 2.7], [0.55, 1.9], [0.95, 0.5], [1.08, -1.1], [0.9, -2.2], [0.55, -2.4]], h: 0.36, canopy: [0.1, 1.5, 0.5, 0.42], thr: [-0.45, 0.45], pods: true },
  tank: { outline: [[0.8, 2.25], [1.15, 1.95], [1.28, 0.4], [1.3, -1.6], [1.12, -2.3], [0.8, -2.4]], h: 0.62, canopy: [0.35, 1.3, 0.75, 0.5], thr: [-0.75, 0, 0.75] },
  wedge: { outline: [[0.18, 2.55], [0.95, 1.4], [1.2, -0.3], [1.22, -1.9], [0.95, -2.35]], h: 0.34, canopy: [-0.1, 1.4, 0.6, 0.38], thr: [-0.6, 0.6] },
  blade: { outline: [[0.08, 2.9], [0.42, 1.8], [0.7, 0.9], [1.2, 0.2], [1.24, -1.3], [0.65, -2.5]], h: 0.3, canopy: [0.5, 1.6, 0.42, 0.4], thr: [-0.38, 0, 0.38], pods: true }
};

let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

function outlineLoop(M, scale = 1) {
  const right = M.outline.map(([x, f]) => new THREE.Vector3(x * scale, 0, f * scale));
  const left = M.outline.slice().reverse().map(([x, f]) => new THREE.Vector3(-x * scale, 0, f * scale));
  return new THREE.CatmullRomCurve3([...right, ...left], true, 'centripetal');
}

function hullGeometry(M) {
  const pts = outlineLoop(M).getPoints(90).map(v => new THREE.Vector2(v.x, -v.z));
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: M.h, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.16, bevelSegments: 4, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.45, 0);
  g.computeVertexNormals();
  return g;
}

export function buildCar(modelId, look, opts = {}) {
  const M = MODELS[modelId];
  const front = M.outline[0][1], rear = M.outline[M.outline.length - 1][1];
  const maxW = Math.max(...M.outline.map(o => o[0]));
  const top = M.h + 0.62;

  const group = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.order = 'YXZ';
  group.add(body);

  const mats = {
    paint: new THREE.MeshPhysicalMaterial({ color: look.paint }),
    accent: new THREE.MeshStandardMaterial({ color: look.accent, metalness: 0.7, roughness: 0.35 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#05070d', metalness: 0.9, roughness: 0.05, clearcoat: 1 }),
    neon: new THREE.MeshBasicMaterial({ color: look.neon }),
    thr: new THREE.MeshBasicMaterial({ color: look.thruster }),
    flame: new THREE.MeshBasicMaterial({ color: look.thruster, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ color: look.neon, map: getGlowTexture(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    head: new THREE.MeshBasicMaterial({ color: '#f8fafc' }),
    tail: new THREE.MeshBasicMaterial({ color: '#ff2a3a' })
  };
  if (opts.envMap) for (const k of ['paint', 'accent', 'glass']) { mats[k].envMap = opts.envMap; mats[k].envMapIntensity = 0.8; }
  if (opts.ghost) for (const k of ['paint', 'accent', 'glass']) { mats[k].transparent = true; mats[k].opacity = 0.7; }

  const hull = new THREE.Mesh(hullGeometry(M), mats.paint);
  body.add(hull);

  // skirt + glowing outline around the base
  const skirtShape = new THREE.Shape(outlineLoop(M, 0.93).getPoints(60).map(v => new THREE.Vector2(v.x, -v.z)));
  const skirt = new THREE.Mesh(new THREE.ExtrudeGeometry(skirtShape, { depth: 0.22, bevelEnabled: false }), mats.accent);
  skirt.geometry.rotateX(-Math.PI / 2); skirt.position.y = 0.12;
  body.add(skirt);
  const ring = new THREE.Mesh(new THREE.TubeGeometry(outlineLoop(M, 1.02), 120, 0.05, 6, true), mats.neon);
  ring.position.y = 0.3;
  body.add(ring);

  const [cf, cl, cw, ch] = M.canopy;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mats.glass);
  canopy.scale.set(cw, ch, cl); canopy.position.set(0, top - 0.08, cf);
  body.add(canopy);

  if (M.pods) {
    for (const sx of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 2.0, 6, 12), mats.paint);
      pod.rotation.x = Math.PI / 2; pod.position.set(sx * (maxW + 0.12), 0.55, -0.5);
      body.add(pod);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 2.2), mats.neon);
      stripe.position.set(sx * (maxW + 0.37), 0.55, -0.5);
      body.add(stripe);
    }
  }

  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.12), mats.head);
    hl.position.set(sx * Math.max(0.2, Math.min(0.55, M.outline[1][0] * 0.6)), 0.75, front - 0.12);
    body.add(hl);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(maxW * 1.5, 0.08, 0.06), mats.tail);
  tail.position.set(0, top - 0.12, rear + 0.08);
  body.add(tail);

  const flames = [];
  for (const x of M.thr) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, 0.6, 16), mats.accent);
    housing.rotation.x = Math.PI / 2; housing.position.set(x, 0.62, rear + 0.15);
    body.add(housing);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.23, 16), mats.thr);
    disc.rotation.y = Math.PI; disc.position.set(x, 0.62, rear - 0.16);
    body.add(disc);
    const fg = new THREE.ConeGeometry(0.22, 1.6, 12, 1, true);
    fg.translate(0, 0.8, 0); fg.rotateX(-Math.PI / 2);
    const flame = new THREE.Mesh(fg, mats.flame);
    flame.position.set(x, 0.62, rear - 0.16);
    body.add(flame);
    flames.push(flame);
  }

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(maxW * 3.4, (front - rear) * 1.45), mats.glow);
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04;
  group.add(glow);

  let wing = null, wingId = null;
  function buildWing(id) {
    if (wing) { body.remove(wing); wing.traverse(o => o.geometry && o.geometry.dispose()); }
    wing = new THREE.Group(); wingId = id;
    if (id === 'fin') {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 1.3), mats.paint);
      fin.position.set(0, top + 0.25, rear + 0.75); fin.rotation.x = -0.25;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 1.2), mats.neon);
      edge.position.set(0, top + 0.62, rear + 0.65); edge.rotation.x = -0.25;
      wing.add(fin, edge);
    } else if (id === 'wing') {
      for (const sx of [-1, 1]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.3), mats.accent);
        strut.position.set(sx * 0.55, top + 0.15, rear + 0.45); wing.add(strut);
      }
      const blade = new THREE.Mesh(new THREE.BoxGeometry(maxW * 2.3, 0.08, 0.65), mats.paint);
      blade.position.set(0, top + 0.45, rear + 0.4); blade.rotation.x = 0.12;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(maxW * 2.3, 0.05, 0.05), mats.neon);
      edge.position.set(0, top + 0.43, rear + 0.08);
      wing.add(blade, edge);
    } else if (id === 'twin') {
      for (const sx of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.7, 1.1), mats.paint);
        fin.position.set(sx * 0.62, top + 0.2, rear + 0.7); fin.rotation.set(-0.3, 0, sx * -0.35);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 1.0), mats.neon);
        edge.position.set(sx * 0.74, top + 0.52, rear + 0.62); edge.rotation.set(-0.3, 0, sx * -0.35);
        wing.add(fin, edge);
      }
    }
    body.add(wing);
  }

  const api = {
    group, body, mats, length: front - rear, width: maxW * 2,
    setLook(lk) {
      const f = FINISHES.find(x => x.id === lk.finish) || FINISHES[0];
      mats.paint.color.set(lk.paint);
      mats.paint.metalness = f.metal; mats.paint.roughness = f.rough;
      mats.paint.clearcoat = f.clearcoat; mats.paint.clearcoatRoughness = 0.1;
      mats.paint.iridescence = f.iridescence || 0; mats.paint.iridescenceIOR = 1.7;
      mats.accent.color.set(lk.accent);
      mats.neon.color.set(lk.neon); mats.glow.color.set(lk.neon);
      mats.thr.color.set(lk.thruster); mats.flame.color.set(lk.thruster);
      if (lk.wing !== wingId) buildWing(lk.wing);
    },
    update(dt, t, throttle, boosting) {
      const len = 0.3 + throttle * 0.45 + (boosting ? 0.75 : 0) + Math.random() * 0.12;
      for (const fl of flames) fl.scale.set(boosting ? 1.35 : 1, boosting ? 1.35 : 1, len);
      mats.flame.opacity = 0.35 + throttle * 0.25;
      body.position.y = 0.08 + Math.sin(t * 3 + group.id) * 0.06;
      mats.glow.opacity = 0.42 + Math.sin(t * 5) * 0.08;
    },
    dispose() {
      group.traverse(o => o.geometry && o.geometry.dispose());
      for (const k in mats) mats[k].dispose();
    }
  };
  api.setLook(look);
  return api;
}
