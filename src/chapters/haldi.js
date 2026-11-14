import * as THREE from 'three';
import { SCRIPT } from '../story/script.js';
import { Cast, basis, offset } from './cast.js';
import { FX } from '../world/fx.js';
import { box, mat } from '../world/decor.js';

const S = SCRIPT.ch2;

function iconSprite(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  if (kind === 'haldi') {
    x.fillStyle = 'rgba(10,46,33,0.85)'; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill();
    x.strokeStyle = '#d4af37'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#b8862b'; x.beginPath(); x.ellipse(64, 74, 34, 18, 0, 0, Math.PI); x.fill();
    x.fillStyle = '#f5c518'; x.beginPath(); x.ellipse(64, 72, 30, 9, 0, 0, 7); x.fill();
  } else {
    x.fillStyle = 'rgba(160,20,30,0.9)'; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 84px Cinzel, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 64, 70);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.55, 0.55, 1); s.renderOrder = 20;
  return s;
}

function bucket() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.28, 14, 1, true), mat(0x1e88e5, { side: THREE.DoubleSide }));
  const w = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14).rotateX(-Math.PI / 2), mat(0x7fc8ff)); w.position.y = 0.1;
  g.add(b, w); return g;
}

async function haldiRush(game, ctx) {
  const { story, hud, audio, input } = game;
  const { cast, groom, seat, b, fx } = ctx;
  const dirs = { left: b.r.clone().negate(), front: b.f.clone(), right: b.r.clone() };
  const slot = (k, d = 1.25) => offset(seat, b, 0, 0).addScaledVector(dirs[k], d).setY(0.12);
  let facing = 'front', duck = false, score = 0, haldi = 0, streak = 0;
  const duration = 55;
  let t = 0, nextSpawn = 1.0, nextWater = 7;
  const active = []; // {a, kind, slot, state, timer, icon}
  const roles = ['aunty', 'uncle', 'youngWoman', 'kid', 'elder', 'aunty', 'youngWoman'];
  hud.show({ score: 1 }); hud.score('Haldi 0');
  hud.hint(game.input.isTouch ? 'Tap ◀ ▲ ▶ to turn · DUCK to dodge' : '← ↑ → turn to face · Space / ↓ duck');
  game.setTouchButtons([{ name: 'left', label: '◀' }, { name: 'up', label: '▲' }, { name: 'right', label: '▶' }, { name: 'action', label: 'Duck' }], false);
  audio.playMusic('haldi');
  const occupied = () => new Set(active.map((x) => x.slot));

  return new Promise((resolve) => {
    const off = game.onUpdate((dt) => {
      t += dt;
      hud.meter(1 - t / duration);
      // input → facing
      const ax = input.axisX(), ay = input.axisY();
      if (input.held('left') || ax < -0.5) facing = 'left';
      else if (input.held('right') || ax > 0.5) facing = 'right';
      else if (input.held('up') || ay > 0.5) facing = 'front';
      duck = input.held('action') || ay < -0.5;
      const want = Math.atan2(dirs[facing].x, dirs[facing].z);
      let diff = want - groom.obj.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      groom.obj.rotation.y += diff * Math.min(1, dt * 12);
      groom.c.setAnim(duck ? 'duck' : 'sit', { fade: 0.08 });

      // spawn relatives
      nextSpawn -= dt;
      if (nextSpawn <= 0 && t < duration - 3) {
        const free = ['left', 'front', 'right'].filter((k) => !occupied().has(k));
        if (free.length) {
          const k = free[(Math.random() * free.length) | 0];
          const from = offset(seat, b, (Math.random() - 0.5) * 12, 8 + Math.random() * 2).setY(0.12);
          const a = cast.add(roles[(Math.random() * roles.length) | 0], { pos: from, seed: (Math.random() * 1e5) | 0 });
          const it = { a, kind: 'haldi', slot: k, state: 'walk', timer: 0, icon: null };
          active.push(it);
          cast.walkTo(a, slot(k), { speed: 2.2, faceAfter: seat }).then(() => {
            it.state = 'wait'; it.timer = 2.6;
            it.icon = iconSprite('haldi'); it.icon.position.set(0, 2.1, 0); a.obj.add(it.icon);
          });
        }
        nextSpawn = Math.max(0.7, 1.9 - t * 0.02) + Math.random() * 0.6;
      }
      // cousin water attack
      nextWater -= dt;
      if (nextWater <= 0 && t < duration - 4) {
        const k = ['left', 'front', 'right'][(Math.random() * 3) | 0];
        const from = offset(seat, b, (k === 'left' ? -1 : k === 'right' ? 1 : 0) * 6, k === 'front' ? 7 : 2).setY(0.12);
        const a = cast.add('youngMan', { pos: from, seed: 77 + ((Math.random() * 100) | 0) });
        const bk = bucket(); bk.position.set(0, 1.0, 0.35); a.obj.add(bk);
        const it = { a, kind: 'water', slot: 'w' + Math.random(), state: 'walk', timer: 0, icon: null, dir: k };
        active.push(it);
        cast.walkTo(a, slot(k, 2.4), { speed: 3.2, faceAfter: seat }).then(() => {
          it.state = 'aim'; it.timer = 1.0;
          it.icon = iconSprite('water'); it.icon.position.set(0, 2.1, 0); a.obj.add(it.icon);
          audio.sfx('whoosh', { volume: 0.5 });
        });
        nextWater = 5 + Math.random() * 4;
      }
      // resolve interactions
      for (const it of [...active]) {
        if (it.state === 'wait') {
          it.timer -= dt;
          if (it.icon) it.icon.scale.setScalar(0.45 + 0.1 * Math.sin(t * 10));
          if (facing === it.slot && !duck) {
            it.state = 'apply'; it.timer = 0.7; it.a.obj.remove(it.icon);
            cast.anim(it.a, 'applyHaldi');
          } else if (it.timer <= 0) {
            it.state = 'leave'; it.a.obj.remove(it.icon); streak = 0;
            hud.center('Missed!', 0.6); audio.sfx('miss', { volume: 0.5 });
          }
        } else if (it.state === 'apply') {
          it.timer -= dt;
          if (it.timer <= 0) {
            it.state = 'leave'; score += 10 + streak * 2; streak++;
            haldi = Math.min(1, haldi + 0.06); groom.c.setHaldi(haldi);
            fx.haldi(offset(seat, b, 0, 0, 1.2).addScaledVector(dirs[it.slot], 0.3), 60);
            audio.sfx('haldiSplat');
            hud.center(['Mashallah!', 'Chamak gaye!', 'Waah!', 'Sona!'][(Math.random() * 4) | 0], 0.6);
          }
        } else if (it.state === 'aim') {
          it.timer -= dt;
          if (it.timer <= 0) {
            it.state = 'leave'; it.a.obj.remove(it.icon);
            const d = seat.clone().sub(it.a.obj.position).setY(0).normalize();
            fx.splash(it.a.obj.position.clone().setY(1.2), d, 140);
            audio.sfx('splash');
            if (duck) { score += 15; hud.center('Bach gaye!', 0.8); audio.sfx('success', { volume: 0.5 }); }
            else { score = Math.max(0, score - 10); streak = 0; hud.center('Bheeg gaye!', 0.8); game.rig.shake = 0.5; }
          }
        }
        if (it.state === 'leave') {
          it.state = 'gone';
          const out = offset(seat, b, (Math.random() - 0.5) * 14, 9).setY(0.12);
          cast.walkTo(it.a, out, { speed: 2.4 }).then(() => { cast.remove(it.a); active.splice(active.indexOf(it), 1); });
        }
      }
      hud.score(`Haldi ${score}`);
      if (t >= duration) {
        off();
        for (const it of active) if (it.icon) it.a.obj.remove(it.icon);
        groom.c.setHaldi(Math.max(haldi, 0.75));
        hud.hideAll(); game.setTouchButtons(null);
        resolve(score);
      }
    });
  });
}

