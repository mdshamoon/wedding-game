// Hand-built venues at the real pins: Home (Kichha), Blessing Garden (Baheri, Nikah), Grand Heritage (Kichha, Walima).
// Each venue is built in a local frame whose FRONT faces +Z (toward its road), then rotated into place.
import * as THREE from 'three';
import { box, cyl, mat, archWall, archFrame, fairyLights, sag, garland, ladis, drape, flower, bush, floralBall } from './decor.js';
import { textTexture, glowTexture } from './textures.js';
import { makeTree } from './vegetation.js';

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  return t;
}
const tileTex = (a, b, n = 4) => canvasTex(256, 256, (ctx, w) => {
  const s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = (i + j) % 2 ? a : b; ctx.fillRect(i * s, j * s, s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.05)'; for (let k = 0; k < 40; k++) ctx.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 2, 2);
  }
  ctx.strokeStyle = 'rgba(120,100,80,0.35)'; ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, w); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(w, i * s); ctx.stroke(); }
});
const grassTex = () => canvasTex(256, 256, (ctx, w) => {
  ctx.fillStyle = '#4f7a2e'; ctx.fillRect(0, 0, w, w);
  for (let i = 0; i < 9000; i++) { ctx.fillStyle = `hsl(${85 + Math.random() * 25},${40 + Math.random() * 20}%,${22 + Math.random() * 22}%)`; ctx.fillRect(Math.random() * w, Math.random() * w, 1.5, 3); }
});

function plane(w, d, material, x = 0, y = 0.02, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), material);
  m.position.set(x, y, z); m.receiveShadow = true; if (parent) parent.add(m); return m;
}

// Face the venue toward its nearest real road. If the pin is far from the road, the venue stays at the pin
// and a driveway is built from the road to its gate (added to the road network for driving/minimap).
function orientToRoad(world, place, setback, prefer = ['path', 'track']) {
  const q = world.net.nearest(place.x, place.z, 800, prefer) || world.net.nearest(place.x, place.z, 800, ['path']);
  let fx = 0, fz = 1, origin = place.clone(), access = null;
  if (q) {
    fx = q.qx - place.x; fz = q.qz - place.z;
    const L = Math.hypot(fx, fz) || 1; fx /= L; fz /= L;
    const hw = q.road.w / 2;
    const roadPt = new THREE.Vector3(q.qx, 0, q.qz);
    if (q.edge < 22 + setback) {
      origin = new THREE.Vector3(q.qx - fx * (hw + 1.5 + setback), 0, q.qz - fz * (hw + 1.5 + setback));
    } else {
      // driveway from the road to the gate
      const n = Math.max(2, Math.ceil(q.dist / 20));
      access = [];
      for (let i = 0; i <= n; i++) access.push(roadPt.clone().lerp(place, i / n));
      const flat = []; access.forEach((p) => flat.push(+p.x.toFixed(1), +p.z.toFixed(1)));
      world.net.addRoad({ t: 'service', n: 'Driveway', w: 6, o: 0, s: '', p: flat });
      world.extraRoads = (world.extraRoads || []).concat([{ w: 6, pts: access }]);
    }
    return { origin, yaw: Math.atan2(fx, fz), roadPoint: roadPt, access, roadDir: new THREE.Vector3(q.dirx, 0, q.dirz) };
  }
  return { origin, yaw: 0, roadPoint: null, access };
}

