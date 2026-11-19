import * as THREE from 'three';
import { buildTrack, ROAD_HALF } from './track.js';
import { buildCar } from './car.js';
import { Sparks, SpeedLines, Trail } from './fx.js';
import { CAR_BY_ID, carStats, TRACK_BY_ID } from './data.js';
import { Sound } from './audio.js';

// ---------------------------------------------------------------------------
// A race session. Every racer lives in track space:
//   dist = meters travelled along the centre line (monotonic, laps = dist / L)
//   d    = lateral offset from the centre line (+ is toward the frame's right)
// ---------------------------------------------------------------------------

const HALF_W = 1.2, CAR_LEN = 4.8, LIM = ROAD_HALF - HALF_W;
const clamp = THREE.MathUtils.clamp, rand = (a, b) => a + Math.random() * (b - a);
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

function makeTag(name, color, boss) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(5,6,14,0.7)'; x.fillRect(16, 10, 224, 44);
  x.fillStyle = color; x.fillRect(16, 10, 6, 44);
  x.font = `900 ${boss ? 30 : 26}px Orbitron, Arial Black, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = boss ? color : '#9aa7b8';
  x.fillText(name, 132, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, color: '#b8c2d0' }));
  s.scale.set(2.8, 0.7, 1); s.position.y = 2.8;
  return s;
}

export class Race {
  // opts: { trackId, laps, mode: 'race'|'timetrial'|'attract', player: {carId, upg, look}|null,
  //         rivals: [{name, carId, look, skill, boss, ghost}], camera, envMap, camMode }
  constructor(opts) {
    this.opts = opts;
    this.mode = opts.mode;
    this.laps = opts.mode === 'attract' ? Infinity : opts.laps;
    this.track = buildTrack(TRACK_BY_ID[opts.trackId]);
    this.scene = new THREE.Scene();
    this.scene.fog = this.track.fog;
    this.envMap = opts.envMap || null;
    this.scene.add(this.track.group);
    this.camera = opts.camera;
    this.camera.fov = 62; this.camera.updateProjectionMatrix();
    this.scene.add(this.camera);
    this.sparks = new Sparks(this.scene);
    this.lines = new SpeedLines(this.camera);
    this.F = this.track.newFrame();
    this.F2 = this.track.newFrame();
    this.m4 = new THREE.Matrix4(); this.vx = new THREE.Vector3(); this.tmp = new THREE.Vector3();

    const entries = [...(opts.rivals || [])];
    const total = entries.length + (opts.player ? 1 : 0);
    const pSlot = opts.player ? (total > 2 ? Math.floor(total / 2) : total - 1) : -1;
    this.racers = [];
    let ri = 0;
    for (let slot = 0; slot < total; slot++) {
      const isP = slot === pSlot;
      const e = isP ? { name: 'ACE', carId: opts.player.carId, upg: opts.player.upg, look: opts.player.look, skill: 1 } : entries[ri++];
      this.racers.push(this.makeRacer(e, isP, slot, total));
    }
    this.player = this.racers.find(r => r.isPlayer) || null;
    this.focus = this.racers[0];

    this.state = this.mode === 'attract' ? 'attract' : 'intro';
    this.t = 0; this.stateT = 0; this.raceTime = 0;
    this.finishOrder = []; this.messages = []; this.done = false;
    this.camMode = opts.camMode || 0;
    this.shake = 0; this.flash = 0;
    this.camPos = new THREE.Vector3(); this.camUp = new THREE.Vector3(0, 1, 0);
    this.introCamera(0);
    this.camPos.copy(this.camera.position);
    for (const r of this.racers) this.place(r, 0);
    this.updateRanks();
  }

  makeRacer(e, isP, slot, total) {
    const car = CAR_BY_ID[e.carId];
    let st = carStats(car, e.upg || {});
    if (!isP) {
      const k = e.skill || 1;
      st = { ...st, top: st.top * k, accel: st.accel * k, grip: st.grip * (0.82 + 0.18 * k) };
    }
    const mesh = buildCar(car.model, e.look, { ghost: e.ghost, envMap: this.envMap });
    this.scene.add(mesh.group);
    const solo = total === 1;
    const r = {
      name: e.name, isPlayer: isP, car, st, mesh, boss: e.boss || null,
      dist: solo ? -12 : -10 - Math.floor(slot / 2) * 11, d: solo ? 0 : (slot % 2 ? 4.5 : -4.5),
      v: 0, vd: 0, boost: st.boostMax * 0.5, hp: st.hp, lap: 0, lapStart: 0, lapTimes: [], bestLap: Infinity,
      finished: false, finishTime: 0, rank: slot + 1, yaw: 0, roll: 0, pitch: 0, padT: 0, invuln: 0, wreckT: 0,
      slip: 0, steerIn: 0, throttle: 0, boosting: false, sliding: false, onPad: false, bumpCD: 0, damageTaken: 0,
      ai: { lineBias: rand(-1.5, 1.5), boostT: 0, boostCD: rand(3, 8) },
      trail: new Trail(this.scene, e.look.neon, 24, 0.45)
    };
    if (!isP) { r.tag = makeTag(e.name, e.look.neon, !!e.boss); mesh.group.add(r.tag); }
    return r;
  }

  msg(text, color = '#ffffff', big = false) { this.messages.push({ text, color, big }); }
  takeMessages() { const m = this.messages; this.messages = []; return m; }

  // ---------------------------------------------------------------- update
  update(dt, input) {
    this.t += dt; this.stateT += dt;
    if (this.state === 'intro' && (this.stateT > 3.4 || input.skip)) { this.state = 'countdown'; this.stateT = 0; this.lastCount = 4; }
    if (this.state === 'countdown') {
      const n = 3 - Math.floor(this.stateT);
      if (n !== this.lastCount && n >= 1) { this.lastCount = n; Sound.play('beep'); this.msg(String(n), '#ffffff', true); }
      if (this.stateT >= 3) { this.state = 'race'; this.stateT = 0; Sound.play('go'); this.msg('GO!', '#39ff14', true); }
    }
    const live = this.state === 'race' || this.state === 'finish' || this.state === 'attract';
    if (this.state === 'race') this.raceTime += dt;

    for (const r of this.racers) {
      let inp;
      if (r.isPlayer && this.state === 'race' && !r.finished) inp = input;
      else if (live) inp = this.aiInput(r, dt);
      else inp = { steer: 0, throttle: 0, brake: 0, boost: false };
      this.step(r, dt, inp, live);
    }
    if (live) this.collide();
    for (const r of this.racers) this.place(r, dt);
    this.updateRanks();

    if (this.state === 'finish' && !this.done && (this.stateT > 4 || this.racers.every(r => r.finished))) {
      this.done = true;
      this.result = this.buildResult();
    }
    if (this.state === 'attract' && this.stateT > 9) { this.stateT = 0; this.focus = this.racers[Math.floor(Math.random() * this.racers.length)]; }

    this.updateCamera(dt);
    this.track.update(dt, this.t, this.camera);
    this.sparks.update(dt);
    const p = this.player;
    const inten = p && this.state === 'race' ? Math.max(0, (p.v / p.st.top - 0.72) * 2.5) + (p.boosting ? 0.45 : 0) + (p.padT > 0 ? 0.3 : 0) : 0;
    this.lines.update(dt, p ? p.v : 0, inten);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 2);
  }

  step(r, dt, inp, live) {
    const st = r.st, F = this.track.frameAt(r.dist, this.F);
    r.invuln = Math.max(0, r.invuln - dt); r.bumpCD -= dt; r.padT -= dt;
    if (r.wreckT > 0) {
      r.wreckT -= dt;
      r.v *= Math.exp(-3 * dt);
      if (r.wreckT <= 0) { r.hp = st.hp * 0.6; r.invuln = 2.5; r.d = clamp(r.d, -4, 4); r.vd = 0; }
    }
    let top = st.top;
    r.slip = 0;
    if (live) for (const o of this.racers) {
      if (o === r) continue;
      const gap = o.dist - r.dist;
      if (gap > 5 && gap < 32 && Math.abs(o.d - r.d) < 2.4) r.slip = Math.max(r.slip, 1 - gap / 32);
    }
    if (r.slip > 0) { top *= 1 + 0.06 * r.slip; r.boost = Math.min(st.boostMax, r.boost + 10 * r.slip * dt); }
    if (r.padT > 0) top *= 1.22;
    r.boosting = live && inp.boost && r.boost > 0.5 && r.wreckT <= 0;
    if (r.boosting) { top *= 1.32; r.boost = Math.max(0, r.boost - 24 * dt); }
    else if (live) r.boost = Math.min(st.boostMax, r.boost + 1.2 * dt);

    const thr = r.wreckT > 0 ? 0 : (r.boosting ? 1 : inp.throttle);
    r.throttle = thr;
    if (thr > 0 && r.v < top) r.v += st.accel * (r.boosting ? 1.7 : 1) * thr * Math.max(0.1, 1 - (r.v / top) ** 2) * dt;
    if (inp.brake > 0) r.v -= 60 * inp.brake * dt;
    if (thr === 0) r.v -= (3 + r.v * 0.015) * dt;
    if (r.v > top) r.v = Math.max(top, r.v - 28 * dt);
    r.v = Math.max(0, r.v);

    // lateral: steering, plus sliding outward when the corner needs more grip than we have
    const steerRate = st.steer * (0.5 + 0.5 * Math.min(1, r.v / 45));
    r.steerIn = inp.steer;
    r.vd += (inp.steer * steerRate - r.vd) * Math.min(1, dt * 7);
    const need = F.k * r.v * r.v, excess = Math.abs(need) - st.grip;
    r.sliding = excess > 0 && r.v > 20;
    r.slideDir = Math.sign(need);
    if (excess > 0) { r.vd -= Math.sign(need) * excess * 1.8 * dt; r.v -= excess * 0.05 * dt; }
    r.d += r.vd * dt;

    if (Math.abs(r.d) > LIM) {
      const sg = Math.sign(r.d), impact = r.vd * sg;
      r.d = sg * LIM;
      if (impact > 0) {
        r.vd = -r.vd * 0.4;
        if (impact > 7) {
          this.damage(r, impact * 0.9);
          r.v *= 0.9;
          this.sparkSide(r, sg, 26);
          if (r.isPlayer) { Sound.play('bump'); this.shake = Math.max(this.shake, 0.5); }
        }
      }
      r.v = Math.max(0, r.v - 14 * dt);
      if (r.v > 15) this.sparkSide(r, sg, 2);
      if (r.isPlayer && r.v > 15 && (this.scrapeCD = (this.scrapeCD || 0) - dt) < 0) { Sound.play('scrape'); this.scrapeCD = 0.12; }
    }

    const prev = r.dist;
    r.dist += r.v * dt / Math.max(0.6, 1 - F.k * r.d); // the inside line is shorter
    if (live) {
      this.checkPads(r);
      if (r.isPlayer) this.checkOrbs(r);
      this.checkLap(r, prev);
    }
  }

  checkPads(r) {
    const s = this.track.wrap(r.dist);
    let on = false;
    for (const p of this.track.pads) if (s >= p.s0 && s <= p.s1 && Math.abs(r.d - p.d) < 3.6) on = true;
    if (on && !r.onPad) {
      r.padT = 1.6;
      r.v = Math.max(r.v, r.st.top * 1.08);
      if (r.isPlayer) { Sound.play('nitro'); this.shake = Math.max(this.shake, 0.25); this.msg('BOOST PAD', this.track.theme.pad); }
    }
    r.onPad = on;
  }

  checkOrbs(r) {
    const s = this.track.wrap(r.dist);
    for (const o of this.track.orbs) {
      if (o.active && Math.abs(o.s - s) < 2.8 && Math.abs(o.d - r.d) < 2.3) {
        o.active = false;
        r.boost = Math.min(r.st.boostMax, r.boost + r.st.boostMax * 0.12);
        Sound.play('coin');
        this.sparks.burst(o.mesh.position, 14, this.track.theme.orb, 7, 0.6);
      }
    }
  }

  checkLap(r, prev) {
    const L = this.track.L;
    if (Math.floor(r.dist / L) <= Math.floor(prev / L)) return;
    const lap = Math.floor(r.dist / L) + 1;
    if (lap >= 2) {
      const lt = this.raceTime - r.lapStart;
      r.lapTimes.push(lt);
      const best = lt < r.bestLap;
      r.bestLap = Math.min(r.bestLap, lt);
      if (r.isPlayer && lap <= this.laps) this.msg(best && lap > 2 ? 'BEST LAP' : 'LAP ' + (lap - 1) + ' DONE', best && lap > 2 ? '#a3ff12' : '#ffffff');
    }
    r.lap = lap; r.lapStart = this.raceTime;
    if (r.isPlayer) for (const o of this.track.orbs) o.active = true;
    if (lap > this.laps && !r.finished) {
      r.finished = true; r.finishTime = this.raceTime;
      this.finishOrder.push(r);
      if (r.isPlayer) { this.state = 'finish'; this.stateT = 0; Sound.play('finish'); this.msg('FINISH', '#ffd60a', true); }
    } else if (r.isPlayer && lap >= 2) {
      Sound.play('checkpoint');
      if (lap === this.laps) this.msg('FINAL LAP', '#ff2d95', true);
    }
  }

  damage(r, amt) {
    if (r.invuln > 0 || r.wreckT > 0 || this.state === 'attract') return;
    r.hp -= amt; r.damageTaken += amt;
    if (r.isPlayer) { this.shake = Math.max(this.shake, 0.4); this.flash = Math.min(1, this.flash + amt / 30); }
    if (r.hp <= 0) {
      r.hp = 0; r.wreckT = 2.2; r.v *= 0.25;
      const p = r.mesh.group.position;
      this.sparks.burst(p, 90, '#ffb347', 22, 1.2);
      this.sparks.burst(p, 40, r.mesh.mats.neon.color.getStyle(), 16, 1);
      if (r.isPlayer) { Sound.play('explode'); this.shake = 1.2; this.msg('HULL FAILURE - REBOOTING', '#ff3b30', true); }
      else if (this.player && Math.abs(r.dist - this.player.dist) < 120) Sound.play('crash');
    }
  }

  sparkSide(r, sg, n) {
    const F = this.track.frameAt(r.dist, this.F2);
    this.tmp.copy(F.pos).addScaledVector(F.side, sg * ROAD_HALF).addScaledVector(F.up, 0.6);
    this.sparks.burst(this.tmp, n, '#ffd27a', 9, 0.45, F.up);
  }

  collide() {
    const R = this.racers;
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      if (a.wreckT > 0 || b.wreckT > 0 || a.invuln > 0 || b.invuln > 0) continue;
      const ds = b.dist - a.dist, dd = b.d - a.d;
      if (Math.abs(ds) > CAR_LEN || Math.abs(dd) > HALF_W * 2) continue;
      const sx = Math.sign(dd) || (Math.random() < 0.5 ? -1 : 1), ox = HALF_W * 2 - Math.abs(dd);
      a.d -= sx * ox * 0.5; b.d += sx * ox * 0.5;
      const rel = a.vd - b.vd;
      a.vd -= rel * 0.6 + sx * 2.5; b.vd += rel * 0.6 + sx * 2.5;
      let hit = Math.abs(rel);
      if (Math.abs(dd) < 1.6) {
        const [back, front] = ds > 0 ? [a, b] : [b, a];
        if (back.v > front.v) { const dv = back.v - front.v; back.v = Math.max(0, front.v - 1); front.v += dv * 0.3; hit += dv * 0.5; }
      }
      if (a.bumpCD <= 0 || b.bumpCD <= 0) {
        a.bumpCD = b.bumpCD = 0.35;
        this.damage(a, 2 + hit * 0.5); this.damage(b, 2 + hit * 0.5);
        this.tmp.copy(a.mesh.group.position).lerp(b.mesh.group.position, 0.5);
        this.sparks.burst(this.tmp, 18, '#ffe08a', 10, 0.5);
        if (a.isPlayer || b.isPlayer) { Sound.play('bump'); this.shake = Math.max(this.shake, 0.35); }
      }
    }
  }

  aiInput(r, dt) {
    const tr = this.track, st = r.st;
    let kMax = 0;
    for (let a = 15; a <= 30 + r.v * 1.4; a += 12) { const k = tr.curvAt(r.dist + a); if (Math.abs(k) > Math.abs(kMax)) kMax = k; }
    let targetD = clamp(tr.curvAt(r.dist + 20 + r.v * 0.35) * 650, -8.5, 8.5) + r.ai.lineBias;
    let vT = Math.min(st.top * 1.1, Math.sqrt(st.grip / Math.max(1e-5, Math.abs(kMax))) * 1.03);
    if (this.player && !r.isPlayer && this.state === 'race') vT *= 1 + clamp((this.player.dist - r.dist) / 400, -1, 1) * 0.07;
    for (const o of this.racers) {
      if (o === r) continue;
      const gap = o.dist - r.dist;
      if (gap > 0 && gap < 22 && Math.abs(o.d - r.d) < 2.9) {
        const left = o.d - 3.4, right = o.d + 3.4;
        let pick = Math.abs(left - targetD) < Math.abs(right - targetD) ? left : right;
        if (Math.abs(pick) > LIM - 0.5) pick = pick === left ? right : left;
        targetD = clamp(pick, -LIM + 0.5, LIM - 0.5);
        if (gap < 9 && Math.abs(o.d - r.d) < 2.2) vT = Math.min(vT, o.v);
      }
    }
    r.ai.boostCD -= dt; r.ai.boostT -= dt;
    if (r.ai.boostCD <= 0 && r.boost > 25 && Math.abs(kMax) < 0.004 && r.v > st.top * 0.8) { r.ai.boostT = rand(1.2, 2.5); r.ai.boostCD = rand(5, 11); }
    return {
      steer: clamp((targetD - r.d) * 0.3 - r.vd * 0.08, -1, 1),
      throttle: r.v < vT ? 1 : 0,
      brake: r.v > vT + 3 ? clamp((r.v - vT) / 12, 0, 1) : 0,
      boost: r.ai.boostT > 0
    };
  }

  place(r, dt) {
    const F = this.track.frameAt(r.dist, this.F), g = r.mesh.group;
    const k = ease(dt, 8);
    const slideYaw = r.sliding ? -r.slideDir * 0.22 : 0;
    r.yaw += (-Math.atan2(r.vd, Math.max(12, r.v)) * 1.4 + slideYaw - r.yaw) * k;
    r.roll += (r.steerIn * 0.22 + r.vd * 0.008 - r.roll) * ease(dt, 6);
    r.pitch += ((r.boosting ? -0.05 : 0) - r.pitch) * ease(dt, 4);
    g.position.copy(F.pos).addScaledVector(F.side, r.d).addScaledVector(F.up, 0.1);
    this.vx.crossVectors(F.up, F.tan).normalize();
    g.quaternion.setFromRotationMatrix(this.m4.makeBasis(this.vx, F.up, F.tan));
    r.mesh.body.rotation.set(r.pitch, r.yaw, r.roll);
    if (r.wreckT > 0) r.mesh.body.rotation.y += this.t * 9;
    g.visible = r.wreckT > 0 ? Math.floor(this.t * 14) % 2 === 0 : r.invuln > 0 ? Math.floor(this.t * 10) % 3 !== 0 : true;
    r.mesh.update(dt, this.t, r.throttle, r.boosting || r.padT > 0);
    if (r.tag) { const cd = g.position.distanceTo(this.camera.position); r.tag.visible = cd > 14 && cd < 220; }
    this.tmp.copy(g.position).addScaledVector(F.tan, -r.mesh.length * 0.5 - 0.3).addScaledVector(F.up, 0.62);
    r.trail.push(this.tmp, F.side, r.v > 25 && r.wreckT <= 0);
  }

  updateRanks() {
    const arr = [...this.racers].sort((a, b) => (+b.finished - +a.finished) || (a.finished ? a.finishTime - b.finishTime : b.dist - a.dist));
    arr.forEach((r, i) => { r.rank = i + 1; });
    this.order = arr;
  }

  introCamera() {
    const F = this.track.frameAt(-15, this.F2), a = this.stateT * 0.45 + 0.5, c = this.camera;
    c.position.copy(F.pos).addScaledVector(F.side, Math.cos(a) * 24).addScaledVector(F.tan, Math.sin(a) * 26 + 6).addScaledVector(F.up, 9 - this.stateT * 1.2);
    c.up.set(0, 1, 0);
    c.lookAt(this.tmp.copy(F.pos).addScaledVector(F.up, 1));
  }

  updateCamera(dt) {
    const c = this.camera;
    if (this.state === 'intro') { this.introCamera(); this.camPos.copy(c.position); this.blend = 0; return; }
    const r = this.mode === 'attract' ? this.focus : this.player;
    const F = this.track.frameAt(r.dist, this.F2), carPos = r.mesh.group.position;
    // the camera rides with the car; only its offset is smoothed, so it never falls behind at speed
    let fov, ahead, wantOff = new THREE.Vector3(), fwd = this.vx.copy(F.tan);
    if (this.mode === 'attract') {
      const a = this.t * 0.18;
      wantOff.copy(F.tan).multiplyScalar(-Math.cos(a) * 15).addScaledVector(F.side, Math.sin(a) * 15).addScaledVector(F.up, 4.5);
      ahead = 0; fov = 58;
    } else {
      const mode = this.state === 'finish' ? 1 : this.camMode;
      const [back, height, ah] = [[7.5, 2.6, 7], [12, 4.4, 8], [-0.4, 1.15, 30]][mode];
      fwd.applyAxisAngle(F.up, r.yaw * 0.35);
      wantOff.copy(fwd).multiplyScalar(-back).addScaledVector(F.up, height);
      ahead = ah;
      fov = 64 + 16 * Math.min(1.3, r.v / r.st.top) + (r.boosting ? 10 : 0) + (r.padT > 0 ? 5 : 0);
    }
    if (!this.camOff) this.camOff = wantOff.clone();
    this.camOff.lerp(wantOff, ease(dt, this.camMode === 2 ? 30 : 6));
    this.camUp.lerp(F.up, ease(dt, 4)).normalize();
    const chase = this.tmp.copy(carPos).add(this.camOff);
    this.blend = Math.min(1, (this.blend ?? 1) + dt / 1.4);
    const b = this.blend * this.blend * (3 - 2 * this.blend);
    c.position.copy(this.camPos).lerp(chase, b);
    if (this.blend >= 1) this.camPos.copy(chase);
    if (this.shake > 0) c.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(this.shake * 0.35));
    c.up.copy(this.camUp);
    c.lookAt(this.tmp.copy(carPos).addScaledVector(fwd, ahead).addScaledVector(F.up, this.mode === 'attract' ? 0.6 : 1.2));
    c.fov += (fov - c.fov) * ease(dt, 4);
    c.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- output
  hud() {
    const p = this.player;
    if (!p) return null;
    const lap = clamp(p.lap, 1, this.laps);
    return {
      state: this.state, pos: p.rank, total: this.racers.length, lap, laps: this.laps,
      time: this.raceTime, lapTime: p.lap >= 1 ? this.raceTime - p.lapStart : 0, best: p.bestLap,
      speed: p.v * 3.6, speedFrac: p.v / (p.st.top * 1.32), boost: p.boost / p.st.boostMax, hp: p.hp / p.st.hp,
      slip: p.slip, boosting: p.boosting, sliding: p.sliding, wrecked: p.wreckT > 0, flash: this.flash,
      throttle: p.throttle
    };
  }

  buildResult() {
    const L = this.track.L, p = this.player;
    const rows = this.order.map(r => ({
      name: r.name, car: r.car.name, isPlayer: r.isPlayer, boss: r.boss, finished: r.finished,
      time: r.finished ? r.finishTime : null,
      gap: r.finished ? null : Math.max(0, (this.laps * L - r.dist) / Math.max(30, r.v)),
      best: r.bestLap
    }));
    return {
      position: p.rank, total: this.racers.length, time: p.finishTime, bestLap: p.bestLap,
      lapTimes: p.lapTimes, damage: Math.round(p.damageTaken), rows, trackLength: L,
      beat: who => { const b = this.racers.find(r => r.boss === who); return !b || b.rank > p.rank; }
    };
  }

  dispose() {
    this.track.dispose();
    for (const r of this.racers) { r.mesh.dispose(); r.trail.mesh.geometry.dispose(); r.trail.mesh.material.dispose(); }
    this.sparks.points.geometry.dispose(); this.sparks.points.material.dispose();
    this.camera.remove(this.lines.lines);
    this.lines.lines.geometry.dispose(); this.lines.mat.dispose();
  }
}
