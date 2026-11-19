import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Save, CARS, TRACKS, TRACK_BY_ID, CHAPTERS, CHARACTERS, BOSSES, RIVAL_NAMES, PALETTE, NEON, FINISHES, WINGS,
  UPGRADES, STAT_KEYS, STAT_LABELS, STAT_MAX, UPG_STEP, MAX_UPG, upgradeCost, goalText, fmtTime, defaultLook
} from './data.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { Race } from './race.js';
import { Showroom } from './garage.js';
import { trackLength } from './track.js';

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const ordinal = n => n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH');

Save.load();
Input.init();

// ---------------------------------------------------------------------------
// Renderer + post-processing
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 7000);
const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.4, 0.35);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const q = Save.data.settings.quality;
  const pr = Math.min(devicePixelRatio || 1, q === 'high' ? 2 : 1);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  bloom.enabled = q !== 'low';
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Scene state
// ---------------------------------------------------------------------------
let race = null, showroom = null, view = 'attract', paused = false, raceCfg = null, resultShown = false;
let screen = 'loading', lastGear = 1;

function disposeRace() { if (race) { race.dispose(); race = null; } }

function randomLook(neon) {
  return { paint: pick(PALETTE), accent: '#14161c', neon: neon || pick(NEON), thruster: pick(NEON), finish: pick(['gloss', 'metallic', 'matte']), wing: pick(['none', 'fin', 'wing', 'twin']) };
}
function carsForSkill(s) {
  if (s < 0.9) return ['striker', 'striker', 'titan'];
  if (s < 1.0) return ['striker', 'phantom', 'titan'];
  if (s < 1.06) return ['phantom', 'titan', 'wraith'];
  return ['wraith', 'phantom', 'nova'];
}
function upgFor(skill) {
  const l = Math.max(0, Math.min(MAX_UPG, Math.round((skill - 0.85) * 12)));
  return { speed: l, accel: l, grip: l, boost: l, armor: l };
}
function buildRivals(n, skill, bosses = []) {
  const list = [], names = [...RIVAL_NAMES].sort(() => Math.random() - 0.5), pool = carsForSkill(skill);
  for (const id of bosses) {
    const B = BOSSES[id];
    list.push({ name: B.name, carId: B.car, look: { ...B.look }, skill: skill * 1.03, boss: id, ghost: B.ghost, upg: upgFor(skill + 0.1) });
  }
  while (list.length < n) list.push({ name: names.pop(), carId: pick(pool), look: randomLook(), skill: skill * rand(0.93, 1.01), upg: upgFor(skill) });
  return list.slice(0, n);
}

function startAttract() {
  disposeRace();
  const tr = pick(TRACKS);
  race = new Race({ trackId: tr.id, mode: 'attract', rivals: buildRivals(7, 1.0), camera, envMap });
  view = 'attract';
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
const SCREENS = ['loading', 'title', 'menu', 'story', 'quick', 'trial', 'garage', 'settings'];
function show(id) {
  if (screen === 'garage' && id !== 'garage') { view = race ? (race.mode === 'attract' ? 'attract' : 'race') : 'attract'; if (!race) startAttract(); }
  screen = id;
  for (const s of SCREENS) $(s).classList.toggle('active', s === id);
  refreshCredits();
  if (id === 'menu') { renderMenu(); setTimeout(() => document.querySelector('.menu-item').focus(), 30); }
  if (id === 'story') renderStory();
  if (id === 'quick') renderQuick();
  if (id === 'trial') renderTrial();
  if (id === 'settings') renderSettings();
  if (id === 'garage') enterGarage();
}
function overlay(id, on) { $(id).classList.toggle('active', on); }
function refreshCredits() { document.querySelectorAll('.cr-val').forEach(e => { e.textContent = Save.data.credits.toLocaleString(); }); }
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { Sound.play('click'); show('menu'); }));
document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { Sound.play('click'); show(b.dataset.nav); }));
document.addEventListener('click', e => { if (e.target.closest('button')) Sound.init(); });

function startFromTitle() {
  Sound.init(); Sound.setMusic('menu'); Sound.play('go');
  show('menu');
}
$('title').addEventListener('click', startFromTitle);

