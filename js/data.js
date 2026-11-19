// ---------------------------------------------------------------------------
// Game data: cars, upgrades, cosmetics, tracks, story chapters, save store.
// Units: meters and seconds.
// ---------------------------------------------------------------------------

export const CARS = [
  { id: 'striker', name: 'Striker', cls: 'C', model: 'striker', price: 0, paint: '#ff2d55', neon: '#00e5ff',
    desc: 'Scrapyard-built street racer. Balanced and forgiving.',
    stats: { speed: 4, accel: 4, grip: 5, boost: 4, armor: 4 } },
  { id: 'phantom', name: 'Phantom', cls: 'B', model: 'dart', price: 8000, paint: '#7c3aed', neon: '#f0abfc',
    desc: 'Needle-nosed interceptor with razor-sharp turn-in.',
    stats: { speed: 6, accel: 5, grip: 7, boost: 5, armor: 3 } },
  { id: 'titan', name: 'Titan', cls: 'B', model: 'tank', price: 12000, paint: '#f59e0b', neon: '#ffd60a',
    desc: 'Armored heavy hauler. Bullies everyone off the line.',
    stats: { speed: 5, accel: 6, grip: 4, boost: 6, armor: 9 } },
  { id: 'wraith', name: 'Wraith', cls: 'A', model: 'wedge', price: 22000, paint: '#0ea5e9', neon: '#22d3ee',
    desc: 'Stealth wedge with a fusion core that never sleeps.',
    stats: { speed: 8, accel: 7, grip: 7, boost: 7, armor: 5 } },
  { id: 'nova', name: 'Nova X', cls: 'S', model: 'blade', price: 40000, paint: '#e5e7eb', neon: '#ff2d55',
    desc: 'Prototype hyper-sled. The fastest thing in Neo-Kyoto.',
    stats: { speed: 10, accel: 9, grip: 9, boost: 8, armor: 4 } }
];
export const CAR_BY_ID = Object.fromEntries(CARS.map(c => [c.id, c]));

export const STAT_KEYS = ['speed', 'accel', 'grip', 'boost', 'armor'];
export const STAT_LABELS = { speed: 'Top Speed', accel: 'Acceleration', grip: 'Grip', boost: 'Boost', armor: 'Armor' };
export const UPGRADES = [
  { stat: 'speed', name: 'Fusion Core', desc: 'Higher top speed' },
  { stat: 'accel', name: 'Ion Thrusters', desc: 'Faster acceleration' },
  { stat: 'grip', name: 'Mag-Lev Grip', desc: 'Corner harder without sliding' },
  { stat: 'boost', name: 'Boost Capacitor', desc: 'Bigger boost tank' },
  { stat: 'armor', name: 'Hull Plating', desc: 'Survive more impacts' }
];
export const MAX_UPG = 5, UPG_STEP = 0.9, STAT_MAX = 15;
export const upgradeCost = (car, lvl) => Math.round((300 + car.price * 0.04) * Math.pow(lvl + 1, 1.3) / 50) * 50;

export function carStats(car, upg = {}) {
  const st = k => car.stats[k] + (upg[k] || 0) * UPG_STEP;
  return {
    top: 58 + st('speed') * 5,        // m/s
    accel: 16 + st('accel') * 2.6,    // m/s^2
    steer: 12 + st('grip') * 1.2,     // lateral m/s
    grip: 30 + st('grip') * 6,        // max cornering accel before sliding
    boostMax: 60 + st('boost') * 8,
    hp: 60 + st('armor') * 10
  };
}

export const PALETTE = ['#ff2d55', '#ff6b00', '#ffd60a', '#39ff14', '#00e5ff', '#2979ff', '#7c3aed', '#f0abfc',
  '#ffffff', '#9ca3af', '#1f2937', '#0b0b0f'];