function drivewayMesh(pts, w) {
  const pos = [], uv = [], idx = [];
  let d = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
    if (i) d += pts[i].distanceTo(pts[i - 1]);
    pos.push(pts[i].x + nx * w / 2, 0.09, pts[i].z + nz * w / 2, pts[i].x - nx * w / 2, 0.09, pts[i].z - nz * w / 2);
    uv.push(0, d / 8, 1, d / 8);
    if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

function anchorize(group, locals) {
  const out = {};
  group.updateMatrixWorld(true);
  for (const [k, v] of Object.entries(locals)) out[k] = v.clone().applyMatrix4(group.matrixWorld);
  return out;
}

// ------------------------------------------------------------------ HOME
function buildHome(world) {
  const O = orientToRoad(world, world.places.home, 15); const { origin, yaw } = O;
  const g = new THREE.Group(); g.position.copy(origin); g.rotation.y = yaw; g.name = 'home';
  const W = 24, D = 30;
  const cream = mat(0xf3ead8), capC = mat(0xd9ccb2), white = mat(0xfaf6ee), wood = mat(0x8a5a3a), glass = mat(0x1d2a33, { standard: true, roughness: 0.15, metalness: 0.6 });
  const gold = mat(0xc9a24a, { standard: true, roughness: 0.35, metalness: 0.8 });
  // courtyard floor + garden strips
  plane(W, D, new THREE.MeshLambertMaterial({ map: tileTex('#e9e1d2', '#ddd3c1', 4) }), 0, 0.12, 0, g).material.map.repeat.set(W / 2.4, D / 2.4);
  plane(W - 1, 2, new THREE.MeshLambertMaterial({ map: grassTex() }), 0, 0.14, D / 2 - 1.6, g);
  // boundary wall with gate opening at front
  const wh = 1.8, wt = 0.25;
  box(W, wh, wt, cream, 0, 0, -D / 2, g); // back
  box(wt, wh, D, cream, -W / 2, 0, 0, g); box(wt, wh, D, cream, W / 2, 0, 0, g);
  const gw = 5;
  box((W - gw) / 2, wh, wt, cream, -(W + gw) / 4, 0, D / 2, g); box((W - gw) / 2, wh, wt, cream, (W + gw) / 4, 0, D / 2, g);
  for (const s of [-1, 1]) {
    box(0.7, 2.7, 0.7, white, s * (gw / 2 + 0.35), 0, D / 2, g);
    box(0.85, 0.15, 0.85, capC, s * (gw / 2 + 0.35), 2.7, D / 2, g);
    const lamp = cyl(0.18, 0.18, 0.4, mat(0xfff2c8, { emissive: 0xffd27a, emissiveIntensity: 0.6 }), s * (gw / 2 + 0.35), 2.85, D / 2, g);
    lamp.castShadow = false;
    // gate leaves swung open inward
    const leaf = new THREE.Group(); leaf.position.set(s * gw / 2, 0, D / 2); leaf.rotation.y = s * -1.2; g.add(leaf);
    for (let i = 0; i < 9; i++) box(0.05, 1.9, 0.05, mat(0x1a1a1a), -s * (0.2 + i * 0.27), 0.1, 0, leaf);
    box(2.5, 0.08, 0.06, mat(0x1a1a1a), -s * 1.25, 1.9, 0, leaf); box(2.5, 0.08, 0.06, mat(0x1a1a1a), -s * 1.25, 0.3, 0, leaf);
  }
  // wall caps
  box(W + 0.1, 0.1, wt + 0.12, capC, 0, wh, -D / 2, g);
  // house (back of plot): two storeys, modern with an ogee-arch porch
  const hw = 16, hd = 11, fh = 3.4, hz = -D / 2 + 1 + hd / 2;
  const house = new THREE.Group(); house.position.set(0, 0, hz); g.add(house);
  box(hw, 0.5, hd, capC, 0, 0, 0, house);                     // plinth
  box(hw, fh * 2, hd, cream, 0, 0.5, 0, house);               // main mass
  box(hw + 0.3, 0.25, hd + 0.3, white, 0, 0.5 + fh, 0, house);  // floor band
  box(hw + 0.2, 1.0, hd + 0.2, white, 0, 0.5 + fh * 2, 0, house); // parapet
  box(5.5, fh * 2 + 1.6, 0.4, wood, 4.6, 0.5, hd / 2 + 0.1, house); // wood cladding feature
  // windows (front)
  for (const [x, y, w, h] of [[-5.2, 1.4, 2.6, 1.8], [-1.2, 1.4, 1.6, 1.8], [-5.2, fh + 1.2, 2.6, 1.8], [-1.2, fh + 1.2, 1.6, 1.8], [4.6, fh + 1.0, 3.2, 2.2], [4.6, 1.2, 3.2, 2.0]]) {
    box(w + 0.2, h + 0.2, 0.12, white, x, y - 0.1, hd / 2 + (x > 3 ? 0.32 : 0.04), house);
    box(w, h, 0.1, glass, x, y, hd / 2 + (x > 3 ? 0.36 : 0.08), house);
  }
  // porch with ogee arch
  const porch = archWall(4.2, 3.6, 2.4, 1.9, 3.1, 0.35, white); porch.position.set(-3, 0.5, hd / 2 + 1.4); house.add(porch);
  box(4.4, 0.25, 1.9, white, -3, 0.5 + 3.6, hd / 2 + 0.6, house);
  box(1.4, 2.4, 0.08, wood, -3, 0.5, hd / 2 + 0.06, house); // door
  // balcony glass rail
  box(6, 0.9, 0.05, mat(0xbfd6e0, { transparent: true, opacity: 0.35 }), -3.2, fh + 0.75, hd / 2 + 1.1, house).castShadow = false;
  box(6.2, 0.2, 1.5, white, -3.2, fh + 0.5, hd / 2 + 0.75, house);
  // roof water tank
  cyl(0.7, 0.7, 1.3, mat(0x1c1c1e), 5.5, 0.5 + fh * 2, -2, house, 12);
  // plants
  for (const [x, z] of [[-10.5, 12], [10.5, 12], [-10.5, -2], [10.5, -2], [-10.5, 5], [10.5, 5]]) { const b = bush(0.7); b.position.set(x, 0.5, z); g.add(b); }
  const tree = makeTree(1, 0.9); tree.position.set(9.5, 0, 9.5); g.add(tree);
  // wedding fairy lights: curtains down the house front + along the walls
  const lines = [];
  const front = hz + hd / 2 + 0.15, top = 0.5 + fh * 2 + 1.0;
  for (let x = -hw / 2; x <= hw / 2; x += 0.45) lines.push([new THREE.Vector3(x, top, front), new THREE.Vector3(x, 0.8 + Math.random() * 0.6, front)]);
  for (let z = -hd / 2; z <= hd / 2; z += 0.6) for (const s of [-1, 1]) lines.push([new THREE.Vector3(s * (hw / 2 + 0.15), top, hz + z), new THREE.Vector3(s * (hw / 2 + 0.15), 1.0, hz + z)]);
  lines.push([new THREE.Vector3(-W / 2, wh + 0.15, D / 2), new THREE.Vector3(-gw / 2, wh + 0.15, D / 2)], [new THREE.Vector3(gw / 2, wh + 0.15, D / 2), new THREE.Vector3(W / 2, wh + 0.15, D / 2)]);
  lines.push([new THREE.Vector3(-W / 2, wh + 0.15, D / 2), new THREE.Vector3(-W / 2, wh + 0.15, -D / 2)], [new THREE.Vector3(W / 2, wh + 0.15, D / 2), new THREE.Vector3(W / 2, wh + 0.15, -D / 2)]);
  lines.push(sag(new THREE.Vector3(-gw / 2 - 0.35, 2.85, D / 2), new THREE.Vector3(gw / 2 + 0.35, 2.85, D / 2), 0.5));
  const lights = fairyLights(lines, 0.32, 0xffd27a, 0.28);
  g.add(lights);
  // gate garland (always: it's a wedding house)
  g.add(garland(sag(new THREE.Vector3(-gw / 2 - 0.35, 2.75, D / 2 + 0.3), new THREE.Vector3(gw / 2 + 0.35, 2.75, D / 2 + 0.3), 0.55, 16), [0xff9a1a, 0xffc21a, 0xffffff], 0.08, 1.1));

  // ---------- Haldi decor (inspired by the reference: yellow drapes, sunflowers, white tassels, marigolds)
  const haldi = new THREE.Group(); haldi.visible = false; g.add(haldi);
  const hzS = hz + hd / 2 + 3.2; // stage area in front of the house
  const yellow = 0xffc21a;
  // floral carpet
  plane(8, 6, new THREE.MeshLambertMaterial({ map: canvasTex(512, 512, (ctx, w) => {
    ctx.fillStyle = '#fbf6e6'; ctx.fillRect(0, 0, w, w);
    // fine floral motif grid (marigold rosettes) with a gold border
    for (let y = 40; y < w - 30; y += 36) for (let x = 40 + ((y / 36) % 2) * 18; x < w - 30; x += 36) {
      ctx.fillStyle = '#f2c230'; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4, 2.4, a, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#e08a00'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = '#d4a21a'; ctx.lineWidth = 12; ctx.strokeRect(14, 14, w - 28, w - 28);
    ctx.strokeStyle = '#7cb342'; ctx.lineWidth = 3; ctx.strokeRect(30, 30, w - 60, w - 60);
  }) }), 0, 0.16, hzS + 1.5, haldi).material.map.repeat.set(1, 1);
  // backdrop frame
  const bw = 7, bh = 4.2, bz = hzS - 1.2;
  for (const s of [-1, 1]) {
    box(0.18, bh, 0.18, mat(0xf2e7c9), s * bw / 2, 0, bz, haldi);
    const cur = drape(1.6, bh - 0.1, yellow, { amp: 0.12, freq: 5 }); cur.position.set(s * (bw / 2 - 0.7), bh, bz + 0.3); haldi.add(cur);
  }
  box(bw + 0.4, 0.22, 0.25, mat(0xf2e7c9), 0, bh, bz, haldi);
  const back = drape(bw - 2.6, bh - 0.3, 0xfff1c2, { amp: 0.03 }); back.position.set(0, bh, bz - 0.1); haldi.add(back);
  // greenery wall with sunflowers
  for (let i = 0; i < 26; i++) { const b = bush(0.45, 0x3f6a2b); b.position.set((Math.random() - 0.5) * (bw - 2.4), 0.2 + Math.random() * 1.9, bz + 0.05); haldi.add(b); }
  for (let i = 0; i < 30; i++) { const f = flower(0xffc400, 0x5a3a10, 0.14 + Math.random() * 0.06); f.position.set((Math.random() - 0.5) * (bw - 2.2), 0.4 + Math.random() * 2.0, bz + 0.45); haldi.add(f); }
  // marigold swag + white tassels
  haldi.add(garland(sag(new THREE.Vector3(-bw / 2, bh + 0.1, bz + 0.2), new THREE.Vector3(bw / 2, bh + 0.1, bz + 0.2), 0.25, 20), [0xffc21a, 0x7cb342, 0xff9a1a], 0.09, 1.4));
  ladis(-bw / 2 + 1.6, bw / 2 - 1.6, bh - 0.05, bz + 0.3, 11, 1.4, [0xffffff, 0xfff8e8], haldi);
  // low seat (chowki) with yellow cushion + brass urlis
  box(1.4, 0.42, 0.9, mat(0xc9a24a), 0, 0.16, hzS + 0.4, haldi);
  box(1.3, 0.12, 0.8, mat(yellow), 0, 0.58, hzS + 0.4, haldi);
  for (const s of [-1, 1]) {
    const u = cyl(0.45, 0.25, 0.22, mat(0xb8862b, { standard: true, metalness: 0.8, roughness: 0.3 }), s * 2.3, 0.16, hzS + 1.6, haldi);
    for (let i = 0; i < 8; i++) { const f = flower(i % 2 ? 0xffc21a : 0xff9a1a, 0xffe08a, 0.08); f.rotation.x = -Math.PI / 2; f.position.set(s * 2.3 + (Math.random() - 0.5) * 0.5, 0.4, hzS + 1.6 + (Math.random() - 0.5) * 0.5); haldi.add(f); }
    void u;
    const pot = cyl(0.3, 0.22, 0.6, mat(0xd8c8a8), s * 3.6, 0.16, hzS + 0.2, haldi); void pot;
    const pb = bush(0.55, 0x4a7a32); pb.position.set(s * 3.6, 1.1, hzS + 0.2); haldi.add(pb);
  }
  // overhead marigold strings across the courtyard
  for (let i = 0; i < 4; i++) {
    const z = hzS - 0.5 + i * 2.2;
    haldi.add(garland(sag(new THREE.Vector3(-W / 2 + 0.3, 4.2, z), new THREE.Vector3(W / 2 - 0.3, 4.2, z), 0.6, 24), [0xffc21a, 0xff9a1a], 0.07, 0.9));
  }
  // haldi bowl
  const bowl = cyl(0.18, 0.12, 0.1, mat(0xb8862b, { standard: true, metalness: 0.8, roughness: 0.3 }), 0.9, 0.16, hzS + 1.2, haldi);
  cyl(0.16, 0.16, 0.02, mat(0xf2b300), 0.9, 0.25, hzS + 1.2, haldi); void bowl;

  const nightLights = [];
  for (const [x, y, z, i, d] of [[0, 3.2, D / 2 + 1.5, 30, 18], [0, 4, hz + hd / 2 + 4, 45, 22], [-4, 3, 4, 20, 14]]) {
    const L = new THREE.PointLight(0xffc98a, i, d, 1.3); L.position.set(x, y, z); L.visible = false; g.add(L); nightLights.push(L);
  }
  g.updateMatrixWorld(true);
  const anchors = anchorize(g, {
    gate: new THREE.Vector3(0, 0, D / 2), outside: new THREE.Vector3(0, 0, D / 2 + 9), carPark: new THREE.Vector3(-5, 0, 7),
    courtyard: new THREE.Vector3(0, 0, 6), door: new THREE.Vector3(-3, 0, hz + hd / 2 + 2.2), haldiSeat: new THREE.Vector3(0, 0.58, hzS + 0.4),
    haldiFront: new THREE.Vector3(0, 0, hzS + 4), houseTop: new THREE.Vector3(0, 8, hz),
  });
  world.colliders.add(origin.x + Math.sin(yaw) * hz, origin.z + Math.cos(yaw) * hz, hw, hd, -yaw);
  return { group: g, anchors, yaw, lights, nightLights, access: O.access, roadDir: O.roadDir, roadPoint: O.roadPoint, decor: { haldi }, setDecor(name) { haldi.visible = name === 'haldi'; } };
}

// ------------------------------------------------------------------ BLESSING GARDEN (Nikah)
function buildNikahVenue(world) {
  const O = orientToRoad(world, world.places.baraat, 0.5); const { origin, yaw } = O;
  const g = new THREE.Group(); g.position.copy(origin); g.rotation.y = yaw; g.name = 'blessing-garden';
  const W = 52, D = 62;
  const ivory = mat(0xf7f0e1), goldM = mat(0xc9a24a, { standard: true, metalness: 0.75, roughness: 0.35 }), blush = mat(0xe9b8b5);
  const lawnT = grassTex(); lawnT.repeat.set(W / 4, D / 4);
  plane(W, D, new THREE.MeshLambertMaterial({ map: lawnT }), 0, 0.12, -D / 2, g);
  // boundary walls
  const wallM = mat(0xf2ead8);
  box(W, 2.4, 0.3, wallM, 0, 0, -D, g); box(0.3, 2.4, D, wallM, -W / 2, 0, -D / 2, g); box(0.3, 2.4, D, wallM, W / 2, 0, -D / 2, g);
  box(W / 2 - 4, 2.4, 0.3, wallM, -(W / 4 + 2), 0, 0, g); box(W / 2 - 4, 2.4, 0.3, wallM, W / 4 + 2, 0, 0, g);
  // grand entrance: ivory + gold ogee arch with blush florals
  const gate = archFrame(6.2, 3.8, 6.4, 0.9, 1.2, ivory); gate.position.set(0, 0, 0); g.add(gate);
  const trim = archFrame(6.0, 3.8, 6.25, 0.12, 1.25, goldM); g.add(trim);
  for (const s of [-1, 1]) { box(1.6, 7.2, 1.6, ivory, s * 4.3, 0, 0, g); cyl(0.9, 0.9, 0.3, goldM, s * 4.3, 7.2, 0, g); const d = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), ivory); d.position.set(s * 4.3, 7.5, 0); g.add(d); cyl(0.04, 0.08, 0.7, goldM, s * 4.3, 8.2, 0, g); }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), new THREE.MeshBasicMaterial({ map: textTexture('Shamoon & Alina', { w: 1024, h: 288, font: '150px "Great Vibes", cursive', color: '#9a7620', bg: '#f7f0e1' }) }));
  plate.position.set(0, 7.15, 0.62); g.add(plate);
  g.add(garland(sag(new THREE.Vector3(-3.4, 6.3, 0.75), new THREE.Vector3(3.4, 6.3, 0.75), 1.2, 30), [0xe9b8b5, 0xffffff, 0xf4a7b0], 0.08, 1.4));
  for (const s of [-1, 1]) g.add(garland([new THREE.Vector3(s * 3.3, 4.5, 0.75), new THREE.Vector3(s * 3.3, 0.3, 0.75)], [0xffffff, 0xe9b8b5], 0.08, 1.4));
  // aisle runner with flower-lined edges and lanterns
  plane(3, 40, new THREE.MeshLambertMaterial({ color: 0xf1d9d2 }), 0, 0.16, -22, g);
  for (let z = -4; z > -40; z -= 4) for (const s of [-1, 1]) {
    cyl(0.12, 0.16, 1.2, goldM, s * 2.2, 0.12, z, g, 8);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe2a8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 })); sp.scale.setScalar(0.8); sp.position.set(s * 2.2, 1.45, z); g.add(sp);
    const fl = floralBall(0.35, [0xffffff, 0xf6c9cf, 0xe9b8b5]); fl.position.set(s * 1.7, 0.4, z); g.add(fl);
  }
  // guest chairs
  const chairM = mat(0xf7f0e1), chairCushion = mat(0xe9b8b5);
  for (let row = 0; row < 7; row++) for (let c = 0; c < 6; c++) for (const s of [-1, 1]) {
    const x = s * (3.6 + c * 1.0), z = -18 - row * 1.6;
    box(0.5, 0.45, 0.5, chairM, x, 0.12, z, g, false); box(0.48, 0.06, 0.48, chairCushion, x, 0.57, z, g, false); box(0.5, 0.55, 0.06, chairM, x, 0.57, z - 0.24, g, false);
  }
  // stage + nikah setup with three ogee arches behind
  const sz = -48;
  box(16, 0.7, 8, ivory, 0, 0.1, sz, g);
  plane(15.6, 7.6, new THREE.MeshLambertMaterial({ color: 0xf6efe0 }), 0, 0.81, sz, g);
  for (const [x, s] of [[-5.2, 0.85], [0, 1], [5.2, 0.85]]) {
    const a = archFrame(3.6 * s, 3.0 * s, 5.4 * s, 0.35, 0.4, ivory); a.position.set(x, 0.8, sz - 3.6); g.add(a);
    const t = archFrame(3.5 * s, 3.0 * s, 5.3 * s, 0.06, 0.45, goldM); t.position.set(x, 0.8, sz - 3.6); g.add(t);
    const sheer = drape(3.4 * s, 4.6 * s, 0xfff8ee, { opacity: 0.55, amp: 0.05 }); sheer.position.set(x, 0.8 + 4.8 * s, sz - 3.75); g.add(sheer);
    g.add(garland(sag(new THREE.Vector3(x - 1.8 * s, 0.8 + 3.0 * s, sz - 3.3), new THREE.Vector3(x + 1.8 * s, 0.8 + 3.0 * s, sz - 3.3), 0.5 * s, 16), [0xffffff, 0xe9b8b5, 0xf6d4d8], 0.08, 1.2));
  }
  // divans for groom and bride, with a sheer floral parda between them
  for (const s of [-1, 1]) {
    box(2.6, 0.45, 1.1, goldM, s * 2.6, 0.8, sz - 1.2, g);
    box(2.5, 0.2, 1.0, mat(s < 0 ? 0xf7f0e1 : 0xe9b8b5), s * 2.6, 1.25, sz - 1.2, g);
    box(2.6, 0.9, 0.2, goldM, s * 2.6, 1.25, sz - 1.7, g);
  }
  ladis(-0.5, 0.5, 4.2, sz - 1.0, 6, 3.3, [0xffffff, 0xfff0f3, 0xe9b8b5], g);
  box(1.6, 0.06, 0.06, goldM, 0, 4.2, sz - 1.0, g);
  // qazi's low table
  box(1.2, 0.4, 0.6, mat(0x6b4a2e), 0, 0.8, sz + 1.2, g);
  box(0.4, 0.04, 0.3, mat(0x7a1f2b), 0, 1.2, sz + 1.2, g);
  // canopy (shamiana) with fairy lights
  const canopy = drape(18, 0.01, 0xfffaf0, { amp: 0.0 }); canopy.rotation.x = Math.PI / 2; canopy.scale.set(1, 1, 1); void canopy;
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(18, 12, 18, 6).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xfff6e6, side: THREE.DoubleSide }));
  { const p = roof.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, -Math.cos(p.getX(i) * 0.9) * 0.15 - Math.abs(p.getZ(i)) * 0.05); roof.geometry.computeVertexNormals(); }
  roof.position.set(0, 7.2, sz + 0.5); roof.receiveShadow = true; g.add(roof);
  for (const [x, z] of [[-8.6, sz - 5], [8.6, sz - 5], [-8.6, sz + 5.8], [8.6, sz + 5.8]]) { cyl(0.18, 0.18, 7.2, goldM, x, 0, z, g, 10); g.add(garland([new THREE.Vector3(x, 7, z + 0.2), new THREE.Vector3(x, 0.3, z + 0.2)], [0xffffff, 0xe9b8b5], 0.08, 1.2)); }
  const fl = [];
  for (let i = 0; i < 14; i++) fl.push(sag(new THREE.Vector3(-8.6, 7.0, sz - 5 + i * 0.8), new THREE.Vector3(8.6, 7.0, sz - 5 + i * 0.8), 0.4));
  const lights = fairyLights(fl, 0.4, 0xfff0c8, 0.22);
  g.add(lights);
  // trees in the garden corners
  for (const [x, z] of [[-22, -8], [22, -8], [-22, -30], [22, -30], [-22, -52], [22, -52]]) { const t = makeTree(1, 1.1); t.position.set(x, 0, z); g.add(t); }
  const anchors = anchorize(g, {
    outside: new THREE.Vector3(0, 0, 10), gate: new THREE.Vector3(0, 0, 0), aisle: new THREE.Vector3(0, 0, -6), aisleEnd: new THREE.Vector3(0, 0, -42),
    groomSeat: new THREE.Vector3(-2.6, 1.35, sz - 1.0), brideSeat: new THREE.Vector3(2.6, 1.35, sz - 1.0), qazi: new THREE.Vector3(0, 0.8, sz + 1.8),
    stageFront: new THREE.Vector3(0, 0.8, sz + 3), guests: new THREE.Vector3(0, 0, -22), procStart: new THREE.Vector3(0, 0, 70),
  });
  // walls as colliders
  const add = (lx, lz, w, d) => { const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld); world.colliders.add(p.x, p.z, w, d, -yaw); };
  add(0, -D, W, 0.4); add(-W / 2, -D / 2, 0.4, D); add(W / 2, -D / 2, 0.4, D); add(-(W / 4 + 2), 0, W / 2 - 4, 0.4); add(W / 4 + 2, 0, W / 2 - 4, 0.4);
  add(-4.3, 0, 1.6, 1.6); add(4.3, 0, 1.6, 1.6);
  return { group: g, anchors, yaw, lights, access: O.access, roadDir: O.roadDir, roadPoint: O.roadPoint };
}