function renderMenu() {
  const p = Save.data.story.progress;
  $('story-progress').textContent = p >= CHAPTERS.length ? 'Story complete. Replay any chapter' : `Chapter ${p + 1} of ${CHAPTERS.length}: ${CHAPTERS[p].title}`;
  const car = CARS.find(c => c.id === Save.data.selected);
  $('menu-car').innerHTML = `<small>CURRENT RIDE</small><b>${car.name}</b>`;
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------
function chapterTarget(ch) { return ch.goal.type === 'time' ? trackLength(TRACK_BY_ID[ch.track]) / ch.goal.speed : 0; }
function chapterGoal(ch) { return goalText(ch, ch.goal.type === 'time' ? trackLength(TRACK_BY_ID[ch.track]) : 0); }

function renderStory() {
  const prog = Save.data.story.progress;
  $('chapters').innerHTML = CHAPTERS.map((ch, i) => {
    const tr = TRACK_BY_ID[ch.track], st = i < prog ? 'done' : i === prog ? 'open' : 'locked';
    return `<button class="chapter ${st} theme-${tr.theme}" data-ch="${i}" ${st === 'locked' ? 'disabled' : ''}>
      <span class="ch-num">CHAPTER ${i + 1}</span><b>${ch.title}</b>
      <span class="ch-meta">${tr.name} · ${ch.mode === 'timetrial' ? 'Time Trial' : ch.laps + ' laps · ' + (ch.rivals + 1) + ' pilots'}</span>
      <span class="ch-goal">${chapterGoal(ch)}</span>
      <span class="ch-reward">${st === 'done' ? '✓ COMPLETE · REPLAY' : st === 'locked' ? 'LOCKED' : '+' + ch.reward.toLocaleString() + ' CR'}</span></button>`;
  }).join('');
  $('chapters').querySelectorAll('.chapter').forEach(b => b.addEventListener('click', () => { Sound.play('click'); playChapter(+b.dataset.ch); }));
}

function playChapter(i) {
  const ch = CHAPTERS[i];
  for (const s of SCREENS) $(s).classList.remove('active');
  dialogue(ch.intro, () => briefing(i));
}

function briefing(i) {
  const ch = CHAPTERS[i], tr = TRACK_BY_ID[ch.track];
  $('b-kicker').textContent = `CHAPTER ${i + 1} OF ${CHAPTERS.length}`;
  $('b-title').textContent = ch.title;
  const rivals = ch.mode === 'timetrial' ? 'None. Just you and the clock' :
    `${ch.rivals} rival${ch.rivals > 1 ? 's' : ''}${ch.bosses ? ' incl. ' + ch.bosses.map(b => BOSSES[b].name).join(' & ') : ''}`;
  const rows = [['Track', tr.name], ['Laps', ch.laps], ['Opponents', rivals], ['Objective', chapterGoal(ch)], ['Reward', ch.reward.toLocaleString() + ' CR']];
  $('b-grid').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  overlay('briefing', true);
  $('b-go').onclick = () => { overlay('briefing', false); startRace({ kind: 'story', chapter: i, trackId: ch.track, laps: ch.laps, mode: ch.mode || 'race', rivals: ch.rivals, skill: ch.skill || 1, bosses: ch.bosses }); };
  $('b-back').onclick = () => { overlay('briefing', false); show('story'); };
  setTimeout(() => $('b-go').focus(), 30);
}

// dialogue with typewriter text
let dlg = null;
function dialogue(lines, done) {
  dlg = { lines, i: 0, done, typing: false, timer: 0 };
  overlay('dialog', true);
  showLine();
}
function showLine() {
  const [who, text] = dlg.lines[dlg.i], c = CHARACTERS[who];
  $('d-portrait').style.setProperty('--c', c.color);
  $('d-portrait').querySelector('span').textContent = c.name[0];
  $('d-name').textContent = c.name; $('d-name').style.color = c.color;
  $('d-role').textContent = c.role;
  const el = $('d-text'); el.textContent = '';
  dlg.typing = true;
  let n = 0;
  clearInterval(dlg.timer);
  dlg.timer = setInterval(() => {
    n += 2; el.textContent = text.slice(0, n);
    if (n % 6 === 0) Sound.tone(900 + Math.random() * 300, 0.03, 'square', 0.02);
    if (n >= text.length) { clearInterval(dlg.timer); dlg.typing = false; }
  }, 22);
}
function dlgNext() {
  if (!dlg) return;
  if (dlg.typing) { clearInterval(dlg.timer); dlg.typing = false; $('d-text').textContent = dlg.lines[dlg.i][1]; return; }
  Sound.play('click');
  if (++dlg.i >= dlg.lines.length) dlgEnd(); else showLine();
}
function dlgEnd() { if (!dlg) return; clearInterval(dlg.timer); const d = dlg.done; dlg = null; overlay('dialog', false); d && d(); }
$('d-next').addEventListener('click', dlgNext);
$('d-skip').addEventListener('click', dlgEnd);

// ---------------------------------------------------------------------------
// Quick race & time trial setup
// ---------------------------------------------------------------------------
const quick = { track: 'neon', laps: 3, rivals: 5, diff: 1 };
const DIFFS = [['Rookie', 0.88], ['Pro', 0.98], ['Elite', 1.07]];
let trialTrack = 'neon';

function seg(el, options, value, onPick) {
  el.innerHTML = options.map(([label, v]) => `<button data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { Sound.play('click'); onPick(b.dataset.v); }));
}
function trackCards(el, selected, onPick, extra) {
  el.innerHTML = TRACKS.map(t => `<button class="track theme-${t.theme} ${t.id === selected ? 'on' : ''}" data-id="${t.id}">
    <b>${t.name}</b><span>${t.desc}</span><em>${extra(t)}</em></button>`).join('');
  el.querySelectorAll('.track').forEach(b => b.addEventListener('click', () => { Sound.play('click'); onPick(b.dataset.id); }));
}
const bestText = t => Save.data.best[t.id] ? 'BEST LAP ' + fmtTime(Save.data.best[t.id]) : 'NO RECORD YET';
function renderQuick() {
  trackCards($('quick-tracks'), quick.track, id => { quick.track = id; renderQuick(); }, t => `${(trackLength(t) / 1000).toFixed(2)} KM`);
  seg($('opt-laps'), [1, 2, 3, 4, 5].map(n => [n, n]), quick.laps, v => { quick.laps = +v; renderQuick(); });
  seg($('opt-rivals'), [1, 3, 5, 7].map(n => [n, n]), quick.rivals, v => { quick.rivals = +v; renderQuick(); });
  seg($('opt-diff'), DIFFS.map((d, i) => [d[0], i]), quick.diff, v => { quick.diff = +v; renderQuick(); });
}
$('quick-go').addEventListener('click', () => startRace({ kind: 'quick', trackId: quick.track, laps: quick.laps, mode: 'race', rivals: quick.rivals, skill: DIFFS[quick.diff][1] }));
function renderTrial() { trackCards($('trial-tracks'), trialTrack, id => { trialTrack = id; renderTrial(); }, bestText); }
$('trial-go').addEventListener('click', () => startRace({ kind: 'trial', trackId: trialTrack, laps: 3, mode: 'timetrial', rivals: 0 }));

// ---------------------------------------------------------------------------
// Race lifecycle
// ---------------------------------------------------------------------------
function startRace(cfg) {
  raceCfg = cfg;
  for (const s of SCREENS) $(s).classList.remove('active');
  $('loading').classList.add('active');
  $('load-text').textContent = 'Building ' + TRACK_BY_ID[cfg.trackId].name + '...';
  ['results', 'pause', 'briefing'].forEach(o => overlay(o, false));
  setTimeout(() => {
    disposeRace();
    const me = Save.carCfg(Save.data.selected);
    race = new Race({
      trackId: cfg.trackId, laps: cfg.laps, mode: cfg.mode, camera, envMap, camMode: Save.data.settings.camera,
      player: { carId: Save.data.selected, upg: me.upg, look: me.look },
      rivals: cfg.mode === 'timetrial' ? [] : buildRivals(cfg.rivals, cfg.skill, cfg.bosses)
    });
    if (cfg.kind === 'story') {
      const ch = CHAPTERS[cfg.chapter];
      $('h-obj').textContent = 'OBJECTIVE: ' + goalText(ch, race.track.L).toUpperCase();
    } else $('h-obj').textContent = cfg.mode === 'timetrial' ? 'RECORD: ' + fmtTime(Save.data.best[cfg.trackId] || Infinity) : '';
    $('loading').classList.remove('active');
    screen = 'race'; view = 'race'; paused = false; resultShown = false; lastGear = 1;
    $('hud').classList.remove('hidden');
    Input.clearEdges();
    Sound.setMusic('race');
    drawMinimapBase();
  }, 40);
}

function setPaused(on) {
  if (!race || view !== 'race' || resultShown) return;
  paused = on;
  overlay('pause', on);
  $('p-camera').textContent = 'Camera: ' + ['Chase', 'Far', 'Cockpit'][race.camMode];
  if (on) setTimeout(() => $('p-resume').focus(), 30);
}
function cycleCamera() {
  race.camMode = (race.camMode + 1) % 3;
  Save.data.settings.camera = race.camMode; Save.write();
  $('p-camera').textContent = 'Camera: ' + ['Chase', 'Far', 'Cockpit'][race.camMode];
}
function quitToMenu() {
  ['pause', 'results'].forEach(o => overlay(o, false));
  $('hud').classList.add('hidden');
  paused = false;
  Sound.setMusic('menu');
  startAttract();
  show('menu');
}
$('h-pause').addEventListener('click', () => setPaused(true));
$('p-resume').addEventListener('click', () => setPaused(false));
$('p-restart').addEventListener('click', () => { overlay('pause', false); startRace(raceCfg); });
$('p-camera').addEventListener('click', cycleCamera);
$('p-quit').addEventListener('click', quitToMenu);

function evaluate(cfg, res) {
  if (cfg.kind !== 'story') return null;
  const ch = CHAPTERS[cfg.chapter], g = ch.goal;
  if (g.type === 'top') return res.position <= g.n;
  if (g.type === 'win') return res.position === 1;
  if (g.type === 'beat') return res.beat(g.who);
  if (g.type === 'time') return res.bestLap <= res.trackLength / g.speed;
  return false;
}

function showResults(res) {
  resultShown = true;
  const cfg = raceCfg, ok = evaluate(cfg, res), d = Save.data;
  let credits = 0, title, kicker, sub = '', color = '#ffd60a';
  d.stats.races++;
  if (res.position === 1 && res.total > 1) d.stats.wins++;
  const prevBest = d.best[cfg.trackId] || Infinity;
  if (res.bestLap < prevBest) d.best[cfg.trackId] = res.bestLap;

  if (cfg.kind === 'story') {
    const ch = CHAPTERS[cfg.chapter], first = cfg.chapter === d.story.progress;
    kicker = `CHAPTER ${cfg.chapter + 1} · ${ch.title.toUpperCase()}`;
    if (ok) {
      credits = first ? ch.reward : Math.round(ch.reward * 0.25);
      if (first) d.story.progress++;
      title = 'COMPLETE'; color = '#a3ff12';
    } else { credits = 250; title = 'FAILED'; color = '#ff3b30'; }
    $('r-goal').className = 'goal ' + (ok ? 'ok' : 'fail');
    $('r-goal').textContent = (ok ? '✓ ' : '✗ ') + goalText(ch, res.trackLength);
  } else {
    $('r-goal').className = 'goal hidden';
    if (cfg.kind === 'trial') {
      credits = 300 + (res.bestLap < prevBest ? 700 : 0);
      title = fmtTime(res.bestLap); kicker = 'TIME TRIAL · BEST LAP';
      sub = res.bestLap < prevBest ? 'NEW TRACK RECORD!' : 'Record: ' + fmtTime(prevBest);
    } else {
      const share = [1, 0.6, 0.42, 0.3, 0.2, 0.12, 0.08, 0.05][res.position - 1] || 0.05;
      credits = Math.round((500 + cfg.laps * 400) * (0.6 + cfg.skill * 0.5) * (0.5 + cfg.rivals / 7) * share / 10) * 10;
      title = ordinal(res.position); kicker = 'QUICK RACE · ' + TRACK_BY_ID[cfg.trackId].name.toUpperCase();
      color = res.position === 1 ? '#ffd60a' : res.position <= 3 ? '#00e5ff' : '#e6f1ff';
    }
  }
  if (cfg.kind === 'story' || cfg.kind === 'quick') sub = sub || `${ordinal(res.position)} of ${res.total} · ${fmtTime(res.time)} · best lap ${fmtTime(res.bestLap)}`;
  d.credits += credits;
  Save.write();

  $('r-kicker').textContent = kicker;
  $('r-title').textContent = title; $('r-title').style.color = color;
  $('r-sub').textContent = sub;
  $('r-credits').textContent = credits.toLocaleString();
  $('r-table').innerHTML = res.rows.map((r, i) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}${r.boss ? ' ★' : ''}</td><td>${r.car}</td>
    <td>${r.finished ? fmtTime(r.time) : '+' + r.gap.toFixed(1) + 's'}</td></tr>`).join('');
  $('r-table').classList.toggle('hidden', res.total === 1);
  $('r-retry').textContent = cfg.kind === 'story' && !ok ? 'Retry Chapter' : 'Race Again';
  $('r-continue').onclick = () => {
    overlay('results', false);
    if (cfg.kind === 'story' && ok) {
      const ch = CHAPTERS[cfg.chapter];
      $('hud').classList.add('hidden');
      dialogue(ch.outro, () => { quitToMenu(); show('story'); if (d.story.progress >= CHAPTERS.length && cfg.chapter === CHAPTERS.length - 1) toast('★ STORY COMPLETE: YOU ARE THE CHAMPION ★'); });
    } else { quitToMenu(); show(cfg.kind === 'story' ? 'story' : cfg.kind === 'trial' ? 'trial' : 'quick'); }
  };
  overlay('results', true);
  setTimeout(() => $('r-continue').focus(), 30);
}
$('r-retry').addEventListener('click', () => { overlay('results', false); startRace(raceCfg); });
$('r-menu').addEventListener('click', quitToMenu);

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const mm = { ctx: $('minimap').getContext('2d'), base: null, scale: 1, ox: 0, oz: 0 };
function drawMinimapBase() {
  const pts = race.track.minimap, c = document.createElement('canvas'); c.width = c.height = 220;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  mm.scale = 180 / Math.max(maxX - minX, maxZ - minZ);
  mm.ox = 110 - (minX + maxX) / 2 * mm.scale; mm.oz = 110 - (minZ + maxZ) / 2 * mm.scale;
  const x = c.getContext('2d'), th = race.track.theme;
  x.lineJoin = 'round';
  for (const [w, col] of [[9, 'rgba(255,255,255,0.12)'], [3, th.edgeR]]) {
    x.beginPath();
    pts.forEach(([px, pz], i) => x[i ? 'lineTo' : 'moveTo'](px * mm.scale + mm.ox, pz * mm.scale + mm.oz));
    x.closePath(); x.lineWidth = w; x.strokeStyle = col; x.stroke();
  }
  const [sx, sz] = pts[0];
  x.fillStyle = '#fff'; x.fillRect(sx * mm.scale + mm.ox - 5, sz * mm.scale + mm.oz - 2, 10, 4);
  mm.base = c;
}
function drawMinimap() {
  const x = mm.ctx;
  x.clearRect(0, 0, 220, 220);
  if (mm.base) x.drawImage(mm.base, 0, 0);
  for (const r of [...race.racers].sort((a, b) => a.isPlayer - b.isPlayer)) {
    const p = r.mesh.group.position;
    x.beginPath();
    x.arc(p.x * mm.scale + mm.ox, p.z * mm.scale + mm.oz, r.isPlayer ? 6 : 4, 0, Math.PI * 2);
    x.fillStyle = r.isPlayer ? '#ffd60a' : r.boss ? BOSSES[r.boss].look.neon : '#e6f1ff';
    x.fill();
    if (r.isPlayer) { x.lineWidth = 2; x.strokeStyle = '#000'; x.stroke(); }
  }
}

const GEARS = [0, 0.12, 0.25, 0.39, 0.54, 0.7, 0.86];
function gearOf(frac) { let g = 0; while (g < GEARS.length - 1 && frac >= GEARS[g + 1]) g++; return g; }

function updateHUD() {
  const h = race.hud();
  if (!h) return;
  $('h-pos').textContent = h.pos; $('h-total').textContent = h.total;
  $('h-lap').textContent = `${h.lap}/${h.laps}`;
  $('h-time').textContent = fmtTime(h.time);
  $('h-laptime').textContent = fmtTime(h.lapTime);
  $('h-best').textContent = fmtTime(h.best);
  $('h-speed').textContent = Math.round(h.speed);
  const frac = Math.min(1, h.speedFrac);
  $('h-arc').style.strokeDashoffset = 251.3 * (1 - frac);
  $('h-arc').classList.toggle('hot', h.boosting);
  const g = gearOf(frac);
  $('h-gear').textContent = h.speed < 2 ? 'N' : 'G' + (g + 1);
  $('h-boost').style.width = (h.boost * 100).toFixed(1) + '%';
  $('h-hull').style.width = (h.hp * 100).toFixed(1) + '%';
  $('h-slip').classList.toggle('on', h.slip > 0.05 && h.state === 'race');
  $('h-slide').classList.toggle('on', h.sliding && h.state === 'race');
  $('vignette').classList.toggle('on', h.boosting);
  $('flash').style.opacity = Math.min(0.8, h.flash);
  for (const m of race.takeMessages()) {
    const el = m.big ? $('h-count') : $('h-msg');
    el.textContent = m.text; el.style.color = m.color;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  drawMinimap();
}

function engineAudio() {
  if (view === 'race' && race && race.player && !paused && !resultShown) {
    const p = race.player, frac = Math.min(1, p.v / (p.st.top * 1.32)), g = gearOf(frac);
    const lo = GEARS[g], hi = GEARS[g + 1] || 1.05;
    let rpm = 0.3 + 0.7 * Math.min(1, (frac - lo) / (hi - lo));
    if (race.state === 'countdown' || race.state === 'intro') rpm = 0.25 + (Input.keys.ArrowUp || Input.keys.KeyW ? 0.6 : 0);
    if (g > lastGear) Sound.play('shift');
    lastGear = g;
    Sound.engine(true, rpm, Math.max(p.throttle, p.boosting ? 1 : 0));
  } else Sound.engine(false, 0, 0);
}

// touch controls
if ('ontouchstart' in window || matchMedia('(pointer: coarse)').matches) $('touch').classList.remove('hidden');
$('touch').querySelectorAll('button').forEach(b => {
  const set = v => { Input.touch[b.dataset.t] = v; b.classList.toggle('down', v); };
  b.addEventListener('pointerdown', e => { e.preventDefault(); set(true); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => set(false));
});

// ---------------------------------------------------------------------------
// Garage
// ---------------------------------------------------------------------------
let gIndex = Math.max(0, CARS.findIndex(c => c.id === Save.data.selected)), gTab = 'perf';
function enterGarage() {
  if (!showroom) showroom = new Showroom(camera, envMap);
  view = 'garage';
  renderGarage();
}
function lookOf(car) { return Save.carCfg(car.id).look; }
function renderGarage() {
  const car = CARS[gIndex], cfg = Save.carCfg(car.id), d = Save.data;
  showroom.show(car.model, cfg.look);
  $('g-cls').textContent = 'CLASS ' + car.cls;
  $('g-name').textContent = car.name;
  $('g-desc').textContent = car.desc;
  $('g-stats').innerHTML = STAT_KEYS.map(k => {
    const base = car.stats[k], up = cfg.upg[k] * UPG_STEP;
    return `<div class="stat"><span>${STAT_LABELS[k]}</span><div class="track-bar"><i class="base" style="width:${base / STAT_MAX * 100}%"></i><i class="up" style="width:${up / STAT_MAX * 100}%"></i></div><em>${(base + up).toFixed(1)}</em></div>`;
  }).join('');
  const act = $('g-action');
  if (!cfg.owned) act.innerHTML = `<button class="btn primary" id="g-buy" ${d.credits < car.price ? 'disabled' : ''}>Buy · ${car.price.toLocaleString()} CR</button>`;
  else if (d.selected === car.id) act.innerHTML = '<div class="badge">✓ RACING THIS CAR</div>';
  else act.innerHTML = '<button class="btn primary" id="g-select">Select Car</button>';
  if ($('g-buy')) $('g-buy').onclick = () => {
    if (d.credits < car.price) return Sound.play('deny');
    d.credits -= car.price; cfg.owned = true; d.selected = car.id; Save.write();
    Sound.play('buy'); toast(`${car.name} added to your garage!`); refreshCredits(); renderGarage();
  };
  if ($('g-select')) $('g-select').onclick = () => { d.selected = car.id; Save.write(); Sound.play('click'); renderGarage(); };
  document.querySelectorAll('#g-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === gTab));
  renderGarageTab(car, cfg);
}
function renderGarageTab(car, cfg) {
  const body = $('g-tab'), d = Save.data;
  if (!cfg.owned) { body.innerHTML = `<p class="locked-note">Buy the ${car.name} to tune and customize it.<br>The showroom preview uses its factory spec.</p>`; return; }
  if (gTab === 'perf') {
    body.innerHTML = UPGRADES.map(u => {
      const lvl = cfg.upg[u.stat], max = lvl >= MAX_UPG, cost = upgradeCost(car, lvl);
      return `<div class="upg"><b>${u.name}</b><small>${u.desc}</small><div class="pips">${Array.from({ length: MAX_UPG }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        <button class="btn ${max ? '' : 'primary'}" data-up="${u.stat}" ${max || d.credits < cost ? 'disabled' : ''}>${max ? 'MAX' : cost.toLocaleString() + ' CR'}</button></div>`;
    }).join('');
    body.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.up, cost = upgradeCost(car, cfg.upg[k]);
      if (d.credits < cost || cfg.upg[k] >= MAX_UPG) return Sound.play('deny');
      d.credits -= cost; cfg.upg[k]++; Save.write();
      Sound.play('levelup'); refreshCredits(); renderGarage();
    }));
  } else if (gTab === 'paint') {
    const groups = [['paint', 'Body Paint', PALETTE], ['accent', 'Accent / Trim', ['#14161c', '#0b0b0f', '#374151', '#9ca3af', '#f8fafc', '#ffd60a', '#ff2d55', '#00e5ff']],
      ['neon', 'Underglow Neon', NEON], ['thruster', 'Thruster Flame', NEON]];
    body.innerHTML = groups.map(([key, label, cols]) => `<div class="swatch-group"><h4>${label}</h4><div class="swatches">
      ${cols.map(c => `<button class="sw ${cfg.look[key].toLowerCase() === c.toLowerCase() ? 'on' : ''}" style="background:${c}" data-k="${key}" data-c="${c}" aria-label="${c}"></button>`).join('')}
      <input type="color" data-k="${key}" value="${cfg.look[key]}" title="Custom color"></div></div>`).join('') +
      '<button class="btn ghost" id="g-reset-paint">Factory colors</button>';
    const apply = (k, c) => { cfg.look[k] = c; Save.write(); showroom.setLook(cfg.look); };
    body.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () => { Sound.play('click'); apply(b.dataset.k, b.dataset.c); renderGarageTab(car, cfg); }));
    body.querySelectorAll('input[type=color]').forEach(inp => {
      inp.addEventListener('input', () => apply(inp.dataset.k, inp.value));
      inp.addEventListener('change', () => renderGarageTab(car, cfg));
    });
    $('g-reset-paint').onclick = () => { const def = defaultLook(car); Object.assign(cfg.look, { paint: def.paint, accent: def.accent, neon: def.neon, thruster: def.thruster }); Save.write(); showroom.setLook(cfg.look); renderGarageTab(car, cfg); };
  } else {
    const list = (kind, title, items) => `<div class="swatch-group"><h4>${title}</h4>${items.map(it => {
      const owned = Save.owns(kind, it.id), on = cfg.look[kind] === it.id;
      return `<button class="kit-item ${on ? 'on' : ''} ${owned ? 'owned' : ''}" data-kind="${kind}" data-id="${it.id}"><span>${it.name}</span><em>${on ? 'EQUIPPED' : owned ? 'OWNED' : it.price.toLocaleString() + ' CR'}</em></button>`;
    }).join('')}</div>`;
    body.innerHTML = list('finish', 'Paint Finish', FINISHES) + list('wing', 'Rear Wing', WINGS);
    body.querySelectorAll('.kit-item').forEach(b => b.addEventListener('click', () => {
      const { kind, id } = b.dataset, item = (kind === 'finish' ? FINISHES : WINGS).find(i => i.id === id);
      if (!Save.owns(kind, id)) {
        if (d.credits < item.price) { Sound.play('deny'); return toast(`Need ${item.price.toLocaleString()} CR`); }
        d.credits -= item.price; d.items[kind + ':' + id] = true; Sound.play('buy'); toast(`${item.name} unlocked for every car`); refreshCredits();
      } else Sound.play('click');
      cfg.look[kind] = id; Save.write(); showroom.setLook(cfg.look); renderGarageTab(car, cfg);
    }));
  }
}
$('g-prev').addEventListener('click', () => { gIndex = (gIndex + CARS.length - 1) % CARS.length; Sound.play('click'); renderGarage(); });
$('g-next').addEventListener('click', () => { gIndex = (gIndex + 1) % CARS.length; Sound.play('click'); renderGarage(); });
document.querySelectorAll('#g-tabs button').forEach(b => b.addEventListener('click', () => { gTab = b.dataset.tab; Sound.play('click'); renderGarage(); }));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function renderSettings() {
  const s = Save.data.settings;
  $('s-music').value = s.music; $('s-sfx').value = s.sfx;
  seg($('s-quality'), [['High', 'high'], ['Medium', 'medium'], ['Low', 'low']], s.quality, v => { s.quality = v; Save.write(); resize(); renderSettings(); });
  seg($('s-camera'), [['Chase', 0], ['Far', 1], ['Cockpit', 2]], s.camera, v => { s.camera = +v; Save.write(); renderSettings(); });
  seg($('s-auto'), [['Off', 'off'], ['On', 'on']], s.autoAccel ? 'on' : 'off', v => { s.autoAccel = v === 'on'; Save.write(); renderSettings(); });
}
$('s-music').addEventListener('input', e => { Save.data.settings.music = +e.target.value; Save.write(); Sound.applySettings(); });
$('s-sfx').addEventListener('input', e => { Save.data.settings.sfx = +e.target.value; Save.write(); Sound.applySettings(); });
$('s-reset').addEventListener('click', () => {
  $('c-text').textContent = 'This erases your credits, cars, upgrades and story progress.';
  overlay('confirm', true);
});
$('c-no').addEventListener('click', () => overlay('confirm', false));
$('c-yes').addEventListener('click', () => {
  Save.reset(); overlay('confirm', false); gIndex = 0; resize(); Sound.applySettings(); toast('Progress reset'); show('menu');
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function handleKeys() {
  if (dlg) {
    if (Input.pressed('Enter', 'Space')) dlgNext();
    if (Input.pressed('Escape')) dlgEnd();
    return;
  }
  if (screen === 'title') { if (Input.pressed('Enter', 'Space')) startFromTitle(); return; }
  if (view === 'race' && !resultShown) {
    if (Input.pressed('Escape', 'KeyP')) setPaused(!paused);
    if (!paused && Input.pressed('KeyC')) cycleCamera();
    return;
  }
  if (Input.pressed('Escape')) {
    if ($('briefing').classList.contains('active')) { overlay('briefing', false); show('story'); }
    else if (['story', 'quick', 'trial', 'garage', 'settings'].includes(screen)) show('menu');
  }
  if (screen === 'garage') {
    if (Input.pressed('ArrowLeft')) $('g-prev').click();
    if (Input.pressed('ArrowRight')) $('g-next').click();
  }
  if (screen === 'menu' && (Input.pressed('ArrowDown') || Input.pressed('ArrowUp'))) {
    const items = [...document.querySelectorAll('.menu-item')];
    let i = items.indexOf(document.activeElement);
    i = Input.keys.ArrowUp ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
    items[i].focus(); Sound.play('click');
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  handleKeys();
  let scene;
  if (view === 'garage' && showroom) { showroom.update(dt); scene = showroom.scene; }
  else if (race) {
    if (!paused) race.update(dt, Input.read(dt, Save.data.settings.autoAccel));
    scene = race.scene;
    if (view === 'race') {
      updateHUD();
      if (race.done && !resultShown) showResults(race.result);
    }
  }
  engineAudio();
  if (!scene) return;
  if (bloom.enabled) { renderPass.scene = scene; composer.render(); }
  else renderer.render(scene, camera);
}

// expose for debugging and automated testing
window.NV = { get race() { return race; }, get screen() { return screen; }, Save, startRace, show, Input };

try {
  startAttract();
  requestAnimationFrame(frame);
  setTimeout(() => show('title'), 300);
} catch (err) {
  $('load-text').textContent = 'Failed to start: ' + err.message;
  console.error(err);
}
