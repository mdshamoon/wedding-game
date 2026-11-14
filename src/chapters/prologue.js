import * as THREE from 'three';
import { SCRIPT } from '../story/script.js';
import { box, cyl, mat } from '../world/decor.js';
import { textTexture, blobTexture } from '../world/textures.js';
import { CONFIG } from '../config.js';
import { makeTree } from '../world/vegetation.js';

const S = SCRIPT.prologue;

function runwayTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#4a4a4c'; x.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 6000; i++) { x.fillStyle = Math.random() < 0.5 ? '#3c3c3e' : '#5a5a5c'; x.fillRect(Math.random() * 256, Math.random() * 1024, 2, 2); }
  x.fillStyle = '#f2f2f2';
  for (let y = 0; y < 1024; y += 128) x.fillRect(124, y, 8, 70); // centre dashes
  x.fillRect(8, 0, 6, 1024); x.fillRect(242, 0, 6, 1024);
  for (let y = 0; y < 1024; y += 512) for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(30,30,30,0.35)'; x.fillRect(110 + Math.random() * 30, y + Math.random() * 500, 10, 60); } // tyre marks
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function buildPlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, metalness: 0.2, roughness: 0.35 });
  const emer = new THREE.MeshStandardMaterial({ color: 0x0f4a38, metalness: 0.3, roughness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x111820, metalness: 0.9, roughness: 0.1 });
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(2.0, 30, 8, 20), white); fus.rotation.x = Math.PI / 2; fus.position.y = 3.6; g.add(fus);
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(2.02, 29, 6, 20, ), emer); belly.rotation.x = Math.PI / 2; belly.position.y = 3.3; belly.scale.set(1, 1, 0.55); g.add(belly);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.04, 2.04, 28, 20, 1, true, Math.PI * 0.42, Math.PI * 0.16), gold); stripe.rotation.x = Math.PI / 2; stripe.position.y = 3.6; g.add(stripe);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), glass); cockpit.position.set(0, 4.3, 15.6); cockpit.rotation.x = 1.2; g.add(cockpit);
  for (let i = -12; i < 13; i++) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.26), glass); w.position.set(s * 1.98, 4.3, i * 1.0); g.add(w); }
  const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.lineTo(16, -5); wingShape.lineTo(16.5, -6.6); wingShape.lineTo(0, -7); wingShape.closePath();
  for (const s of [-1, 1]) {
    const wg = new THREE.ExtrudeGeometry(wingShape, { depth: 0.35, bevelEnabled: false }); wg.rotateX(Math.PI / 2);
    const w = new THREE.Mesh(wg, white); w.scale.x = s; w.position.set(s * 1.2, 2.6, 4); g.add(w);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.9, 3.6, 16), white); eng.rotation.x = Math.PI / 2; eng.position.set(s * 5.6, 1.6, 4.2); g.add(eng);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.1, 16), glass); intake.rotation.x = Math.PI / 2; intake.position.set(s * 5.6, 1.6, 6.05); g.add(intake);
    const tail = new THREE.ExtrudeGeometry(wingShape, { depth: 0.2, bevelEnabled: false }); tail.rotateX(Math.PI / 2);
    const tw = new THREE.Mesh(tail, white); tw.scale.set(s * 0.38, 1, 0.42); tw.position.set(s * 0.6, 4.4, -13); g.add(tw);
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14), mat(0x161616)); gear.rotation.z = Math.PI / 2; gear.position.set(s * 2.6, 0.55, 2.5); g.add(gear);
  }
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(5, 0); finShape.lineTo(8.5, 7); finShape.lineTo(6, 7); finShape.closePath();
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.3, bevelEnabled: false }), emer); fin.rotation.y = -Math.PI / 2; fin.position.set(0.15, 5, -17); g.add(fin);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: textTexture('S&A', { w: 256, h: 256, font: '150px "Great Vibes", cursive', color: '#d4af37' }), transparent: true }));
  logo.position.set(0.35, 8.7, -11.6); logo.rotation.y = Math.PI / 2; g.add(logo);
  const logo2 = logo.clone(); logo2.position.x = -0.35; logo2.rotation.y = -Math.PI / 2; g.add(logo2);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.4, 10), mat(0x161616)); nose.position.set(0, 0.4, 13); nose.rotation.z = Math.PI / 2; g.add(nose);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function buildAirport() {
  const g = new THREE.Group();
  const gc = document.createElement('canvas'); gc.width = gc.height = 256; const gx = gc.getContext('2d');
  gx.fillStyle = '#7d8c50'; gx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { gx.fillStyle = `hsl(${70 + Math.random() * 25},${30 + Math.random() * 20}%,${30 + Math.random() * 20}%)`; gx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 3); }
  for (let i = 0; i < 30; i++) { gx.fillStyle = `rgba(150,130,80,${Math.random() * 0.25})`; gx.beginPath(); gx.ellipse(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 30, 6 + Math.random() * 20, Math.random() * 3, 0, 7); gx.fill(); }
  const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(600, 600); gt.colorSpace = THREE.SRGBColorSpace; gt.anisotropy = 8;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gt }));
  grass.receiveShadow = true; g.add(grass);
  // tree belts around the airfield and a distant Lucknow skyline
  for (let i = 0; i < 160; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const t = makeTree(Math.random() < 0.5 ? 1 : 2, 0.9 + Math.random() * 0.6);
    t.position.set(side * (420 + Math.random() * 500), 0, (Math.random() - 0.5) * 3000); g.add(t);
  }
  const city = new THREE.Group(); g.add(city);
  for (let i = 0; i < 90; i++) {
    const h = 10 + Math.random() * 45, w = 12 + Math.random() * 25;
    const b = box(w, h, w, mat([0xd9d2c4, 0xcfc6b6, 0xe4ddd0, 0xbfb6a6][i % 4]), (Math.random() - 0.5) * 2600, 0, -1600 - Math.random() * 900, city, false);
    void b;
  }
  const rt = runwayTexture(); rt.repeat.set(1, 30);
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(45, 2400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: rt }));
  rw.position.y = 0.05; rw.receiveShadow = true; g.add(rw);
  // threshold piano keys
  for (let i = -8; i <= 8; i++) { if (Math.abs(i) < 1) continue; const k = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 30).rotateX(-Math.PI / 2), mat(0xf2f2f2)); k.position.set(i * 2.4, 0.07, 1150); g.add(k); }
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(25, 1400).rotateX(-Math.PI / 2), mat(0x58585a)); taxi.position.set(140, 0.04, 0); g.add(taxi);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(260, 160).rotateX(-Math.PI / 2), mat(0x6a6a6c)); apron.position.set(260, 0.05, -200); g.add(apron);
  // terminal: long glass facade with sign
  const term = new THREE.Group(); term.position.set(330, 0, -200); g.add(term);
  box(40, 16, 220, mat(0xe9e4da), 0, 0, 0, term);
  box(1, 12, 210, new THREE.MeshStandardMaterial({ color: 0x1d3340, metalness: 0.85, roughness: 0.12 }), -20.2, 2, 0, term);
  box(48, 1.5, 228, mat(0xd8d0c0), 0, 16, 0, term);
  for (let z = -100; z <= 100; z += 10) box(0.5, 12, 0.5, mat(0xd8d0c0), -20.6, 2, z, term);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(90, 9), new THREE.MeshBasicMaterial({ map: textTexture('CHAUDHARY CHARAN SINGH INTERNATIONAL AIRPORT · LUCKNOW', { w: 2048, h: 205, font: '600 92px Cinzel, serif', color: '#0f4a38', bg: '#f7f0e1' }) }));
  sign.position.set(-24.5, 20, 0); sign.rotation.y = -Math.PI / 2; term.add(sign);
  // control tower
  cyl(3, 4, 40, mat(0xe9e4da), 230, 0, -380, g); cyl(7, 6, 6, new THREE.MeshStandardMaterial({ color: 0x1d3340, metalness: 0.8, roughness: 0.15 }), 230, 40, -380, g); cyl(7.5, 7.5, 1.2, mat(0xd8d0c0), 230, 46, -380, g);
  // runway edge lights
  for (let z = -1200; z <= 1200; z += 60) for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), mat(0xfff2c0, { emissive: 0xffd27a, emissiveIntensity: 1 })); l.position.set(s * 24, 0.3, z); g.add(l); }
  return g;
}

