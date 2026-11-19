import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Particle sparks, warp speed lines and neon light trails.
// ---------------------------------------------------------------------------

export class Sparks {
  constructor(scene, max = 700) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3).fill(-1e5);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.32, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.c = new THREE.Color();
  }
  burst(p, count, color, speed, life, up) {
    this.c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.i = (this.i + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      if (up) v.addScaledVector(up, speed * 0.4);
      this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
      this.life[i] = life * (0.5 + Math.random() * 0.5);
      this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
    }
  }
  update(dt) {
    const fade = Math.exp(-2.5 * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1e5; continue; }
      this.vel[i * 3 + 1] -= 18 * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      for (let k = 0; k < 3; k++) this.col[i * 3 + k] *= fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class SpeedLines {
  constructor(camera, count = 160) {
    this.count = count;
    this.seg = [];
    const pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) this.seg.push(this.spawn({}, true));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    camera.add(this.lines);
  }
  spawn(s, anywhere) {
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 9;
    s.x = Math.cos(a) * r; s.y = Math.sin(a) * r * 0.7;
    s.z = anywhere ? -Math.random() * 90 : -90;
    s.len = 3 + Math.random() * 8;
    return s;
  }
  update(dt, speed, intensity) {
    this.mat.opacity = Math.min(0.7, intensity);
    this.lines.visible = intensity > 0.02;
    if (!this.lines.visible) return;
    const p = this.lines.geometry.attributes.position.array;
    this.seg.forEach((s, i) => {
      s.z += speed * 1.6 * dt;
      if (s.z > 0) this.spawn(s, false);
      p.set([s.x, s.y, s.z, s.x, s.y, s.z - s.len * (0.5 + intensity)], i * 6);
    });
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

export class Trail {
  constructor(scene, color, n = 36, width = 1.1) {
    this.n = n; this.w = width; this.ready = false;
    this.pos = new Float32Array(n * 2 * 3);
    const col = new Float32Array(n * 2 * 3), c = new THREE.Color(color), idx = [];
    for (let i = 0; i < n; i++) {
      const f = Math.pow(1 - i / (n - 1), 1.6);
      for (let k = 0; k < 2; k++) col.set([c.r * f, c.g * f, c.b * f], (i * 2 + k) * 3);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  push(p, side, visible) {
    this.mesh.visible = visible;
    const a = this.pos, hw = this.w / 2;
    if (!this.ready || !visible) {
      for (let i = 0; i < this.n; i++) {
        a.set([p.x - side.x * hw, p.y - side.y * hw, p.z - side.z * hw, p.x + side.x * hw, p.y + side.y * hw, p.z + side.z * hw], i * 6);
      }
      this.ready = visible;
    } else {
      a.copyWithin(6, 0, (this.n - 1) * 6);
      a.set([p.x - side.x * hw, p.y - side.y * hw, p.z - side.z * hw, p.x + side.x * hw, p.y + side.y * hw, p.z + side.z * hw], 0);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}