// ------------------------------------------------------------------ GRAND HERITAGE (Walima)
function buildWalimaVenue(world) {
  const O = orientToRoad(world, world.places.reception, 1); const { origin, yaw } = O;
  const g = new THREE.Group(); g.position.copy(origin); g.rotation.y = yaw; g.name = 'grand-heritage';
  const sand = mat(0xe8d3ad), ivory = mat(0xf7f0e1), goldM = mat(0xc9a24a, { standard: true, metalness: 0.75, roughness: 0.35 });
  const glow = mat(0xffe3b0, { emissive: 0xffb860, emissiveIntensity: 0.0 });
  const W = 60, D = 70;
  const lawnT = grassTex(); lawnT.repeat.set(W / 4, D / 4);
  plane(W, D, new THREE.MeshLambertMaterial({ map: lawnT }), 0, 0.12, -D / 2, g);
  // front wall + gate pavilion
  box(W / 2 - 5, 2.2, 0.4, sand, -(W / 4 + 2.5), 0, 0, g); box(W / 2 - 5, 2.2, 0.4, sand, W / 4 + 2.5, 0, 0, g);
  box(0.4, 2.2, D, sand, -W / 2, 0, -D / 2, g); box(0.4, 2.2, D, sand, W / 2, 0, -D / 2, g);
  const gate = archWall(10, 7.5, 5, 3.6, 6.2, 1.4, sand); g.add(gate);
  const gtrim = archFrame(5, 3.6, 6.2, 0.15, 1.5, goldM); g.add(gtrim);
  for (const s of [-1, 1]) chhatri(g, s * 4.4, 7.5, 0, 1.2, sand, goldM);
  // heritage building at the back: arcade of ogee arches, two storeys, chhatris
  const bz = -D + 8;
  const bld = new THREE.Group(); bld.position.set(0, 0, bz); g.add(bld);
  box(44, 0.8, 12, sand, 0, 0, 0, bld);
  for (let i = -5; i <= 5; i++) {
    const a = archWall(4, 4.6, 2.6, 2.4, 3.9, 0.8, sand); a.position.set(i * 4, 0.8, 6); bld.add(a);
    const b = archWall(4, 4.0, 2.2, 2.0, 3.3, 0.6, sand); b.position.set(i * 4, 5.6, 6); bld.add(b);
    const back = box(3.0, 3.8, 0.2, glow, i * 4, 0.8, 5.0, bld); back.castShadow = false;
    const back2 = box(2.6, 3.2, 0.2, glow, i * 4, 5.6, 5.2, bld); back2.castShadow = false;
  }
  box(44, 9.6, 10, sand, 0, 0.8, -0.6, bld);
  box(45, 0.4, 13, ivory, 0, 5.4, 0, bld); box(45, 0.9, 13, ivory, 0, 9.6, 0, bld);
  for (const x of [-21, -7, 7, 21]) chhatri(bld, x, 10.5, 4.5, 1.6, sand, goldM);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), ivory); dome.scale.y = 1.25; dome.position.set(0, 10.5, 0); dome.castShadow = true; bld.add(dome);
  cyl(0.08, 0.2, 2, goldM, 0, 14.4, 0, bld);
  // stage with S&A monogram backdrop
  const sz = -22;
  box(14, 0.8, 7, ivory, 0, 0.1, sz, g);
  const bd = archFrame(7, 3.6, 6.6, 0.5, 0.4, ivory); bd.position.set(0, 0.9, sz - 3.2); g.add(bd);
  const bdt = archFrame(6.9, 3.6, 6.5, 0.08, 0.45, goldM); bdt.position.set(0, 0.9, sz - 3.2); g.add(bdt);
  const mono = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshBasicMaterial({ map: textTexture('S&A', { w: 512, h: 512, font: '260px "Great Vibes", cursive', color: '#9a7620', bg: '#f7f0e1' }) }));
  mono.position.set(0, 4.4, sz - 3.35); g.add(mono);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.06, 8, 64), goldM); ring.position.copy(mono.position); g.add(ring);
  const sheer = drape(6.4, 5.8, 0xfff4ea, { opacity: 0.6, amp: 0.06 }); sheer.position.set(0, 6.6, sz - 3.5); g.add(sheer);
  // couple sofa
  box(3.2, 0.5, 1.1, goldM, 0, 0.9, sz - 1.4, g); box(3.1, 0.2, 1.0, mat(0xf7f0e1), 0, 1.4, sz - 1.4, g); box(3.2, 1.0, 0.25, goldM, 0, 1.4, sz - 1.9, g);
  for (const s of [-1, 1]) { const fb = floralBall(0.75, [0xffffff, 0xf6d4d8, 0xe9b8b5, 0xd94a64]); fb.position.set(s * 2.5, 1.55, sz - 1.8); g.add(fb); const fb2 = floralBall(0.55, [0xffffff, 0xfff3f0, 0xf6d4d8]); fb2.position.set(s * 3.4, 1.3, sz - 1.4); g.add(fb2); }
  // round tables
  const cloth = mat(0xf7f0e1), runner = mat(0xc9a24a);
  for (let r = 0; r < 3; r++) for (let c = -3; c <= 3; c++) {
    if (Math.abs(c) < 1) continue;
    const x = c * 6, z = -8 - r * 6 + (c % 2) * 1.5;
    cyl(0.9, 0.95, 0.76, cloth, x, 0.12, z, g, 20); cyl(0.92, 0.92, 0.02, runner, x, 0.88, z, g, 20);
    cyl(0.06, 0.08, 0.5, goldM, x, 0.9, z, g, 8); const c2 = floralBall(0.24, [0xffffff, 0xf6d4d8]); c2.position.set(x, 1.5, z); g.add(c2);
  }
  // fairy-light canopy radiating from a central pole
  cyl(0.12, 0.15, 9, goldM, 0, 0, -12, g, 10);
  const lines = [];
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; lines.push(sag(new THREE.Vector3(0, 9, -12), new THREE.Vector3(Math.cos(a) * 26, 3.2, -12 + Math.sin(a) * 18), 1.2, 16)); }
  for (let x = -21; x <= 21; x += 0.5) lines.push([new THREE.Vector3(x, 10.2, bz + 6.6), new THREE.Vector3(x, 1.2, bz + 6.6)]);
  const lights = fairyLights(lines, 0.42, 0xffe2a0, 0.26);
  g.add(lights);
  const nightLights = [];
  for (const [x, y, z, i, d] of [[0, 6, sz + 4, 90, 26], [0, 7, -10, 70, 34], [-14, 6, -14, 40, 24], [14, 6, -14, 40, 24], [0, 5, 3, 45, 20], [0, 5, -4, 35, 18], [0, 8, bz + 9, 60, 40]]) {
    const L = new THREE.PointLight(0xffc98a, i, d, 1.3); L.position.set(x, y, z); L.visible = false; g.add(L); nightLights.push(L);
  }
  const anchors = anchorize(g, {
    outside: new THREE.Vector3(0, 0, 10), gate: new THREE.Vector3(0, 0, 0), carDrop: new THREE.Vector3(0, 0, 8), lawn: new THREE.Vector3(0, 0, -10),
    stage: new THREE.Vector3(0, 0.9, sz), sofa: new THREE.Vector3(0, 1.4, sz - 1.3), stageFront: new THREE.Vector3(0, 0.9, sz + 2.2), queue: new THREE.Vector3(0, 0, sz + 7),
  });
  const add = (lx, lz, w, d) => { const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld); world.colliders.add(p.x, p.z, w, d, -yaw); };
  add(-(W / 4 + 2.5), 0, W / 2 - 5, 0.5); add(W / 4 + 2.5, 0, W / 2 - 5, 0.5); add(-W / 2, -D / 2, 0.5, D); add(W / 2, -D / 2, 0.5, D);
  add(-3.8, 0, 2.4, 1.6); add(3.8, 0, 2.4, 1.6); add(0, bz - 0.6, 44, 11);
  return { group: g, anchors, yaw, lights, nightLights, glowMat: glow, access: O.access, roadDir: O.roadDir, roadPoint: O.roadPoint };
}