async function landing(game) {
  const { scene, story, rig, world, audio } = game;
  world.root.visible = false; world.ground.enabled = false;
  world.sky.set('afternoon');
  const airport = buildAirport(); scene.add(airport);
  const plane = buildPlane(); scene.add(plane);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false })); blob.position.y = 0.1; scene.add(blob);
  // descent path: approach from +z toward -z
  const pathPos = (t) => { // t in seconds
    const z = 1700 - t * 72; const y = Math.max(0, (z - 1050) * 0.08);
    return new THREE.Vector3(0, y, z);
  };
  let t = 0, smoke = [];
  plane.rotation.y = Math.PI;
  audio.setAmbience('airport');
  story.cutscene(true);
  let rollZ = null, v = 72;
  const off = game.onUpdate((dt) => {
    t += dt;
    const p = pathPos(Math.min(t, 9.6));
    if (t > 9.6) {
      if (rollZ === null) rollZ = p.z;
      v = Math.max(0, v - dt * 9); rollZ -= v * dt; p.z = rollZ; p.y = 0;
    }
    plane.position.copy(p);
    plane.rotation.x = p.y > 0.5 ? -0.07 : Math.max(0, plane.rotation.x - dt * 0.05);
    blob.position.set(p.x, 0.1, p.z);
    blob.material.opacity = Math.max(0, 1 - p.y / 40);
    game.focus.copy(p);
    if (p.y <= 0 && t < 10.4 && Math.random() < 0.6) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0.6, depthWrite: false }));
      s.position.set((Math.random() < 0.5 ? -1 : 1) * 2.6, 0.6, p.z + 2); scene.add(s); smoke.push(s);
    }
    smoke = smoke.filter((s) => { s.scale.multiplyScalar(1 + dt * 1.5); s.material.opacity -= dt * 0.4; if (s.material.opacity <= 0) { scene.remove(s); return false; } return true; });
  });
  // shots
  rig.set(new THREE.Vector3(60, 6, 900), new THREE.Vector3(0, 40, 1500));
  const kicker = story.caption(S.landing[0], S.landing[1], 4.5);
  await rig.path([new THREE.Vector3(70, 5, 1000), new THREE.Vector3(55, 4, 1060), new THREE.Vector3(40, 3, 1120)], 9.5, () => plane.position.clone().add(new THREE.Vector3(0, 3, 0)));
  await kicker;
  if (!story.skipping) audio.sfx('planeLand');
  await rig.moveTo({ pos: new THREE.Vector3(-35, 3, 960), look: new THREE.Vector3(0, 3, 900), ease: (k) => k }, 0.01);
  const follow = game.onUpdate(() => { rig.look.copy(plane.position).add(new THREE.Vector3(0, 3, 0)); });
  await story.caption(S.pa, 'Cabin announcement', 5);
  follow();
  // terminal shot
  await story.fade(true, 0.6);
  off();
  rig.set(new THREE.Vector3(260, 4, -180), new THREE.Vector3(310, 12, -200));
  await story.fade(false, 0.6);
  await story.lines(S.lines1);
  audio.sfx('phoneRing');
  await story.wait(1.2);
  await story.lines(S.call);
  await story.fade(true, 0.8);
  scene.remove(airport, plane, blob); smoke.forEach((s) => scene.remove(s));
  world.root.visible = true; world.ground.enabled = true;
}