export const NEON = ['#00e5ff', '#ff2d95', '#39ff14', '#ffd60a', '#ff6b00', '#a855f7', '#ffffff', '#ff2d55'];
export const FINISHES = [
  { id: 'gloss', name: 'Gloss', price: 0, metal: 0.3, rough: 0.3, clearcoat: 1 },
  { id: 'metallic', name: 'Metallic', price: 1000, metal: 0.85, rough: 0.28, clearcoat: 0.6 },
  { id: 'matte', name: 'Stealth Matte', price: 1500, metal: 0.15, rough: 0.9, clearcoat: 0 },
  { id: 'iridescent', name: 'Iridescent', price: 3500, metal: 0.6, rough: 0.2, clearcoat: 1, iridescence: 1 },
  { id: 'chrome', name: 'Liquid Chrome', price: 5000, metal: 1, rough: 0.06, clearcoat: 1 }
];
export const WINGS = [
  { id: 'none', name: 'None', price: 0 },
  { id: 'fin', name: 'Shark Fin', price: 800 },
  { id: 'wing', name: 'Aero Wing', price: 1500 },
  { id: 'twin', name: 'Twin Blades', price: 2500 }
];
export const defaultLook = car => ({ paint: car.paint, accent: '#14161c', neon: car.neon, thruster: '#00e5ff', finish: 'gloss', wing: 'none' });

// Tracks are closed loops generated from polar harmonics: r(a) = R * (1 + sum amp*cos(n*a + phase)).
export const TRACKS = [
  { id: 'neon', name: 'Neon Harbor', theme: 'city', R: 430,
    harm: [[2, 0.16, 0.4], [3, 0.10, 1.3], [5, 0.05, 0.2]], elev: [[2, 16, 0.5], [3, 7, 2.1]],
    desc: 'Elevated skyways threading a city that never sleeps.' },
  { id: 'dune', name: 'Solar Dunes', theme: 'desert', R: 520,
    harm: [[2, 0.22, 1.0], [4, 0.07, 0.3], [3, 0.06, 2.4]], elev: [[1, 20, 0], [3, 10, 1]],
    desc: 'High-speed sweepers under a dying synthwave sun.' },
  { id: 'grid', name: 'The Grid', theme: 'grid', R: 380,
    harm: [[3, 0.18, 0], [2, 0.08, 1], [6, 0.035, 0.5]], elev: [[2, 24, 1.2], [4, 6, 0]],
    desc: 'A training simulation of pure light. Technical and tight.' },
  { id: 'aurora', name: 'Aurora Ridge', theme: 'ice', R: 470,
    harm: [[2, 0.2, 2], [3, 0.12, 0.7], [5, 0.045, 1.7]], elev: [[1, 28, 0.3], [2, 12, 1.9]],
    desc: 'Frozen mountain pass beneath a burning aurora.' }
];
export const TRACK_BY_ID = Object.fromEntries(TRACKS.map(t => [t.id, t]));

export const RIVAL_NAMES = ['Blaze', 'Nova', 'Rogue', 'Ghost', 'Titan', 'Jinx', 'Duke', 'Raven', 'Kaze', 'Sable', 'Orion', 'Zero'];

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------
export const CHARACTERS = {
  ace: { name: 'ACE', role: 'You', color: '#ffd60a' },
  mira: { name: 'MIRA', role: 'Crew Chief', color: '#00e5ff' },
  vex: { name: 'VEX', role: 'Syndicate Pilot', color: '#ff2d95' },
  kaiser: { name: 'KAISER', role: 'Apex League Champion', color: '#ff3b30' },
  oracle: { name: 'ORACLE', role: 'Race Control AI', color: '#a3ff12' }
};
// Named story rivals and the cars they pilot.
export const BOSSES = {
  vex: { name: 'VEX', car: 'phantom', look: { paint: '#ff2d95', accent: '#14161c', neon: '#ff2d95', thruster: '#ff2d95', finish: 'metallic', wing: 'twin' } },
  oracle: { name: 'ORACLE', car: 'wraith', look: { paint: '#a3ff12', accent: '#0b0b0f', neon: '#a3ff12', thruster: '#a3ff12', finish: 'chrome', wing: 'fin' }, ghost: true },
  kaiser: { name: 'KAISER', car: 'nova', look: { paint: '#ff3b30', accent: '#0b0b0f', neon: '#ff3b30', thruster: '#ffd60a', finish: 'iridescent', wing: 'wing' } }
};

