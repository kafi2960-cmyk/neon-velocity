import { Save } from './data.js';
// ---------------------------------------------------------------------------
// WebAudio: engine synth, sound effects and a procedural synthwave soundtrack.
// Everything is generated, so there are no audio files to load.
// ---------------------------------------------------------------------------

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const BASS = [45, 41, 36, 43];

export const Sound = {
  ctx: null, musicMode: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.connect(this.master);

      // engine: saw + sub square through a lowpass
      this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500;
      this.engGain = c.createGain(); this.engGain.gain.value = 0;
      this.engA = c.createOscillator(); this.engA.type = 'sawtooth';
      this.engB = c.createOscillator(); this.engB.type = 'square';
      const bGain = c.createGain(); bGain.gain.value = 0.5;
      this.engA.connect(this.engFilter); this.engB.connect(bGain); bGain.connect(this.engFilter);
      this.engFilter.connect(this.engGain); this.engGain.connect(this.sfx);
      this.engA.start(); this.engB.start();

      // shared white-noise buffer
      const n = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, n, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

      // music bus with a feedback delay on the lead
      this.leadBus = c.createGain(); this.leadBus.gain.value = 1;
      const delay = c.createDelay(1); delay.delayTime.value = 0.4;
      const fb = c.createGain(); fb.gain.value = 0.32;
      this.leadBus.connect(this.music); this.leadBus.connect(delay);
      delay.connect(fb); fb.connect(delay); delay.connect(this.music);

      this.applySettings();
      if (this.musicMode) this._startScheduler();
    } catch (e) { this.ctx = null; }
  },

  applySettings() {
    if (!this.ctx) return;
    const s = Save.data.settings;
    this.sfx.gain.value = s.sfx;
    this.music.gain.value = s.music * 0.4;
  },

  // ---- engine ----
  engine(on, rpm, load) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = 38 + rpm * 100;
    this.engA.frequency.setTargetAtTime(f, t, 0.05);
    this.engB.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(300 + rpm * 1400 * (0.5 + load * 0.5), t, 0.08);
    this.engGain.gain.setTargetAtTime(on ? 0.05 + load * 0.05 : 0, t, 0.12);
  },

  // ---- primitives ----
  tone(freq, dur, type = 'square', vol = 0.15, slide = 0, delay = 0, dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol = 0.3, ftype = 'lowpass', freq = 1200, delay = 0, dest, sweepTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = ftype; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },

  play(name, arg = 0) {
    if (!this.ctx) return;
    switch (name) {
      case 'coin': this.tone(1200, 0.09, 'sine', 0.12, 600); this.tone(1800, 0.12, 'sine', 0.08, 0, 0.05); break;
      case 'pickup': this.tone(520, 0.12, 'triangle', 0.15); this.tone(780, 0.18, 'triangle', 0.15, 0, 0.08); break;
      case 'repair': this.tone(440, 0.1, 'square', 0.08); this.tone(660, 0.1, 'square', 0.08, 0, 0.1); this.tone(880, 0.2, 'square', 0.08, 0, 0.2); break;
      case 'shield': this.tone(300, 0.4, 'sine', 0.18, 700); break;
      case 'nitro': this.noise(0.6, 0.25, 'bandpass', 400, 0, null, 3000); break;
      case 'crash': this.noise(0.7, 0.6, 'lowpass', 1500); this.tone(120, 0.5, 'sawtooth', 0.2, -80); break;
      case 'explode': this.noise(1.4, 0.8, 'lowpass', 900, 0, null, 120); this.tone(80, 1, 'sawtooth', 0.25, -50); break;
      case 'bump': this.noise(0.15, 0.35, 'lowpass', 700); this.tone(90, 0.12, 'square', 0.1, -30); break;
      case 'scrape': this.noise(0.1, 0.12, 'bandpass', 2600); break;
      case 'beep': this.tone(660, 0.18, 'square', 0.12); break;
      case 'go': this.tone(1320, 0.5, 'square', 0.14); break;
      case 'checkpoint': [880, 1320, 1760].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.15, 0, i * 0.07)); break;
      case 'nearmiss': this.noise(0.25, 0.18, 'bandpass', 2000, 0, null, 500); this.tone(900 + arg * 120, 0.12, 'triangle', 0.1, 300); break;
      case 'shift': this.noise(0.05, 0.08, 'highpass', 3000); break;
      case 'click': this.tone(1400, 0.04, 'square', 0.05); break;
      case 'buy': this.tone(1000, 0.08, 'sine', 0.15); this.tone(1500, 0.25, 'sine', 0.15, 0, 0.08); break;
      case 'deny': this.tone(200, 0.2, 'square', 0.1, -60); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.14, 0, i * 0.09)); break;
      case 'achievement': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.12, 0, i * 0.08)); break;
      case 'finish': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, 'square', 0.08, 0, i * 0.1)); break;
    }
  },

  // ---- music ----
  setMusic(mode) {
    this.musicMode = mode;
    if (!this.ctx) return;
    if (mode && !this.timer) this._startScheduler();
    if (!mode && this.timer) { clearInterval(this.timer); this.timer = null; }
  },
  _startScheduler() {
    if (this.timer) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 25);
  },
  _schedule() {
    if (!this.ctx || !this.musicMode) return;
    const race = this.musicMode === 'race';
    const stepDur = 60 / (race ? 118 : 96) / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this._step(this.step, this.nextTime, race, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  },
  _step(i, t, race, sd) {
    const c = this.ctx, d = t - c.currentTime, s = i % 16, bar = Math.floor(i / 16) % 4;
    if (s % 2 === 0) this._synth(midiHz(BASS[bar] + (s % 4 === 2 ? 12 : 0)), t, sd * 1.8, 'sawtooth', 0.09, 500);
    const ch = CHORDS[bar];
    if (race || s % 2 === 0) this.tone(midiHz(ch[i % 3] + 12 + (s >= 8 ? 12 : 0)), sd * 0.9, 'square', race ? 0.025 : 0.02, 0, d, this.leadBus);
    if (s === 0) for (const n of ch) this._synth(midiHz(n), t, sd * 15, 'sawtooth', 0.025, 900);
    if (race) {
      if (s % 4 === 0) this.tone(150, 0.18, 'sine', 0.5, -110, d, this.music);
      if (s === 4 || s === 12) this.noise(0.16, 0.22, 'bandpass', 1800, d, this.music);
      if (s % 2 === 1) this.noise(0.03, 0.08, 'highpass', 7000, d, this.music);
    } else if (s % 4 === 2) {
      this.noise(0.03, 0.05, 'highpass', 8000, d, this.music);
    }
  },
  _synth(freq, t, dur, type, vol, cutoff) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(f); f.connect(g); g.connect(this.music);
    o.start(t); o.stop(t + dur + 0.05);
  }
};
