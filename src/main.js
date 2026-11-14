import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CONFIG, QUALITY } from './config.js';
import { World } from './world/World.js';
import { CameraRig } from './core/camera.js';
import { input, setupTouch, setTouchButtons, setDriveControls } from './core/input.js';
import { HUD } from './ui/hud.js';
import { Story, setStoryAudio } from './story/Story.js';
import { loadAudio, loadCharacters } from './core/optional.js';
import { CHAPTERS } from './chapters/index.js';
import { FullMap } from './ui/fullmap.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const bootFill = document.getElementById('boot-fill');
const progress = (v) => { bootFill.style.width = `${Math.round(v * 100)}%`; };

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY.aa, powerPreference: 'high-performance' });
renderer.setPixelRatio(QUALITY.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.4;
renderer.shadowMap.enabled = QUALITY.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 40000);
camera.position.set(0, 80, 120);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- game context shared with chapters
const game = {
  renderer, scene, camera, ui, input, CONFIG, QUALITY,
  rig: new CameraRig(camera),
  hud: new HUD(ui),
  story: new Story(ui),
  world: new World(scene, renderer),
  audio: null,
  focus: new THREE.Vector3(),
  time: 0,
  updaters: new Set(),
  album: [],
  paused: false,
  setTouchButtons, setDriveControls,
  onUpdate(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); },
  _snapReq: null,
  snapshot(caption) { return new Promise((r) => { this._snapReq = { caption, r }; }); },
  save(k, v) { try { localStorage.setItem('dr.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  load(k, d) { try { const v = localStorage.getItem('dr.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
};
window.__game = game; // handy for debugging in the console
// Debug: advance the simulation n frames synchronously (used when the tab is throttled)
window.__step = (n = 60, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) {
    game.time += dt;
    for (const fn of [...game.updaters]) fn(dt, game.time);
    game.world.update(game.focus, game.time, dt);
    game.rig.update(dt);
    game.hud.update(dt);
    input.endFrame?.call(input);
  }
  renderer.render(scene, camera);
  return game.time;
};

// Debug: park a static camera `back` metres behind (x,z) looking along `ang`, then let the world stream.
window.__look = async (x, z, h = 22, back = 40, ang = 0, lookH = 2, waitMs = 6000) => {
  document.getElementById('boot').style.display = 'none'; ui.style.display = 'none';
  game.rig.mode = 'static'; game.focus.set(x, 0, z);
  const cx = x - Math.sin(ang) * back, cz = z - Math.cos(ang) * back;
  camera.position.set(cx, h, cz); game.rig.look.set(x + Math.sin(ang) * 10, lookH, z + Math.cos(ang) * 10); camera.lookAt(game.rig.look);
  const t0 = performance.now();
  while (performance.now() - t0 < waitMs) { window.__step(10); await new Promise((r) => setTimeout(r, 300)); }
  window.__step(1);
};

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (!game.paused) {
    game.time += dt;
    for (const fn of [...game.updaters]) fn(dt, game.time);
    game.world.update(game.focus, game.time, dt);
    game.rig.update(dt);
    game.hud.update(dt);
  }
  renderer.render(scene, camera);
  if (game._snapReq) {
    const { caption, r } = game._snapReq; game._snapReq = null;
    const c = document.createElement('canvas'); const w = 720, h = Math.round(720 * innerHeight / innerWidth);
    c.width = w; c.height = h; c.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
    const shot = { caption, url: c.toDataURL('image/jpeg', 0.82) };
    game.album.push(shot); r(shot);
  }
  input.endFrame();
}

// ---------------------------------------------------------------- title screen
function leaves(container, n = 14) {
  const box = document.createElement('div'); box.className = 'leaves'; container.appendChild(box);
  const spawn = () => {
    if (!box.isConnected) return;
    const l = document.createElement('div'); l.className = 'leaf';
    l.style.left = `${Math.random() * 100}%`;
    l.style.setProperty('--dx', `${(Math.random() - 0.5) * 300}px`);
    l.style.setProperty('--rot', `${(Math.random() - 0.5) * 900}deg`);
    l.style.animationDuration = `${7 + Math.random() * 6}s`;
    l.style.transform = `scale(${0.6 + Math.random() * 0.7})`;
    box.appendChild(l); setTimeout(() => l.remove(), 14000);
    setTimeout(spawn, 900 + Math.random() * 1200);
  };
  for (let i = 0; i < 3; i++) setTimeout(spawn, i * 700);
  void n;
  return box;
}

