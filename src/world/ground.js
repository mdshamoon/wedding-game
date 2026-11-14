// Streams satellite imagery tiles around the focus point at several zoom levels.
import * as THREE from 'three';
import { CONFIG, QUALITY } from '../config.js';
import { tileBounds, localToTile } from '../geo.js';

// High-frequency detail (soil grain, grass blades) blended over the 0.5 m/px imagery near the camera,
// so the ground stays crisp at street level. World-space UVs, fades out with distance.
let detailTex = null;
function getDetail() {
  if (detailTex) return detailTex;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const v = 90 + Math.random() * 80 | 0; x.fillStyle = `rgb(${v},${v},${v})`;
    const s = Math.random() < 0.85 ? 1.5 : 3; x.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  x.lineWidth = 1.2;
  for (let i = 0; i < 5000; i++) { // grass blades
    const v = 70 + Math.random() * 110 | 0; x.strokeStyle = `rgba(${v},${v},${v},0.7)`;
    const px = Math.random() * 512, py = Math.random() * 512; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 4, py - 3 - Math.random() * 6); x.stroke();
  }
  for (let i = 0; i < 40; i++) { const v = 105 + Math.random() * 46 | 0; x.fillStyle = `rgba(${v},${v},${v},0.35)`; x.beginPath(); x.ellipse(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 40, 6 + Math.random() * 25, Math.random() * 3, 0, 7); x.fill(); }
  detailTex = new THREE.CanvasTexture(c);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.anisotropy = 8;
  return detailTex;
}
function addDetail(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: getDetail() };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D detailMap;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dd = length(vWPos - cameraPosition);
        float fadeD = 1.0 - smoothstep(25.0, 140.0, dd);
        float d1 = texture2D(detailMap, vWPos.xz / 3.5).r;
        float d2 = texture2D(detailMap, vWPos.xz / 13.0).r;
        float det = mix(1.0, (d1 * 0.65 + d2 * 0.35) * 2.0, 0.55 * fadeD);
        diffuseColor.rgb *= det;`);
  };
  mat.customProgramCacheKey = () => 'sat-detail';
}

export class SatelliteGround {
  constructor(scene, renderer) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'ground';
    scene.add(this.group);
    this.aniso = renderer.capabilities.getMaxAnisotropy();
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin('anonymous');
    const detail = QUALITY.detailZoom;
    this.levels = [
      { z: 15, radius: QUALITY.viewDist * 1.25 },
      { z: 17, radius: QUALITY.isMobile ? 520 : 760 },
    ];
    if (detail >= 18) this.levels.push({ z: 18, radius: 300 });
    this.levels.forEach((L, i) => {
      const b = tileBounds(L.z, 0, 0);
      L.size = b.size;
      L.geo = new THREE.PlaneGeometry(b.size, b.size);
      L.geo.rotateX(-Math.PI / 2);
      L.tiles = new Map();
      L.order = i;
    });
    this.queue = [];
    this.active = 0;
    this.maxActive = 6;
    this.tint = new THREE.Color(1, 1, 1);
    this.lastUpdate = -1;
    this.enabled = true;

    // Base plane under everything (fields colour) for before tiles load / gaps.
    const base = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x5d6b40 }));
    base.position.y = -0.3;
    base.receiveShadow = false;
    this.base = base;
    this.group.add(base);
  }

  setTint(hex) {
    this.tint.set(hex);
    for (const L of this.levels) for (const t of L.tiles.values()) t.mesh.material.color.copy(this.tint);
  }

  update(focus, time) {
    if (!this.enabled) return;
    this.base.position.x = focus.x; this.base.position.z = focus.z;
    if (time - this.lastUpdate < 0.35) return;
    this.lastUpdate = time;
    for (const L of this.levels) this.updateLevel(L, focus);
    this.pump();
  }

  updateLevel(L, focus) {
    const r = L.radius;
    const [ax, ay] = localToTile(focus.x - r, focus.z - r, L.z);
    const [bx, by] = localToTile(focus.x + r, focus.z + r, L.z);
    const want = new Set();
    for (let ty = Math.floor(ay); ty <= Math.floor(by); ty++) {
      for (let tx = Math.floor(ax); tx <= Math.floor(bx); tx++) {
        const key = tx + ',' + ty;
        want.add(key);
        if (!L.tiles.has(key)) this.addTile(L, tx, ty, key, focus);
      }
    }
    // unload far tiles (with hysteresis)
    const far = r * 1.5;
    for (const [key, t] of L.tiles) {
      if (want.has(key)) continue;
      const dx = t.cx - focus.x, dz = t.cz - focus.z;
      if (Math.abs(dx) > far + L.size || Math.abs(dz) > far + L.size) this.removeTile(L, key);
    }
  }

  addTile(L, tx, ty, key, focus) {
    const b = tileBounds(L.z, tx, ty);
    const mat = new THREE.MeshLambertMaterial({
      color: this.tint, transparent: false,
      polygonOffset: true, polygonOffsetFactor: -2 * (L.order + 1), polygonOffsetUnits: -4 * (L.order + 1),
    });
    if (L.order > 0) addDetail(mat);
    const mesh = new THREE.Mesh(L.geo, mat);
    mesh.position.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    mesh.receiveShadow = true;
    mesh.renderOrder = -10 + L.order;
    mesh.visible = false; // until texture arrives
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    const t = { mesh, cx: mesh.position.x, cz: mesh.position.z, z: L.z, tx, ty, loading: false, dead: false };
    L.tiles.set(key, t);
    const d = Math.hypot(t.cx - focus.x, t.cz - focus.z);
    this.queue.push({ t, pri: d / L.size - L.order * 2 });
  }

  removeTile(L, key) {
    const t = L.tiles.get(key);
    t.dead = true;
    this.group.remove(t.mesh);
    if (t.mesh.material.map) t.mesh.material.map.dispose();
    t.mesh.material.dispose();
    L.tiles.delete(key);
  }

  pump() {
    this.queue = this.queue.filter((q) => !q.t.dead && !q.t.loading && !q.t.loaded);
    this.queue.sort((a, b) => a.pri - b.pri);
    while (this.active < this.maxActive && this.queue.length) {
      const { t } = this.queue.shift();
      t.loading = true;
      this.active++;
      const url = CONFIG.tiles.url.replace('{z}', t.z).replace('{x}', t.tx).replace('{y}', t.ty);
      this.loader.load(url, (tex) => {
        this.active--;
        t.loading = false; t.loaded = true;
        if (t.dead) { tex.dispose(); this.pump(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.aniso;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        t.mesh.material.map = tex;
        t.mesh.material.needsUpdate = true;
        t.mesh.visible = true;
        this.pump();
      }, undefined, () => {
        this.active--; t.loading = false; t.loaded = true; this.pump();
      });
    }
  }

  // Resolves when the tiles around a point are loaded (or timeout), for loading screens.
  async prime(focus, timeoutMs = 6000) {
    this.lastUpdate = -1;
    this.update(focus, 1e9);
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      const pending = this.levels.slice(0, 2).some((L) => [...L.tiles.values()].some((t) => !t.loaded && Math.hypot(t.cx - focus.x, t.cz - focus.z) < L.size * 1.5));
      if (!pending) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
