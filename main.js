import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const root = document.documentElement;
const stops = [...document.querySelectorAll('.stop')];
const N = stops.length;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

/* ------------------------------------------------------------------ UI */

const rail = document.querySelector('.rail');
const toc = document.querySelector('.toc');
const hudNum = document.querySelector('.hud-num');
const hudName = document.querySelector('.hud-name');
const nextBtn = document.querySelector('.next');
const nextName = document.querySelector('.next-name');
const nextLabel = document.querySelector('.next-label');
const nextArr = document.querySelector('.next-arr');
document.querySelector('.hud-total').textContent = String(N).padStart(2, '0');

const pad = (i) => String(i + 1).padStart(2, '0');

stops.forEach((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.go = i;
  b.setAttribute('aria-label', `${pad(i)} ${s.dataset.name}`);
  b.innerHTML = `<span class="lbl">${s.dataset.name}</span><span class="dot"></span>`;
  rail.append(b);

  const li = document.createElement('li');
  li.innerHTML = `<button type="button" data-go="${i}"><span class="n">${pad(i)}</span>
    <span class="t"><b>${s.dataset.name}</b><small>${s.dataset.desc}</small></span><span class="w">Warp →</span></button>`;
  toc.append(li);
});

function setUI(i) {
  hudNum.textContent = pad(i);
  hudName.textContent = stops[i].dataset.name;
  document.querySelectorAll('[data-go]').forEach((el) => {
    if (el.closest('.rail, .toc')) {
      if (+el.dataset.go === i) el.setAttribute('aria-current', 'step');
      else el.removeAttribute('aria-current');
    }
  });
  const last = i === N - 1;
  nextLabel.textContent = last ? 'Warp' : 'Weiter';
  nextName.textContent = last ? 'Zurück zum Start' : stops[i + 1].dataset.name;
  nextArr.textContent = last ? '↺' : '↓';
}

function showStop(i) {
  stops.forEach((s, k) => {
    const on = k === i;
    s.classList.toggle('active', on);
    s.classList.remove('leaving');
    s.inert = !on;
    s.setAttribute('aria-hidden', String(!on));
  });
  const panel = stops[i].querySelector('.panel');
  panel.scrollTop = 0;
}

function leaveStop(i) {
  const s = stops[i];
  s.classList.add('leaving');
  s.inert = true;
  setTimeout(() => { s.classList.remove('active', 'leaving'); }, 380);
}

/* --------------------------------------------------------------- WebGL */

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('space'),
    antialias: !coarse,
    powerPreference: 'high-performance',
  });
} catch (e) {
  renderer = null;
}

if (renderer) start();