// Animated road-trip map: Lucknow → Kichha with real city positions.
async function roadMap(game) {
  const { story, audio, ui } = game;
  const cities = [['Lucknow', 26.8467, 80.9462], ['Sitapur', 27.568, 80.6827], ['Shahjahanpur', 27.8826, 79.912], ['Bareilly', 28.367, 79.4304], ['Baheri', 28.7741, 79.4957], ['Kichha', 28.9103, 79.5189]];
  const el = document.createElement('div');
  el.className = 'paper'; el.style.cssText = 'position:fixed;inset:0;z-index:29;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .8s';
  el.innerHTML = `<div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div><canvas style="width:min(92vw,980px);height:min(80vh,640px)"></canvas>
    <div style="position:absolute;bottom:calc(9vh + env(safe-area-inset-bottom,0px));left:0;right:0;text-align:center"><div class="m-city" style="font-family:var(--display);letter-spacing:.3em;color:var(--accent);font-size:13px;text-transform:uppercase"></div><div class="m-text" style="font-family:var(--serif);font-style:italic;font-size:clamp(20px,4vw,28px);color:var(--ink);margin-top:4px"></div></div>`;
  ui.appendChild(el);
  const cv = el.querySelector('canvas');
  const W = cv.width = 1960, H = cv.height = 1280;
  const ctx = cv.getContext('2d');
  const lon0 = 79.1, lon1 = 81.3, lat0 = 26.6, lat1 = 29.15;
  const P = (lat, lon) => [((lon - lon0) / (lon1 - lon0)) * W, H - ((lat - lat0) / (lat1 - lat0)) * H];
  const pts = cities.map(([, la, lo]) => P(la, lo));
  // densify route with gentle curves
  const route = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 40; k++) { const t = k / 40; const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; route.push([ax + (bx - ax) * t + Math.sin(t * Math.PI) * (i % 2 ? 18 : -18), ay + (by - ay) * t]); }
  route.push(pts[pts.length - 1]);
  const draw = (prog) => {
    ctx.clearRect(0, 0, W, H);
    // faint terrain hint: Terai foothills band in the north
    const grd = ctx.createLinearGradient(0, 0, 0, H * 0.35); grd.addColorStop(0, 'rgba(15,74,56,0.18)'); grd.addColorStop(1, 'rgba(15,74,56,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H * 0.35);
    ctx.font = 'italic 34px "Cormorant Garamond", serif'; ctx.fillStyle = 'rgba(64,51,31,0.45)'; ctx.textAlign = 'left';
    ctx.fillText('UTTARAKHAND', P(29.05, 79.15)[0], P(29.05, 79.15)[1]); ctx.fillText('UTTAR PRADESH', P(27.2, 79.25)[0], P(27.2, 79.25)[1]);
    // state border hint (approximate dotted line)
    ctx.setLineDash([6, 10]); ctx.strokeStyle = 'rgba(154,118,32,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); const b = [[28.83, 79.1], [28.86, 79.4], [28.84, 79.6], [28.9, 79.9], [28.85, 80.2], [28.75, 80.5], [28.9, 80.9], [28.85, 81.3]]; b.forEach(([la, lo], i) => { const [x, y] = P(la, lo); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
    // full route faint
    ctx.strokeStyle = 'rgba(154,118,32,0.25)'; ctx.lineWidth = 6; ctx.beginPath(); route.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    // progressed route in gold
    const n = Math.floor(prog * (route.length - 1));
    ctx.strokeStyle = '#b8912b'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); route.slice(0, n + 1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    // cities
    cities.forEach(([name], i) => {
      const [x, y] = pts[i]; const reached = n >= i * 40;
      ctx.fillStyle = reached ? '#9a7620' : '#f7f0e1'; ctx.strokeStyle = '#9a7620'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, i === 0 || i === cities.length - 1 ? 16 : 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#40331f'; ctx.font = `${i === cities.length - 1 ? '600 46px' : '500 36px'} Cinzel, serif`; ctx.textAlign = x > W * 0.6 ? 'right' : 'left';
      ctx.fillText(name, x + (x > W * 0.6 ? -28 : 28), y + 12);
    });
    // car marker
    const [cx, cy] = route[n];
    ctx.fillStyle = '#0f4a38'; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9c977'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
  };
  draw(0);
  requestAnimationFrame(() => (el.style.opacity = 1));
  await story.fade(false, 0.3);
  audio.playMusic('map');
  const $city = el.querySelector('.m-city'), $txt = el.querySelector('.m-text');
  for (let i = 0; i < cities.length - 1; i++) {
    $city.textContent = S.map[i][0]; $txt.textContent = S.map[i][1];
    const t0 = performance.now(), dur = story.skipping ? 1 : 2600;
    await new Promise((r) => { const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); draw((i + k) / (cities.length - 1)); if (k < 1) requestAnimationFrame(step); else r(); }; step(); });
  }
  $city.textContent = S.map[5][0]; $txt.textContent = S.map[5][1];
  audio.sfx('bell');
  await story.wait(2);
  await story.fade(true, 0.8);
  el.remove();
}

