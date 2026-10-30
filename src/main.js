import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { createWorld } from './environment.js';
import { createAlice } from './alice.js';

const canvas = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const noticeEl = document.getElementById('notice');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.05, 120);
camera.position.set(4.4, 2.2, 5.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.02, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 1.05;
controls.maxDistance = 6.4;
controls.minPolarAngle = 0.38;
controls.maxPolarAngle = 1.56;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.75;
controls.autoRotateSpeed = 0.8;

const world = createWorld(scene, renderer);
const alice = createAlice();
scene.add(alice.root);

/* ----------------------------- postproceso ----------------------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.32,
  0.55,
  1.0
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float d = length(c);
      float ab = 0.0016 * d;

      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;

      float vig = smoothstep(0.95, 0.30, d);
      col *= mix(0.45, 1.0, vig);

      float g = fract(sin(dot(uv * uResolution + uTime * 37.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * 0.018;

      col = mix(col, col * vec3(0.93, 0.98, 1.08), 0.28);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
composer.addPass(grade);

/* ----------------------------- cámara ----------------------------- */
const VIEWS = {
  general: { pos: [1.75, 1.42, 2.85], target: [0, 1.02, 0] },
  portrait: { pos: [0.42, 1.62, 0.92], target: [0, 1.55, 0.02] },
  low: { pos: [2.1, 0.72, 2.4], target: [0, 1.05, 0] },
};

let tween = null;
let autoRotateWanted = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.autoRotate = autoRotateWanted;

function flyTo(view, duration = 1.6) {
  tween = {
    p0: camera.position.clone(),
    t0: controls.target.clone(),
    p1: new THREE.Vector3(...view.pos),
    t1: new THREE.Vector3(...view.target),
    t: 0,
    duration,
  };
  controls.autoRotate = false;
}

function updateTween(dt) {
  if (!tween) return;
  tween.t += dt;
  const u = Math.min(tween.t / tween.duration, 1);
  const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  camera.position.lerpVectors(tween.p0, tween.p1, e);
  controls.target.lerpVectors(tween.t0, tween.t1, e);
  if (u >= 1) {
    tween = null;
    controls.autoRotate = autoRotateWanted;
  }
}

/* ----------------------------- interacción ----------------------------- */
const pointer = { x: 0, y: 0 };
window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
});

const loader = new GLTFLoader();
let customModel = null;
let mixer = null;

function toast(message, ms = 4200) {
  noticeEl.textContent = message;
  noticeEl.classList.add('is-visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => noticeEl.classList.remove('is-visible'), ms);
}

function frameModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const s = 1.72 / (size.y || 1);
  model.scale.setScalar(s);
  model.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(model);
  model.position.x -= (b2.min.x + b2.max.x) / 2;
  model.position.z -= (b2.min.z + b2.max.z) / 2;
  model.position.y -= b2.min.y;
}

function disposeModel() {
  if (!customModel) return;
  scene.remove(customModel);
  customModel.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        for (const key of Object.keys(m)) {
          const v = m[key];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      });
    }
  });
  customModel = null;
  if (mixer) {
    mixer.stopAllAction();
    mixer = null;
  }
}

function useGltf(gltf, label = 'modelo') {
  disposeModel();
  alice.root.visible = false;
  const model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if ('envMapIntensity' in m) m.envMapIntensity = 0.8;
        });
      }
    }
  });
  frameModel(model);
  customModel = model;
  scene.add(model);

  if (gltf.animations && gltf.animations.length) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(gltf.animations[0]).play();
  }
  flyTo(VIEWS.general, 1.4);
  toast(`Modelo cargado: ${label} · usa Órbita/Retrato para encuadrar.`);
}

function loadGlbFile(file) {
  if (!file) return;
  if (!/\.(glb|gltf)$/i.test(file.name)) {
    toast('Formato no soportado. Arrastra un archivo .glb (o .gltf con recursos embebidos).');
    return;
  }
  toast('Cargando modelo…', 20000);
  const url = URL.createObjectURL(file);
  loader.load(
    url,
    (gltf) => {
      useGltf(gltf, file.name);
      URL.revokeObjectURL(url);
    },
    undefined,
    (err) => {
      console.error(err);
      URL.revokeObjectURL(url);
      toast('No se pudo cargar el modelo. Prueba con un .glb sin compresión Draco.');
    }
  );
}

/* UI */
const fileInput = document.getElementById('file');

document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'rotate') {
      autoRotateWanted = !autoRotateWanted;
      controls.autoRotate = autoRotateWanted;
      btn.setAttribute('aria-pressed', String(autoRotateWanted));
      btn.classList.toggle('is-on', autoRotateWanted);
    } else if (action === 'general') {
      flyTo(VIEWS.general);
    } else if (action === 'portrait') {
      flyTo(VIEWS.portrait);
    } else if (action === 'low') {
      flyTo(VIEWS.low);
    } else if (action === 'vorpal') {
      const mode = alice.bladeMode === 'held' ? 'floating' : 'held';
      alice.setBladeMode(mode);
      btn.setAttribute('aria-pressed', String(mode === 'floating'));
      btn.classList.toggle('is-on', mode === 'floating');
      btn.textContent = mode === 'floating' ? 'Vorpal: flotante' : 'Vorpal';
      toast(mode === 'floating' ? 'La Vorpal Blade despierta…' : 'La Vorpal Blade vuelve a la mano.', 2600);
    } else if (action === 'glb') {
      fileInput.click();
    }
  });
});

fileInput.addEventListener('change', () => {
  loadGlbFile(fileInput.files && fileInput.files[0]);
  fileInput.value = '';
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('is-dragging');
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) document.body.classList.remove('is-dragging');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('is-dragging');
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  loadGlbFile(file);
});

/* modelo opcional: assets/alice.glb */
fetch('./assets/alice.glb', { method: 'HEAD' })
  .then((r) => {
    if (!r.ok) return;
    loader.load('./assets/alice.glb', (gltf) => useGltf(gltf, 'assets/alice.glb'), undefined, () => {});
  })
  .catch(() => {});

/* ----------------------------- resize ----------------------------- */
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
  grade.uniforms.uResolution.value.set(w, h);
}
window.addEventListener('resize', onResize);

/* ----------------------------- bucle ----------------------------- */
const clock = new THREE.Clock();
let frames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  updateTween(dt);
  controls.update();

  world.update(t);
  alice.update(t, dt, { lookX: pointer.x, lookY: pointer.y, wind: 0.85 + Math.sin(t * 0.23) * 0.15 });
  if (mixer) mixer.update(dt);

  grade.uniforms.uTime.value = t;
  composer.render();

  frames++;
  if (frames === 3) {
    loaderEl.classList.add('is-hidden');
    document.body.classList.add('is-ready');
    flyTo(VIEWS.general, 2.4);
  }
}

onResize();
animate();

/* utilidades de depuración */
window.__ALICE__ = { scene, camera, renderer, controls, alice, world, THREE, flyTo, VIEWS };
