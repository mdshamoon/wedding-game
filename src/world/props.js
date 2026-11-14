import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHUNK } from './roads.js';
import { glowTexture } from './textures.js';

const POLE_ROADS = new Set(['trunk', 'primary', 'secondary', 'tertiary']);

function poleGeometry() {
  const pole = new THREE.CylinderGeometry(0.09, 0.14, 8.5, 6); pole.translate(0, 4.25, 0);
  const arm = new THREE.BoxGeometry(1.6, 0.1, 0.1); arm.translate(0, 7.9, 0); // across the road
  const ins = [-0.7, 0, 0.7].map((x) => { const g = new THREE.CylinderGeometry(0.04, 0.05, 0.18, 5); g.translate(x, 8.04, 0); return g; });
  const lampArm = new THREE.BoxGeometry(1.5, 0.08, 0.08); lampArm.translate(0.75, 7.0, 0);
  const lampHead = new THREE.BoxGeometry(0.5, 0.12, 0.3); lampHead.translate(1.45, 6.95, 0);
  const arm2 = new THREE.BoxGeometry(0.1, 0.1, 1.6); arm2.translate(0, 7.9, 0); void arm2;
  return mergeGeometries([pole, arm, ...ins, lampArm, lampHead].map((g) => { g.deleteAttribute('uv'); return g; }));
}

export function buildProps(net, colliders) {
  const group = new THREE.Group(); group.name = 'props';
  const poleGeo = poleGeometry();
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x9a968c });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.75 });
  const bulbMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc07a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const byChunk = new Map();
  const add = (x, z, ang) => {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let a = byChunk.get(k); if (!a) byChunk.set(k, (a = { poles: [], wires: [] })); a.poles.push([x, z, ang]); return a;
  };
  for (const r of net.roads) {
    if (!POLE_ROADS.has(r.t)) continue;
    const p = r.p, hw = r.w / 2;
    let carry = 0, prev = null;
    const spacing = r.t === 'tertiary' ? 42 : 36;
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      let t = spacing - carry;
      while (t < L) {
        let x = ax + ux * t + nx * (hw + 2.2), z = az + uz * t + nz * (hw + 2.2);
        if (colliders.resolve(x, z, 0.5).hit) { x = ax + ux * t + nx * (hw + 0.9); z = az + uz * t + nz * (hw + 0.9); } // tight street: pole at the kerb
        const q = net.query(x, z);
        if (q && q.edge > 0.5 && !colliders.resolve(x, z, 0.4).hit) {
          const ang = Math.atan2(ux, uz);
          const a = add(x, z, ang);
          if (prev && Math.hypot(prev[0] - x, prev[1] - z) < spacing * 1.6) a.wires.push([prev[0], prev[1], prev[2], x, z, ang]);
          prev = [x, z, ang];
          colliders.add(x, z, 0.35, 0.35, 0);
        } else prev = null;
        t += spacing;
      }
      carry = (carry + L) % spacing;
    }
  }
  const chunks = [];
  const bulbs = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  for (const [k, d] of byChunk) {
    const [cx, cz] = k.split(',').map(Number);
    const g = new THREE.Group();
    const inst = new THREE.InstancedMesh(poleGeo, poleMat, d.poles.length);
    d.poles.forEach(([x, z, ang], i) => {
      q.setFromAxisAngle(up, ang);
      m4.compose(v.set(x, 0, z), q, one); inst.setMatrixAt(i, m4);
      if (i % 2 === 0) {
        const s = new THREE.Sprite(bulbMat); s.scale.set(3.2, 3.2, 1);
        // lamp head is 1.45 m along local +x (toward the road)
        const lx = Math.cos(ang) * 1.45, lz = -Math.sin(ang) * 1.45;
        s.position.set(x + lx, 6.85, z + lz); g.add(s); bulbs.push(s);
      }
    });
    inst.castShadow = true; inst.computeBoundingSphere();
    g.add(inst);
    // wires with sag
    const pts = [];
    for (const [x0, z0, a0, x1, z1, a1] of d.wires) {
      for (const off of [-0.7, 0, 0.7]) {
        // insulator at local x = off -> world (cos a, -sin a) * off
        const o0x = Math.cos(a0) * off, o0z = -Math.sin(a0) * off, o1x = Math.cos(a1) * off, o1z = -Math.sin(a1) * off;
        const N = 6;
        const P = (t) => [x0 + o0x + (x1 + o1x - x0 - o0x) * t, 8.1 - Math.sin(Math.PI * t) * 0.9, z0 + o0z + (z1 + o1z - z0 - o0z) * t];
        for (let s2 = 0; s2 < N; s2++) pts.push(...P(s2 / N), ...P((s2 + 1) / N));
      }
    }
    if (pts.length) {
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(lg, wireMat));
    }
    g.userData.center = new THREE.Vector3((cx + 0.5) * CHUNK, 0, (cz + 0.5) * CHUNK);
    group.add(g); chunks.push(g);
  }
  return {
    group, chunks,
    setNight(on) { bulbMat.opacity = on ? 0.95 : 0; },
  };
}