function start() {
  root.classList.add('space');

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07051a, 0.0026);

  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 4000);
  scene.add(camera);

  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.6, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- lights ---------- */
  scene.add(new THREE.HemisphereLight(0x9a8cff, 0x0a0820, 0.6));
  const key = new THREE.DirectionalLight(0xffe4d0, 2.2);
  key.position.set(-40, 60, 30);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5ee7ff, 1.6);
  rim.position.set(50, -10, -60);
  scene.add(rim);

  /* ---------- path through the stations ---------- */
  const stationPts = [
    [0, 0, 0],
    [46, 10, -70],
    [10, -6, -150],
    [70, 14, -220],
    [26, 2, -300],
    [84, 12, -370],
  ].slice(0, N).map((p) => new THREE.Vector3(...p));
  const pre = new THREE.Vector3(-30, -8, 90);
  const post = new THREE.Vector3(120, 20, -440);
  const curve = new THREE.CatmullRomCurve3([pre, ...stationPts, post], false, 'centripetal', 0.5);
  const curveLen = curve.getLength();

  // arc-length u for every station
  const stationU = stationPts.map((p) => {
    let best = 0, bd = Infinity;
    for (let k = 0; k <= 4000; k++) {
      const u = k / 4000;
      const d = curve.getPointAt(u).distanceToSquared(p);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  });

  const UP = new THREE.Vector3(0, 1, 0);
  const tmpM = new THREE.Matrix4();
  function frameAt(u, out) {
    const t = curve.getTangentAt(THREE.MathUtils.clamp(u, 0, 1));
    const x = new THREE.Vector3().crossVectors(UP, t).normalize();
    const y = new THREE.Vector3().crossVectors(t, x).normalize();
    tmpM.makeBasis(x, y, t);
    return out.setFromRotationMatrix(tmpM);
  }

  /* ---------- background nebula ---------- */
  const nebula = new THREE.Mesh(
    new THREE.SphereGeometry(1800, 48, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform float uTime;
        float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
        float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
        void main(){
          vec3 d = vDir;
          float t = uTime*0.01;
          float a = fbm(d*2.2 + vec3(t,0.0,-t));
          float b = fbm(d*4.0 - vec3(0.0,t,a));
          vec3 col = vec3(0.012,0.010,0.035);
          col += vec3(0.32,0.20,0.85) * pow(a,3.2) * 0.55;
          col += vec3(0.10,0.70,0.85) * pow(b,4.0) * 0.35 * smoothstep(-0.4,0.6,d.y);
          col += vec3(1.00,0.55,0.38) * pow(fbm(d*3.0+7.0),5.0) * 0.4;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  scene.add(nebula);

  /* ---------- star sprite ---------- */
  const spriteTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const palette = [new THREE.Color(0x8b7bff), new THREE.Color(0x5ee7ff), new THREE.Color(0xffb38a), new THREE.Color(0xffffff)];

  function makePoints(count, placer, size, opacity) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      placer(v, i);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = palette[Math.random() < 0.6 ? 3 : (Math.random() * 3) | 0];
      const k = 0.5 + Math.random() * 0.5;
      col.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      size, map: spriteTex, vertexColors: true, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
  }

  // distant stars on a shell
  scene.add(makePoints(coarse ? 2500 : 5000, (v) => {
    v.randomDirection().multiplyScalar(700 + Math.random() * 800).add(new THREE.Vector3(40, 0, -180));
  }, 3.2, 0.95));

  // space dust along the path – gives a sense of speed
  const dust = makePoints(coarse ? 1400 : 2600, (v) => {
    const p = curve.getPointAt(Math.random());
    v.randomDirection().multiplyScalar(10 + Math.random() * 60).add(p);
  }, 0.32, 0.7);
  dust.material.fog = true;
  scene.add(dust);

  /* ---------- warp streaks (live in camera space) ---------- */
  const STREAKS = coarse ? 260 : 480;
  const streakPos = new Float32Array(STREAKS * 6);
  const streakSeed = [];
  for (let i = 0; i < STREAKS; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.5 + Math.random() * 22;
    streakSeed.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: -Math.random() * 220 });
  }
  const streakCol = new Float32Array(STREAKS * 6);
  for (let i = 0; i < STREAKS; i++) {
    const c = palette[(Math.random() * 4) | 0];
    streakCol.set([c.r, c.g, c.b, 0, 0, 0], i * 6);
  }
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  streakGeo.setAttribute('color', new THREE.BufferAttribute(streakCol, 3));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  streaks.frustumCulled = false;
  camera.add(streaks);

  /* ---------- the ship ---------- */
  const ship = new THREE.Group();
  const shipBody = new THREE.Group();
  ship.add(shipBody);
  scene.add(ship);

  const hullMat = new THREE.MeshPhysicalMaterial({
    color: 0x9c98bc, metalness: 0.75, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08,
    iridescence: 0.9, iridescenceIOR: 1.7, iridescenceThicknessRange: [200, 700],
  });
  const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x15122e, metalness: 0.8, roughness: 0.3, clearcoat: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a1446, metalness: 0.2, roughness: 0.05, transmission: 0, clearcoat: 1,
    emissive: 0x3a2aa0, emissiveIntensity: 0.35,
  });
  const glowCyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ee7ff).multiplyScalar(1.5) });
  const glowViolet = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9b8bff).multiplyScalar(2.4) });

  // fuselage
  const prof = [];
  const prof2 = [[0, -2.2], [0.42, -2.1], [0.62, -1.6], [0.7, -0.6], [0.62, 0.6], [0.42, 1.8], [0.18, 2.9], [0, 3.3]];
  prof2.forEach(([r, y]) => prof.push(new THREE.Vector2(r, y)));
  const fuseGeo = new THREE.LatheGeometry(prof, 48);
  fuseGeo.rotateX(Math.PI / 2);
  fuseGeo.scale(1.25, 0.62, 1);
  shipBody.add(new THREE.Mesh(fuseGeo, hullMat));

  // canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), glassMat);
  canopy.scale.set(0.9, 0.55, 2.0);
  canopy.position.set(0, 0.32, 0.9);
  shipBody.add(canopy);

  // wings
  function wing(side) {
    const s = new THREE.Shape();
    s.moveTo(0.5 * side, 1.0);
    s.lineTo(3.4 * side, -1.5);
    s.lineTo(3.25 * side, -2.0);
    s.lineTo(0.5 * side, -1.6);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, hullMat);
    m.position.y = 0.02;
    m.rotation.z = -0.08 * side;
    // glowing edge
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.9), glowViolet);
    const a = new THREE.Vector3(0.5 * side, 0, 1.0), b = new THREE.Vector3(3.4 * side, 0, -1.5);
    edge.position.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, 0.06, 0.05));
    edge.lookAt(b.clone().add(new THREE.Vector3(0, 0.06, 0.05)));
    edge.scale.z = a.distanceTo(b) / 1.9;
    m.add(edge);
    // wingtip light
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), side > 0 ? glowCyan : new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb38a).multiplyScalar(3) }));
    tip.position.set(3.35 * side, 0.05, -1.75);
    m.add(tip);
    return m;
  }
  shipBody.add(wing(1), wing(-1));

  // tail fins
  [-1, 1].forEach((side) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(-0.9, 0); s.lineTo(-1.5, 1.1); s.lineTo(-1.15, 1.1); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, hullMat);
    m.position.set(0.38 * side, 0.15, -0.8);
    m.rotation.z = 0.28 * side;
    shipBody.add(m);
  });

  // engines
  const flames = [];
  [-0.48, 0.48].forEach((x) => {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 1.4, 24), darkMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(x, -0.05, -1.75);
    shipBody.add(pod);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 32), glowCyan);
    ring.position.set(x, -0.05, -2.46);
    shipBody.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), glowCyan);
    core.position.set(x, -0.05, -2.47);
    core.rotation.y = Math.PI;
    shipBody.add(core);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 1.6, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fdcff), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flame.geometry.translate(0, -0.8, 0);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, -0.05, -2.5);
    shipBody.add(flame);
    flames.push(flame);
  });
  const engineLight = new THREE.PointLight(0x5ee7ff, 6, 12, 2);
  engineLight.position.set(0, 0, -3);
  shipBody.add(engineLight);

  // big invisible hitbox makes the ship easy to tap
  const hitbox = new THREE.Mesh(new THREE.SphereGeometry(4.2, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
  ship.add(hitbox);

  // halo ring that pulses while waiting → "tap me"
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 3.48, 96),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9b8bff).multiplyScalar(1.6), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  halo.rotation.x = -Math.PI / 2;
  ship.add(halo);

  /* ---------- engine trail ---------- */
  const TRAIL = 70;
  const trailPos = new Float32Array(TRAIL * 2 * 3);
  const trailCol = new Float32Array(TRAIL * 2 * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
    size: 0.22, map: spriteTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  trail.frustumCulled = false;
  scene.add(trail);
  const trailHist = [];

  /* ---------- station objects ---------- */
  const stationObjs = [];
  const glowSprite = (color, scale) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(scale);
    return s;
  };
  const physical = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.3, roughness: 0.25, clearcoat: 1, ...extra });

  const builders = [
    // 01 Hangar – a portal of rings
    () => {
      const g = new THREE.Group();
      const rings = [];
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.TorusGeometry(7 - i * 1.3, 0.12 + (i === 0 ? 0.25 : 0), 16, 128),
          i === 0 ? physical(0xdcd6ff, { metalness: 0.9, roughness: 0.15, iridescence: 1 }) : new THREE.MeshBasicMaterial({ color: palette[i % 3].clone().multiplyScalar(2) }));
        rings.push(m);
        g.add(m);
      }
      g.add(glowSprite(0x8b7bff, 26));
      g.userData.tick = (t) => rings.forEach((r, i) => { r.rotation.x = Math.sin(t * 0.3 + i) * 0.5; r.rotation.y = t * (0.15 + i * 0.07); });
      return g;
    },
    // 02 Star map – wireframe orb with nodes
    () => {
      const g = new THREE.Group();
      const geo = new THREE.IcosahedronGeometry(6, 1);
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0.55 }));
      g.add(wire);
      const nodes = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.2, map: spriteTex, color: new THREE.Color(0xffffff).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.add(nodes);
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), physical(0x8b7bff, { flatShading: true, iridescence: 1, metalness: 0.6 }));
      g.add(core);
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(9, 0.04, 8, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb38a).multiplyScalar(1.6) }));
      orbit.rotation.x = 1.2;
      g.add(orbit);
      g.add(glowSprite(0x5ee7ff, 22));
      g.userData.tick = (t) => { wire.rotation.y = nodes.rotation.y = t * 0.12; core.rotation.x = t * 0.4; core.rotation.y = t * 0.3; orbit.rotation.z = t * 0.2; };
      return g;
    },
    // 03 Projects – three planets orbiting a sun
    () => {
      const g = new THREE.Group();
      const sun = new THREE.Mesh(new THREE.SphereGeometry(2.4, 48, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc9a6).multiplyScalar(1.3) }));
      g.add(sun, glowSprite(0xffb38a, 20));
      const planets = [
        { c: 0x8b7bff, r: 1.3, d: 6, s: 0.5, ring: true },
        { c: 0x5ee7ff, r: 1.0, d: 9, s: 0.33 },
        { c: 0xffb38a, r: 1.1, d: 12, s: 0.22 },
      ].map((p, i) => {
        const pivot = new THREE.Group();
        pivot.rotation.x = 0.35 - i * 0.15;
        const m = new THREE.Mesh(new THREE.SphereGeometry(p.r, 40, 20), physical(p.c, { iridescence: 0.6 }));
        m.position.x = p.d;
        if (p.ring) {
          const r = new THREE.Mesh(new THREE.RingGeometry(p.r * 1.5, p.r * 2.1, 64), new THREE.MeshBasicMaterial({ color: 0xc9c0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
          r.rotation.x = 1.3;
          m.add(r);
        }
        const path = new THREE.Mesh(new THREE.TorusGeometry(p.d, 0.025, 6, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
        path.rotation.x = Math.PI / 2;
        pivot.add(m, path);
        g.add(pivot);
        return { pivot, m, s: p.s, o: i * 2.1 };
      });
      g.userData.tick = (t) => planets.forEach((p) => { p.pivot.rotation.y = p.o + t * p.s; p.m.rotation.y = t; });
      return g;
    },
    // 04 About – an iridescent knot
    () => {
      const g = new THREE.Group();
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(4, 1.1, 220, 32, 2, 3),
        physical(0xf0eaff, { metalness: 0.85, roughness: 0.12, iridescence: 1, iridescenceIOR: 2, iridescenceThicknessRange: [100, 900] }));
      g.add(knot, glowSprite(0xff9fd0, 26));
      g.userData.tick = (t) => { knot.rotation.x = t * 0.15; knot.rotation.y = t * 0.22; };
      return g;
    },
    // 05 Workshop – floating tiles assembling
    () => {
      const g = new THREE.Group();
      const cubes = [];
      const mats = [physical(0x8b7bff), physical(0x5ee7ff), physical(0xffb38a), physical(0xeeeeff, { metalness: 0.9 })];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), mats[(Math.random() * 4) | 0]);
        m.userData.home = new THREE.Vector3(x, y, z).multiplyScalar(2.1);
        m.userData.ph = Math.random() * Math.PI * 2;
        cubes.push(m);
        g.add(m);
      }
      g.add(glowSprite(0x8b7bff, 22));
      g.userData.tick = (t) => {
        g.rotation.y = t * 0.18; g.rotation.x = Math.sin(t * 0.2) * 0.3;
        const spread = 1 + (Math.sin(t * 0.6) * 0.5 + 0.5) * 0.7;
        cubes.forEach((c) => { c.position.copy(c.userData.home).multiplyScalar(spread); c.rotation.x = c.rotation.y = Math.sin(t + c.userData.ph) * 0.6; });
      };
      return g;
    },
    // 06 Beacon – antenna sending pulses
    () => {
      const g = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.4, 12, 16), physical(0xdcd6ff, { metalness: 0.9 }));
      const dish = new THREE.Mesh(new THREE.SphereGeometry(2.6, 40, 16, 0, Math.PI * 2, 0, 1.1), physical(0xeeeeff, { side: THREE.DoubleSide, metalness: 0.8, iridescence: 1 }));
      dish.position.y = 5;
      dish.rotation.x = Math.PI;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), glowCyan);
      bulb.position.y = 6.4;
      g.add(mast, dish, bulb, glowSprite(0x5ee7ff, 18));
      const pulses = [0, 1, 2].map(() => {
        const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ee7ff).multiplyScalar(2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        r.rotation.x = Math.PI / 2;
        r.position.y = 6.4;
        g.add(r);
        return r;
      });
      g.userData.tick = (t) => {
        pulses.forEach((p, i) => { const k = (t * 0.35 + i / 3) % 1; p.scale.setScalar(1 + k * 12); p.material.opacity = (1 - k) * 0.9; });
        dish.rotation.y = t * 0.3;
      };
      return g;
    },
  ];

  const qTmp = new THREE.Quaternion();
  stationPts.forEach((p, i) => {
    const obj = (builders[i] || builders[0])();
    frameAt(stationU[i], qTmp);
    // ahead of the stop, off to the side the camera looks across
    obj.userData.anchor = p.clone();
    obj.userData.frame = qTmp.clone();
    obj.userData.base = new THREE.Vector3();
    obj.scale.setScalar(1.6);
    stationObjs.push(obj);
    scene.add(obj);
  });

  /* ---------- flight state ---------- */
  let current = 0;
  let u = 0;            // ship position on curve
  let flight = null;
  let speed = 0;        // world units / s
  let warpAmt = 0;
  let arrivedAt = 0;

  const startIndex = Math.max(0, stops.findIndex((s) => '#' + s.id === location.hash));
  // intro: glide in from the start of the curve
  flight = { from: 0, to: stationU[startIndex], t: 0, dur: reduced ? 0.6 : 3.2, warp: startIndex > 0, target: startIndex, intro: true };
  current = startIndex;
  setUI(current);
  stops.forEach((s) => { s.inert = true; s.setAttribute('aria-hidden', 'true'); });

  function go(target, opts = {}) {
    target = ((target % N) + N) % N;
    if (flight || target === current) return;
    const hops = Math.abs(target - current);
    const warp = opts.warp ?? hops > 1;
    leaveStop(current);
    flight = {
      from: u, to: stationU[target], t: 0, target, warp,
      dur: reduced ? 0.8 : warp ? 2.8 : 2.3,
    };
    current = target;
    setUI(current);
    root.classList.add('flying');
    history.replaceState(null, '', '#' + stops[target].id);
  }
  const next = () => go(current === N - 1 ? 0 : current + 1, { warp: current === N - 1 });
  const prev = () => { if (current > 0) go(current - 1); };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go]');
    if (!el) return;
    e.preventDefault();
    go(+el.dataset.go);
  });
  nextBtn.addEventListener('click', next);
  addEventListener('hashchange', () => {
    const i = stops.findIndex((s) => '#' + s.id === location.hash);
    if (i >= 0) go(i);
  });

  /* ---------- input: wheel, touch, keys, tap ---------- */
  const panelOf = (el) => el && el.closest && el.closest('.stop.active .panel');
  const canScroll = (panel, dir) => panel && (dir > 0
    ? panel.scrollTop + panel.clientHeight < panel.scrollHeight - 2
    : panel.scrollTop > 2);

  let wheelAcc = 0, lastWheel = 0, wheelArmed = true;
  addEventListener('wheel', (e) => {
    const now = performance.now();
    const gap = now - lastWheel;
    lastWheel = now;
    const panel = panelOf(e.target);
    const dir = Math.sign(e.deltaY);
    if (canScroll(panel, dir)) { wheelAcc = 0; return; }
    e.preventDefault();
    // a fresh gesture (pause in wheel events) re-arms after a flight
    if (gap > 220) { wheelArmed = true; wheelAcc = 0; }
    if (flight || !wheelArmed || now - arrivedAt < 350) return;
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) > 45) {
      wheelArmed = false;
      wheelAcc > 0 ? next() : prev();
      wheelAcc = 0;
    }
  }, { passive: false });

  let touch = null;
  addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, panel: panelOf(e.target), st: e.target.closest('.panel') ? e.target.closest('.panel').scrollTop : 0 };
  }, { passive: true });
  addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0];
    const dy = touch.y - t.clientY, dx = touch.x - t.clientX;
    const panel = touch.panel;
    touch = touch && Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) ? touch : null;
    if (!touch) return;
    const dir = Math.sign(dy);
    // inside a scrollable panel: only fly once it was already at its edge
    if (panel && (panel.scrollTop !== touch.st || canScroll(panel, dir))) { touch = null; return; }
    touch = null;
    dir > 0 ? next() : prev();
  }, { passive: true });

  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const k = e.key;
    if (['ArrowDown', 'PageDown', 'ArrowRight'].includes(k) || (k === ' ' && !e.target.closest('button, a'))) { e.preventDefault(); next(); }
    else if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(k)) { e.preventDefault(); prev(); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(N - 1);
    else if (/^[1-9]$/.test(k) && +k <= N) go(+k - 1);
  });

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const canvas = renderer.domElement;
  const hitShip = (x, y) => {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(hitbox).length > 0;
  };
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && hitShip(e.clientX, e.clientY)) next();
    down = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!coarse) canvas.style.cursor = !flight && hitShip(e.clientX, e.clientY) ? 'pointer' : '';
  });

  /* ---------- layout ---------- */
  const camOffset = new THREE.Vector3();
  const lookAhead = new THREE.Vector3();
  const objOffset = new THREE.Vector3();
  function layout() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    // shift the scene so the ship sits beside (desktop) or above (phone) the panel
    if (w <= 760) {
      camOffset.set(5, 2.4, -15); lookAhead.set(0, 0.8, 16);
      camera.setViewOffset(w, h, w * 0.2, h * 0.34, w, h);
      placeStations(objOffset.set(-2, 3, 80));
    } else {
      camOffset.set(5, 2, -9.5); lookAhead.set(0, 0.8, 16);
      camera.clearViewOffset();
      placeStations(objOffset.set(-22, 17, 62));
    }
    // keep a constant horizontal field of view on desktop so any aspect frames the same
    const hfov = THREE.MathUtils.degToRad(72);
    camera.fov = w <= 760 ? 64 : Math.min(80, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect)));
    camera.userData.baseFov = camera.fov;
    camera.updateProjectionMatrix();
  }
  function placeStations(off) {
    stationObjs.forEach((o) => {
      o.userData.base.copy(off).applyQuaternion(o.userData.frame).add(o.userData.anchor);
      o.position.copy(o.userData.base);
    });
  }
  addEventListener('resize', layout);
  layout();

  /* ---------- animation ---------- */
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeWarp = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);

  const shipQ = new THREE.Quaternion();
  const camQ = new THREE.Quaternion();
  const headQ = new THREE.Quaternion();
  const flipQ = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);
  const rollQ = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  let first = true;
  const clock = new THREE.Clock();
  const veil = document.querySelector('.warp-veil');
  let dirSign = 1;

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // --- flight progress
    let thrust = 0.25;
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const e = flight.warp ? easeWarp(flight.t) : ease(flight.t);
      const nu = THREE.MathUtils.lerp(flight.from, flight.to, e);
      speed = (Math.abs(nu - u) * curveLen) / Math.max(dt, 1e-4);
      dirSign = flight.to >= flight.from ? 1 : -1;
      u = nu;
      thrust = 0.25 + Math.min(1, speed / 60);
      if (flight.warp && !reduced) warpAmt = Math.sin(Math.PI * flight.t) ** 1.5;
      if (flight.t >= 1) {
        const tgt = flight.target;
        flight = null;
        speed = 0;
        arrivedAt = performance.now();
        root.classList.remove('flying');
        showStop(tgt);
        if (!root.classList.contains('ready')) root.classList.add('ready');
      }
    } else {
      speed *= 0.9;
    }
    if (!flight || !flight.warp) warpAmt = Math.max(0, warpAmt - dt * 2);
    veil.style.opacity = warpAmt.toFixed(3);

    // --- ship transform
    const pos = curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1));
    const bob = reduced ? 0 : Math.sin(time * 1.3) * 0.18;
    ship.position.copy(pos).add(v1.set(0, bob, 0));
    frameAt(u, headQ);
    if (dirSign < 0 && flight) headQ.multiply(flipQ);
    // bank into curves
    const tA = curve.getTangentAt(THREE.MathUtils.clamp(u, 0, 1));
    const tB = curve.getTangentAt(THREE.MathUtils.clamp(u + 0.02 * dirSign, 0, 1));
    v2.crossVectors(tA, tB);
    const bank = THREE.MathUtils.clamp(-v2.y * 14 * Math.min(1, speed / 25), -0.7, 0.7);
    rollQ.setFromAxisAngle(Z, bank + (reduced ? 0 : Math.sin(time * 0.9) * 0.04));
    headQ.multiply(rollQ);
    if (first) { shipQ.copy(headQ); camQ.copy(headQ); }
    shipQ.slerp(headQ, 1 - Math.exp(-dt * 4));
    ship.quaternion.copy(shipQ);

    // engine flames
    flames.forEach((f, i) => {
      const flick = 1 + Math.sin(time * 40 + i * 2) * 0.08;
      f.scale.set(1, (0.35 + thrust * 1.6 + warpAmt * 3) * flick, 1);
      f.material.opacity = 0.2 + thrust * 0.35;
    });
    engineLight.intensity = 2 + thrust * 6;

    // tap halo when idle
    const idle = !flight && performance.now() - arrivedAt > 1200;
    halo.material.opacity = THREE.MathUtils.lerp(halo.material.opacity, idle ? 0.25 + Math.sin(time * 2.5) * 0.15 : 0, 0.08);
    halo.scale.setScalar(1 + (time * 0.6 % 1) * 0.12);

    // --- camera: behind and to the side, softly following
    camQ.slerp(frameAt(u, qTmp), 1 - Math.exp(-dt * 2.2));
    const off = v1.copy(camOffset);
    off.z -= warpAmt * 5; // fall back a little in warp
    camPos.copy(ship.position).add(off.applyQuaternion(camQ));
    const look = v2.copy(lookAhead).applyQuaternion(camQ).add(ship.position);
    if (first) { camera.position.copy(camPos); camLook.copy(look); first = false; }
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 6));
    camLook.lerp(look, 1 - Math.exp(-dt * 8));
    camera.lookAt(camLook);
    const fov = camera.userData.baseFov + warpAmt * 38 + Math.min(speed / 60, 1) * 6;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (warpAmt > 0.02 && !reduced) camera.position.add(v1.set((Math.random() - 0.5), (Math.random() - 0.5), 0).multiplyScalar(warpAmt * 0.12));

    nebula.position.copy(camera.position);
    nebula.material.uniforms.uTime.value = time;

    // --- warp streaks
    const sMat = streaks.material;
    sMat.opacity = Math.min(1, warpAmt * 1.4 + Math.max(0, speed - 30) / 120);
    if (sMat.opacity > 0.01) {
      const vel = 80 + warpAmt * 600;
      const len = 0.5 + warpAmt * 26 + speed * 0.05;
      for (let i = 0; i < STREAKS; i++) {
        const s = streakSeed[i];
        s.z += vel * dt;
        if (s.z > 2) s.z -= 222;
        streakPos.set([s.x, s.y, s.z, s.x, s.y, s.z - len], i * 6);
      }
      streakGeo.attributes.position.needsUpdate = true;
    }

    // --- trail
    v1.set(0, -0.05, -2.6).applyMatrix4(shipBody.matrixWorld);
    trailHist.unshift(v1.clone());
    if (trailHist.length > TRAIL) trailHist.pop();
    for (let i = 0; i < TRAIL; i++) {
      const p = trailHist[Math.min(i, trailHist.length - 1)];
      const jitter = 0.05 + i * 0.006;
      const k = (1 - i / TRAIL) ** 2 * (0.25 + thrust * 0.75);
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 3;
        trailPos[o] = p.x + (Math.random() - 0.5) * jitter + (s ? 0.48 : -0.48) * 0.4;
        trailPos[o + 1] = p.y + (Math.random() - 0.5) * jitter;
        trailPos[o + 2] = p.z + (Math.random() - 0.5) * jitter;
        trailCol[o] = 0.37 * k; trailCol[o + 1] = 0.9 * k; trailCol[o + 2] = 1.0 * k;
      }
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;

    // --- stations
    stationObjs.forEach((o, i) => {
      o.userData.tick?.(reduced ? time * 0.3 : time);
      o.position.y = o.userData.base.y + Math.sin(time * 0.5 + i) * 0.6;
    });

    composer.render();
    requestAnimationFrame(tick);
  }

  // Wait one frame so fonts/layout settle, then fly in.
  requestAnimationFrame(() => {
    root.classList.add('flying');
    tick();
    setTimeout(() => root.classList.add('ready'), 400);
  });
}