export const CHAPTERS = [
  { title: 'Rookie Run', track: 'neon', laps: 2, rivals: 3, skill: 0.84, goal: { type: 'top', n: 3 }, reward: 2500,
    intro: [
      ['oracle', 'Neo-Kyoto, 2087. Welcome to the Underground Circuit. New pilot registered: ACE.'],
      ['mira', "So you're the kid who rebuilt a scrapyard Striker by hand. Not bad."],
      ['mira', 'Every legend starts on the Harbor skyways. Finish top three and the league will notice you.'],
      ['ace', 'Just point me at the starting line.'],
      ['mira', 'Hold boost on the straights, and stay off the walls. They bite.']],
    outro: [
      ['mira', 'Top three on your first night! The scouts are already talking.'],
      ['oracle', 'League rank updated. Incoming challenge on your channel...']] },
  { title: 'First Blood', track: 'neon', laps: 3, rivals: 5, skill: 0.92, bosses: ['vex'], goal: { type: 'win' }, reward: 4000,
    intro: [
      ['vex', "So you're the rookie everyone's whispering about? Cute ride. Bet it folds at four hundred."],
      ['mira', "That's Vex. Fast, reckless, and the Syndicate's favorite pilot."],
      ['mira', 'Tuck in behind him on the straights. The slipstream charges your boost.'],
      ['ace', 'Then I guess I will be seeing a lot of his tail lights. Briefly.']],
    outro: [
      ['vex', 'Lucky run, rookie. Meet me in the dunes. Just you and me.'],
      ['mira', 'He is rattled. Good. But first, the desert will test you.']] },
  { title: 'Desert Trial', track: 'dune', laps: 3, rivals: 0, mode: 'timetrial', goal: { type: 'time', speed: 74 }, reward: 3500,
    intro: [
      ['mira', 'Solar Dunes. The sweepers out here are long and fast, and they punish lazy lines.'],
      ['mira', 'Before you race Vex out here, I need one clean lap under the target time.'],
      ['oracle', 'Time trial armed. Best lap counts. Boost pads are live.']],
    outro: [
      ['mira', 'That is a racing line. You are ready for him.'],
      ['oracle', 'Duel request from VEX accepted. Location: Solar Dunes.']] },
  { title: 'Duel in the Dunes', track: 'dune', laps: 3, rivals: 1, skill: 1.0, bosses: ['vex'], goal: { type: 'beat', who: 'vex' }, reward: 6000,
    intro: [
      ['vex', 'No crowd. No pack. Nowhere to hide this time.'],
      ['ace', 'I was about to say the same thing.'],
      ['mira', 'His Phantom corners like a knife. Beat him on the straights.']],
    outro: [
      ['vex', '...How? Kaiser tuned that car himself.'],
      ['kaiser', 'Because you are a pawn, Vex. ACE, was it? Come to the Grid. Let us see what you really are.']] },
  { title: 'Into the Grid', track: 'grid', laps: 3, rivals: 5, skill: 1.0, goal: { type: 'top', n: 2 }, reward: 6500,
    intro: [
      ['oracle', 'Entering the Grid: the Apex League simulation space. Physics fidelity: 100%.'],
      ['mira', 'Kaiser built this place to break pilots. The corners are tight, so brake before them, not in them.'],
      ['kaiser', 'Finish in the top two and I will grant you an audience.']],
    outro: [
      ['kaiser', 'Adequate. Now race my Oracle. It has never lost.'],
      ['mira', 'A ghost car that runs the perfect line... Ace, upgrade your grip before this one.']] },
  { title: 'Ghost Protocol', track: 'grid', laps: 2, rivals: 1, skill: 1.08, bosses: ['oracle'], goal: { type: 'beat', who: 'oracle' }, reward: 8000,
    intro: [
      ['oracle', 'I have simulated this race 4,102,553 times. You win in none of them.'],
      ['ace', 'Then let us make it 4,102,554.']],
    outro: [
      ['oracle', 'Anomaly detected. Recalculating... ACE is the variable.'],
      ['mira', 'You beat the machine! Kaiser has no excuses left.'],
      ['vex', "Hey, rookie. I'm done being his pawn. The Aurora Ridge qualifier is rigged. I'll watch your back."]] },
  { title: 'Frozen Ascent', track: 'aurora', laps: 3, rivals: 5, skill: 1.06, goal: { type: 'win' }, reward: 9000,
    intro: [
      ['mira', 'Aurora Ridge. Ice on the deck and a full grid of Syndicate pilots.'],
      ['vex', 'They will try to box you in on the climb. Use the boost pads to break free.'],
      ['kaiser', 'Win here and you earn a seat at the Kaiser Cup. Lose, and you disappear.']],
    outro: [
      ['kaiser', 'Impressive. The final is at Neon Harbor, where you started. Fitting place for you to end.'],
      ['mira', 'This is it, Ace. Everything we built comes down to one race.']] },
  { title: 'The Kaiser Cup', track: 'neon', laps: 4, rivals: 7, skill: 1.1, bosses: ['kaiser', 'vex'], goal: { type: 'win' }, reward: 20000,
    intro: [
      ['oracle', 'Final event: The Kaiser Cup. Eight pilots. Four laps. One champion.'],
      ['kaiser', 'Nobody has beaten me in eleven years. My Nova X is perfection.'],
      ['vex', "I'll be racing too, Ace. And this time I'm racing clean."],
      ['ace', 'Eleven years is a long time to be waiting for someone like me.']],
    outro: [
      ['kaiser', 'Impossible... You out-drove perfection.'],
      ['vex', "Ha! Did you see his face? Champion ACE! I'll take the rematch any time."],
      ['mira', 'From a scrapyard Striker to the top of Neo-Kyoto. Welcome to the legends, Ace.'],
      ['oracle', 'New Apex League Champion: ACE. Story complete. Thank you for playing NEON VELOCITY.']] }
];