// Aerial swoop over the real Kichha down to the start point
async function swoop(game) {
  const { world, rig, story } = game;
  world.setTime('golden');
  const start = world.routes.arrival.pts[0];
  const kichha = world.places.kichha;
  game.focus.copy(kichha);
  await world.ground.prime(kichha, 4000);
  rig.set(new THREE.Vector3(kichha.x + 400, 320, kichha.z + 500), kichha);
  await story.fade(false, 1.2);
  const cap = story.caption(S.arrive, CONFIG.dates.arrival, 4);
  const p = rig.path([
    new THREE.Vector3(kichha.x + 400, 320, kichha.z + 500),
    new THREE.Vector3(kichha.x + 150, 180, kichha.z + 200),
    new THREE.Vector3(start.x + 40, 30, start.z + 50),
    new THREE.Vector3(start.x + 12, 6, start.z + 14),
  ], story.skipping ? 0.1 : 7.5, (k) => kichha.clone().lerp(start, Math.min(1, k * 1.3)).setY(2));
  const f = game.onUpdate(() => game.focus.copy(game.camera.position).setY(0));
  await p; f();
  await cap;
}

export async function runPrologue(game) {
  const { story, audio } = game;
  await story.fade(true, 0.6);
  await story.fade(false, 0.6);
  await landing(game);
  await roadMap(game);
  await swoop(game);
  story.cutscene(false);
  void audio;
}
