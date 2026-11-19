// ---------------------------------------------------------------------------
// Keyboard (smoothed steering), gamepad and touch input.
// ---------------------------------------------------------------------------
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

export const Input = {
  keys: {}, edges: new Set(), steer: 0, padPrev: [],
  touch: { left: false, right: false, gas: false, brake: false, boost: false },

  init() {
    addEventListener('keydown', e => {
      if (GAME_KEYS.has(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.keys[e.code] = true;
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
  },

  // one-shot presses (pause, camera, skip...) from keyboard or gamepad buttons
  pressed(...codes) {
    for (const c of codes) if (this.edges.has(c)) { this.edges.delete(c); return true; }
    return false;
  },
  clearEdges() { this.edges.clear(); },

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(p => p && p.connected);
    if (!gp) return null;
    const b = i => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const map = { 9: 'Escape', 3: 'KeyC', 0: 'Enter' };
    for (const i in map) { const down = b(i) > 0.5; if (down && !this.padPrev[i]) this.edges.add(map[i]); this.padPrev[i] = down; }
    return { x: Math.abs(gp.axes[0]) > 0.12 ? gp.axes[0] : 0, gas: b(7), brake: b(6), boost: b(0) > 0.5 || b(5) > 0.5 };
  },

  read(dt, autoAccel) {
    const k = this.keys, t = this.touch, gp = this.pollGamepad();
    const target = ((k.ArrowRight || k.KeyD || t.right) ? 1 : 0) - ((k.ArrowLeft || k.KeyA || t.left) ? 1 : 0);
    const rate = target === 0 ? 9 : (Math.sign(target) !== Math.sign(this.steer) ? 9 : 4.5);
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, target - this.steer));
    const steer = gp && gp.x ? gp.x : this.steer;
    const brake = Math.max((k.ArrowDown || k.KeyS || t.brake) ? 1 : 0, gp ? gp.brake : 0);
    const gas = Math.max((k.ArrowUp || k.KeyW || t.gas) ? 1 : 0, gp ? gp.gas : 0, autoAccel && !brake ? 1 : 0);
    return {
      steer, throttle: gas, brake,
      boost: !!(k.Space || k.ShiftLeft || k.ShiftRight || t.boost || (gp && gp.boost)),
      skip: this.pressed('Enter', 'Space')
    };
  }
};