export function goalText(ch, trackLength) {
  const g = ch.goal;
  if (g.type === 'top') return `Finish in the top ${g.n}`;
  if (g.type === 'win') return 'Win the race';
  if (g.type === 'beat') return `Finish ahead of ${BOSSES[g.who].name}`;
  if (g.type === 'time') return trackLength ? `Best lap under ${fmtTime(trackLength / g.speed)}` : 'Beat the target lap time';
  return '';
}

export function fmtTime(t) {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Save game (localStorage, guarded: storage may be unavailable)
// ---------------------------------------------------------------------------
const SAVE_KEY = 'neon_velocity_save_v1';
export const newCarCfg = (car, owned = false) => ({ owned, upg: { speed: 0, accel: 0, grip: 0, boost: 0, armor: 0 }, look: defaultLook(car) });

function defaultSave() {
  return {
    credits: 3000, selected: 'striker',
    cars: { striker: newCarCfg(CAR_BY_ID.striker, true) },
    items: {},
    story: { progress: 0, done: {} },
    best: {},
    stats: { races: 0, wins: 0 },
    settings: { music: 0.5, sfx: 0.8, quality: 'high', autoAccel: false, camera: 0 }
  };
}

export const Save = {
  data: null,
  load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { raw = null; }
    const d = defaultSave();
    if (raw && typeof raw === 'object') {
      for (const k of Object.keys(d)) {
        if (raw[k] === undefined) continue;
        d[k] = (d[k] && typeof d[k] === 'object') ? Object.assign(d[k], raw[k]) : raw[k];
      }
    }
    for (const id of Object.keys(d.cars)) {
      if (!CAR_BY_ID[id]) { delete d.cars[id]; continue; }
      const base = newCarCfg(CAR_BY_ID[id]);
      d.cars[id] = { owned: !!d.cars[id].owned, upg: Object.assign(base.upg, d.cars[id].upg), look: Object.assign(base.look, d.cars[id].look) };
    }
    if (!d.cars[d.selected] || !d.cars[d.selected].owned) d.selected = 'striker';
    this.data = d;
  },
  write() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {} },
  reset() { this.data = defaultSave(); this.write(); },
  carCfg(id) {
    if (!this.data.cars[id]) this.data.cars[id] = newCarCfg(CAR_BY_ID[id]);
    return this.data.cars[id];
  },
  owns(kind, id) {
    const list = kind === 'finish' ? FINISHES : WINGS;
    const item = list.find(i => i.id === id);
    return !item || item.price === 0 || !!this.data.items[kind + ':' + id];
  }
};