export async function runHaldi(game) {
  const { world, story, rig, audio, hud } = game;
  const home = world.venues.home;
  world.setTime('morning');
  home.setDecor('haldi');
  const seat = home.anchors.haldiSeat.clone();
  const b = basis(home.yaw);
  game.focus.copy(seat);
  await world.ground.prime(seat, 3000);
  await story.dateCard(S.title);
  const fx = new FX(game.scene);
  const fxOff = game.onUpdate((dt) => fx.update(dt));
  const cast = new Cast(game);
  const groom = cast.add('groom', { outfit: 'haldi', pos: seat.clone().setY(0.25), yaw: home.yaw, anim: 'sit' });
  // family around the stage
  const fam = [
    cast.add('aunty', { seed: 11, pos: offset(seat, b, -3.0, 0.4, -0.46), yaw: home.yaw + Math.PI * 0.6 }),
    cast.add('aunty', { seed: 31, pos: offset(seat, b, 3.2, 1.4, -0.46), yaw: home.yaw - Math.PI * 0.6 }),
    cast.add('youngWoman', { seed: 7, pos: offset(seat, b, 3.0, -0.2, -0.46), yaw: home.yaw - Math.PI * 0.5 }),
    cast.add('elder', { seed: 4, pos: offset(seat, b, -3.4, 3.2, -0.46), yaw: home.yaw + Math.PI * 0.8 }),
    cast.add('kid', { seed: 9, pos: offset(seat, b, -2.4, 2.4, -0.46), yaw: home.yaw + Math.PI * 0.8 }),
  ];
  fam.forEach((a) => a.obj.position.setY(0.12));
  story.cutscene(true);
  audio.playMusic('haldi');
  audio.setAmbience('party');
  const camPos = offset(seat, b, 0.6, 5.2, 1.6), look = offset(seat, b, 0, 0, 0.85);
  rig.set(offset(seat, b, 4, 9, 4), look);
  await rig.moveTo({ pos: camPos, look }, story.skipping ? 0.01 : 3);
  cast.anim(fam[0], 'applyHaldi'); cast.face(fam[0], seat);
  await story.lines(S.intro);
  cast.anim(fam[0], 'clap');
  story.cutscene(false);
  await story.panel((el, close) => {
    el.innerHTML = `<h3>Haldi Rush</h3><h2>Get Yellow!</h2><p>${S.howto}</p><div class="row"><button class="btn">Bismillah</button></div>`;
    el.querySelector('.btn').onclick = () => { audio.sfx('confirm'); close(); };
  });
  // gameplay camera: a bit higher to see all three sides
  rig.set(offset(seat, b, 0, 5.8, 3.2), offset(seat, b, 0, 0.4, 0.6));
  fam.forEach((a) => cast.anim(a, 'clap'));
  const score = await haldiRush(game, { cast, groom, seat, b, fx });
  // outro + dance
  story.cutscene(true);
  hud.center(score > 250 ? 'Shandaar Haldi!' : 'Haldi Mubarak!', 2);
  fx.petalShower(offset(seat, b, 0, 0, 3), 260, 5, [0xffc21a, 0xff9a1a, 0xffffff]);
  await story.lines(S.outro);
  groom.obj.position.setY(0.12);
  cast.walkTo(groom, offset(seat, b, 0, 2.2, -0.46).setY(0.12), { speed: 1.5, arriveAnim: 'dance' });
  const dancers = fam.concat([0, 1, 2, 3].map((i) => cast.add(i % 2 ? 'youngMan' : 'youngWoman', { seed: 100 + i, pos: offset(seat, b, -3 + i * 2, 4.2).setY(0.12), yaw: home.yaw + Math.PI })));
  dancers.forEach((a, i) => cast.anim(a, ['dance', 'dance2', 'dance3', 'bhangra', 'dance'][i % 5] === 'bhangra' ? 'dance' : ['dance', 'dance2', 'dance3'][i % 3]));
  rig.orbit(offset(seat, b, 0, 2.6, 1.2), 7, 1.4, 0.35);
  for (let i = 0; i < 4; i++) { fx.haldi(offset(seat, b, (Math.random() - 0.5) * 4, 2.5 + Math.random() * 2, 1.6), 50); await story.wait(0.9); }
  await game.snapshot('Haldi · 23 March');
  await story.wait(2.5);
  // night talk with Abbu on the terrace
  await story.fade(true, 1);
  cast.clear(); fxOff(); fx.dispose();
  home.setDecor('arrival');
  world.setTime('night');
  const top = home.anchors.houseTop;
  rig.orbit(top.clone().setY(5), 24, 5, 0.04);
  audio.playMusic('story'); audio.setAmbience('night');
  await story.fade(false, 1);
  await story.caption('Late at night, on the terrace…', 'Night · 23 March', 2.6);
  await story.lines(S.night);
  await story.fade(true, 1);
  story.cutscene(false);
  void box;
}