function chhatri(parent, x, y, z, r, stone, gold) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cyl(0.08 * r, 0.1 * r, 1.4 * r, stone, a * 0.6 * r, 0, b * 0.6 * r, g, 8);
  box(1.6 * r, 0.15 * r, 1.6 * r, stone, 0, 1.4 * r, 0, g);
  const d = new THREE.Mesh(new THREE.SphereGeometry(0.75 * r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), stone); d.position.y = 1.55 * r; d.scale.y = 1.2; d.castShadow = true; g.add(d);
  cyl(0.02 * r, 0.06 * r, 0.5 * r, gold, 0, 2.4 * r, 0, g, 6);
  return g;
}

export function buildVenues(world) {
  const group = new THREE.Group(); group.name = 'venues';
  const home = buildHome(world), nikah = buildNikahVenue(world), walima = buildWalimaVenue(world);
  group.add(home.group, nikah.group, walima.group);
  for (const r of world.extraRoads || []) {
    const m = new THREE.Mesh(drivewayMesh(r.pts, r.w), world.roads.mats.street);
    m.renderOrder = 3; m.receiveShadow = true; group.add(m);
  }
  const allLights = [home.lights, nikah.lights, walima.lights];
  let night = false, t = 0;
  return {
    group, home, nikah, walima,
    setNight(on) { night = on; walima.glowMat.emissiveIntensity = on ? 1.2 : 0; for (const L of [...walima.nightLights, ...home.nightLights]) L.visible = on; },
    update(dt) {
      t += dt;
      for (const l of allLights) { l.visible = night; l.material.opacity = 0.8 + Math.sin(t * 3 + l.id) * 0.15; }
    },
  };
}