function titleScreen() {
  return new Promise((resolve) => {
    const unlocked = game.load('unlocked', 0);
    const el = document.createElement('div'); el.className = 'title-screen';
    el.innerHTML = `
      <div class="title-card">
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="title-bismillah">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ</div>
        <div class="title-kicker">A playable story of the wedding of</div>
        <div class="title-main">${CONFIG.groomName}</div>
        <div class="title-amp">&amp;</div>
        <div class="title-main">${CONFIG.brideName}</div>
        <div class="flourish"></div>
        <div class="title-sub">The Road to Nikah</div>
        <div class="title-dates">Kichha · 22 – 25 March 2027</div>
        <div class="title-menu">
          <button class="btn" data-a="play">${unlocked > 0 ? 'Continue' : 'Begin the Story'}</button>
          <button class="btn ghost small" data-a="chapters">Chapters</button>
        </div>
        <div class="chapter-list" style="display:none"></div>
      </div>
      <div class="attrib">${CONFIG.tiles.attribution}</div>`;
    ui.appendChild(el);
    const lv = leaves(el);
    const list = el.querySelector('.chapter-list');
    CHAPTERS.forEach((c, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<small>${c.kicker}</small>${c.title}`;
      b.disabled = i > unlocked && !location.search.includes('all');
      b.addEventListener('click', () => { game.audio.unlock(); game.audio.sfx('confirm'); done(i); });
      list.appendChild(b);
    });
    const done = (i) => { el.style.transition = 'opacity .8s'; el.style.opacity = 0; setTimeout(() => { el.remove(); lv.remove(); }, 800); resolve(i); };
    el.querySelector('[data-a=play]').addEventListener('click', () => { game.audio.unlock(); game.audio.sfx('confirm'); done(Math.min(unlocked, CHAPTERS.length - 1)); });
    el.querySelector('[data-a=chapters]').addEventListener('click', () => { list.style.display = list.style.display === 'none' ? '' : 'none'; });
  });
}

// Envelope with wax seal, like the invitation. Tap to open (also unlocks audio).
function envelope() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'title-screen';
    el.style.background = 'var(--ogee), var(--paper)';
    el.innerHTML = `<div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
      <div style="position:absolute;left:0;right:0;top:0;height:46%;background:linear-gradient(180deg,#f3ead6,#e6d8b8);clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%);box-shadow:0 2px 0 #b8912b55"></div>
      <div class="seal" style="position:absolute;top:calc(46% - 46px)"><span>${CONFIG.monogram}</span></div>
      <div style="position:absolute;bottom:22%;font-family:var(--display);letter-spacing:.3em;font-size:12px;color:var(--accent)">${CONFIG.groomFull.toUpperCase()} &amp; ${CONFIG.brideFull.toUpperCase()}</div>
      <div style="position:absolute;bottom:14%;font-family:var(--display);letter-spacing:.3em;font-size:12px;color:var(--accent);animation:pulse 1.6s infinite">◦ TAP TO OPEN</div>`;
    ui.appendChild(el);
    el.addEventListener('click', () => {
      game.audio.unlock(); game.audio.sfx('whoosh');
      el.style.transition = 'opacity 1s, transform 1s'; el.style.opacity = 0; el.style.transform = 'scale(1.06)';
      setTimeout(() => { el.remove(); resolve(); }, 900);
    }, { once: true });
  });
}

// Slow aerial orbit over home as the title backdrop
function titleBackdrop() {
  game.world.setTime('golden');
  const home = game.world.venues.home.anchors.courtyard;
  game.focus.copy(home);
  game.camera.position.set(home.x + 220, 120, home.z + 220);
  game.rig.look.copy(home);
  game.rig.orbit(home.clone().setY(0), 260, 130, 0.04);
}

// ---------------------------------------------------------------- boot
async function boot() {
  progress(0.05);
  game.audio = await loadAudio();
  setStoryAudio(game.audio);
  await loadCharacters();
  progress(0.15);
  await game.world.load((v) => progress(0.15 + v * 0.75));
  setupTouch(ui);
  game.fullmap = new FullMap(game);
  game.hud.onMapClick(() => game.fullmap.toggle());
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat && !game.fullmap.isOpen && !document.querySelector('.panel')) game.fullmap.open(); });
  titleBackdrop();
  frame();
  await game.world.ground.prime(game.focus, 5000);
  progress(1);
  document.getElementById('boot').classList.add('hide');
  const direct = new URLSearchParams(location.search).get('ch');
  let idx;
  if (direct !== null) idx = Math.max(0, Math.min(CHAPTERS.length - 1, parseInt(direct, 10) || 0));
  else {
    await envelope();
    game.audio.playMusic('title');
    idx = await titleScreen();
  }
  // play chapters in order from the chosen one
  while (idx < CHAPTERS.length) {
    game.save('unlocked', Math.max(game.load('unlocked', 0), idx));
    game.hud.hideAll(); setTouchButtons(null);
    await CHAPTERS[idx].run(game);
    idx++;
    game.save('unlocked', Math.max(game.load('unlocked', 0), Math.min(idx, CHAPTERS.length - 1)));
  }
  location.reload();
}

boot().catch((e) => {
  console.error(e);
  document.querySelector('.boot-sub').textContent = 'Something went wrong: ' + e.message;
});
