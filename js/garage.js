import * as THREE from 'three';
import { buildCar } from './car.js';

// ---------------------------------------------------------------------------
// Garage showroom: a neon turntable that presents the selected car.
// ---------------------------------------------------------------------------
export class Showroom {
  constructor(camera, envMap) {
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#04050b');
    this.scene.fog = new THREE.Fog('#04050b', 18, 60);
    this.scene.environment = envMap;
    this.envMap = envMap;
    this.t = 0;

    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: '#07080f', roughness: 0.25, metalness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(120, 60, '#1e3a5f', '#0f1d30');
    grid.position.y = 0.01;
    this.scene.add(grid);

    this.table = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.4, 0.3, 64), new THREE.MeshStandardMaterial({ color: '#10131d', roughness: 0.3, metalness: 0.9 }));
    disc.position.y = 0.15;
    this.table.add(disc);
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#00e5ff' });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.06, 8, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
    this.table.add(ring);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.06), this.ringMat);
      tick.position.set(Math.cos(a) * 4.7, 0.31, Math.sin(a) * 4.7); tick.rotation.y = -a;
      this.table.add(tick);
    }
    this.scene.add(this.table);

    const cols = ['#ff2d95', '#00e5ff', '#a855f7', '#00e5ff', '#ff2d95', '#a855f7'];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 9, 0.15), new THREE.MeshBasicMaterial({ color: cols[i] }));
      bar.position.set(Math.cos(a) * 14, 4.5, Math.sin(a) * 14);
      this.scene.add(bar);
    }
    this.scene.add(new THREE.HemisphereLight('#8fb3ff', '#1a1030', 0.5));
    const key = new THREE.SpotLight('#ffffff', 220, 40, 0.5, 0.6); key.position.set(6, 14, 8); key.target.position.set(0, 0, 0);
    const rim = new THREE.SpotLight('#ff2d95', 90, 40, 0.6, 0.7); rim.position.set(-10, 8, -8);
    const fill = new THREE.PointLight('#00e5ff', 25, 30); fill.position.set(-6, 3, 6);
    this.scene.add(key, key.target, rim, fill);
    this.car = null; this.model = null;
  }

  show(model, look) {
    if (this.car && this.model === model) { this.car.setLook(look); return; }
    if (this.car) { this.table.remove(this.car.group); this.car.dispose(); }
    this.car = buildCar(model, look, { envMap: this.envMap });
    this.car.group.position.y = 0.3;
    this.car.group.scale.setScalar(1.1);
    this.table.add(this.car.group);
    this.model = model;
  }

  setLook(look) { if (this.car) this.car.setLook(look); }

  update(dt) {
    this.t += dt;
    this.table.rotation.y += dt * 0.35;
    if (this.car) this.car.update(dt, this.t, 0.35, false);
    const wide = this.camera.aspect > 1.1;
    const r = wide ? 15 : 19, a = 0.8 + Math.sin(this.t * 0.2) * 0.15;
    this.camera.position.set(Math.cos(a) * r, wide ? 5 : 7, Math.sin(a) * r);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(wide ? 3.2 : 0, wide ? 0.6 : -1.5, wide ? -3.1 : 0); // shift the car left of the UI panel
    if (this.camera.fov !== 45) { this.camera.fov = 45; this.camera.updateProjectionMatrix(); }
  }
}
