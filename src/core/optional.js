// Modules built in parallel (characters, horse, audio) are loaded optionally so the game always runs.
import * as THREE from 'three';

const mods = import.meta.glob(['../entities/Character.js', '../entities/Horse.js', '../audio/Audio.js']);

const noop = () => {};
const stubAudio = {
  unlock: noop, playMusic: noop, stopMusic: noop, setMusicIntensity: noop, sfx: noop, horn: noop, setAmbience: noop, ctxTime: () => performance.now() / 1000,
  engine: { start: noop, update: noop, stop: noop },
  beat: { bpm: 120, _t0: performance.now(), now() { return ((performance.now() - this._t0) / 1000) * (this.bpm / 60); }, on() { return noop; }, timeOfBeat(n) { return n * 60 / this.bpm; } },
  volume: 1, muted: false,
};

export async function loadAudio() {
  const f = mods['../audio/Audio.js'];
  if (!f) return stubAudio;
  try { return (await f()).audio || stubAudio; } catch (e) { console.warn('audio module failed', e); return stubAudio; }
}

function placeholderCharacter({ role = 'guest', outfit = '', seed = 1 } = {}) {
  const g = new THREE.Group();
  const col = role === 'groom' ? (outfit === 'haldi' ? 0xf6f0e2 : outfit === 'reception' ? 0x1b2440 : outfit === 'sherwani' ? 0xf3e7cf : 0xc2ab8a) : role === 'bride' ? 0x8e1b2e : new THREE.Color().setHSL((seed * 0.137) % 1, 0.5, 0.55).getHex();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 4, 10), new THREE.MeshLambertMaterial({ color: col }));
  body.position.y = 0.75; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshLambertMaterial({ color: 0xb98361 }));
  head.position.y = 1.58; head.castShadow = true;
  g.add(body, head);
  let t = 0, anim = 'idle';
  return {
    object3d: g, height: 1.75,
    setAnim(n) { anim = n; }, update(dt) { t += dt; body.position.y = 0.75 + (anim === 'walk' || anim.startsWith('dance') ? Math.abs(Math.sin(t * 8)) * 0.05 : 0); },
    setHaldi(v) { body.material.color.lerp(new THREE.Color(0xf2b300), v * 0.1); }, setSehra: noop, setGarland: noop, setLookAt: noop, dispose: noop,
  };
}

let charFactory = null, horseFactory = null;
export async function loadCharacters() {
  const fc = mods['../entities/Character.js'], fh = mods['../entities/Horse.js'];
  try { charFactory = fc ? (await fc()).createCharacter : null; } catch (e) { console.warn('Character module failed', e); }
  try { horseFactory = fh ? (await fh()).createHorse : null; } catch (e) { console.warn('Horse module failed', e); }
}
export function createCharacter(opts) { try { if (charFactory) return charFactory(opts); } catch (e) { console.warn(e); } return placeholderCharacter(opts); }
export function createHorse(opts) {
  try { if (horseFactory) return horseFactory(opts); } catch (e) { console.warn(e); }
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.4, 4, 10), new THREE.MeshLambertMaterial({ color: 0xf5f2ea }));
  b.rotation.x = Math.PI / 2; b.position.y = 1.3; g.add(b);
  const seat = new THREE.Object3D(); seat.position.set(0, 1.55, 0); g.add(seat);
  return { object3d: g, seat, setAnim: noop, update: noop };
}
