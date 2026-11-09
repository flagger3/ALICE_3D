// Carta para Juana — escena principal.
//
// Estados (body[data-state]):
//   loading → intro → offering (Alice levanta el libro) → opening (el libro
//   vuela a primer plano) → reading → closing (vuelve a su mano) → returning → intro
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AliceAnimator } from './alice-animator.js';
import { addLights, createFloor, createCards, createMotes, createBookProp } from './decor.js';
import { Libro } from './libro.js';
import { CARTA } from '../contenido.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TEST = new URLSearchParams(location.search).get('test');
let state = 'loading';
const setState = (s) => {
  state = s; document.body.dataset.state = s;
  if (TEST) console.log('STATE', s, performance.now().toFixed(0));
};

// ---------- Textos ----------
$('.title-pre').textContent = CARTA.intro.antes;
$('.title-name').textContent = CARTA.destinataria;
$('.title-sub').textContent = CARTA.intro.subtitulo;
document.title = `${CARTA.intro.antes} ${CARTA.destinataria}`;
const orn = $('#tpl-orn').content;
document.querySelectorAll('.frame-orn').forEach((el) => el.appendChild(orn.cloneNode(true)));

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x170910, 4.5, 11);
addLights(scene);
scene.add(createFloor());
const cards = createCards(reducedMotion ? 8 : 14);
const motes = createMotes(reducedMotion ? 80 : 260);
scene.add(cards, motes);

// ---------- Cámara: planos con transiciones suaves + paralaje ----------
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 50);
const SHOTS = {
  far:   { pos: new THREE.Vector3(0, 1.6, 8.5), look: new THREE.Vector3(0, 1.0, 0) },
  // Alice entre el título (arriba) y el botón (abajo)
  idle:  { pos: new THREE.Vector3(0, 1.15, 5.2), look: new THREE.Vector3(0, 1.04, 0) },
  offer: { pos: new THREE.Vector3(-0.5, 1.34, 2.05), look: new THREE.Vector3(-0.18, 1.2, 0) },
};
let shot = SHOTS.far;
const camPos = SHOTS.far.pos.clone(), camLook = SHOTS.far.look.clone();
const parallax = new THREE.Vector2(), parallaxTarget = new THREE.Vector2();

/** En pantallas verticales, alejar la cámara para que Alice quepa entera. */
function framed(v, look) {
  const a = camera.aspect;
  const k = a < 1 ? THREE.MathUtils.clamp(0.56 / a, 1, 1.6) : 1;
  return look.clone().add(v.clone().sub(look).multiplyScalar(k));
}
function updateCamera(dt) {
  const target = framed(shot.pos, shot.look);
  const lambda = reducedMotion ? 6 : 1.4;
  camPos.x = THREE.MathUtils.damp(camPos.x, target.x, lambda, dt);
  camPos.y = THREE.MathUtils.damp(camPos.y, target.y, lambda, dt);
  camPos.z = THREE.MathUtils.damp(camPos.z, target.z, lambda, dt);
  camLook.lerp(shot.look, 1 - Math.exp(-lambda * dt));
  parallax.lerp(parallaxTarget, 1 - Math.exp(-3 * dt));
  camera.position.copy(camPos).add(new THREE.Vector3(parallax.x * 0.18, parallax.y * 0.09, 0));
  camera.lookAt(camLook);
}

// ---------- Alice ----------
let animator = null, model = null;
const aliceBox = new THREE.Box3(new THREE.Vector3(-0.38, 0, -0.32), new THREE.Vector3(0.38, 1.66, 0.32));

new GLTFLoader().load(
  'assets/Checkmate.glb',
  async (gltf) => {
    model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });
    scene.add(model);
    animator = new AliceAnimator(model);
    animator.lookTarget = camera.position;
    animator.attachProp(createBookProp(), { show: false, wave: 3, waveHz: 0.35, hold: 'palm' });

    await document.fonts.ready;
    libro.layout();
    libro.apply(true);
    // Un frame renderizado antes de quitar la pantalla de carga
    renderer.render(scene, camera);
    $('#loader').classList.add('done');
    shot = SHOTS.idle;
    if (TEST) return runTest();
    await sleep(reducedMotion ? 0 : 500);
    setState('intro');
  },
  (xhr) => {
    if (xhr.total) $('#loaderPct').textContent = `${Math.round((xhr.loaded / xhr.total) * 100)} %`;
  },
  (err) => {
    console.error(err);
    $('.loader-text').textContent = 'No se pudo abrir la madriguera (¿estás usando un servidor local?)';
  },
);

// ---------- Libro ----------
const host = $('#bookHost');
const fly = $('.book-fly');
const libro = new Libro(host, CARTA);
const prevBtn = $('#prevBtn'), nextBtn = $('#nextBtn'), pageLabel = $('#pageLabel');
libro.onchange = (l) => {
  pageLabel.textContent = l.label;
  prevBtn.disabled = l.atStart;
  nextBtn.disabled = l.atEnd;
};
libro.onchange(libro);

prevBtn.addEventListener('click', () => libro.prev());
nextBtn.addEventListener('click', () => libro.next());
$('#closeBtn').addEventListener('click', () => closeReader());

// Tocar el libro: mitad derecha avanza, izquierda retrocede
host.addEventListener('click', (e) => {
  if (state !== 'reading' || swipe.moved) return;
  const r = host.getBoundingClientRect();
  const mid = r.left + r.width / 2 + parseFloat(getComputedStyle(host).getPropertyValue('--x') || 0);
  (e.clientX >= mid ? libro.next() : libro.prev());
});
// Deslizar en móvil
const swipe = { x: 0, moved: false };
host.addEventListener('pointerdown', (e) => { swipe.x = e.clientX; swipe.moved = false; });
host.addEventListener('pointerup', (e) => {
  const dx = e.clientX - swipe.x;
  if (state === 'reading' && Math.abs(dx) > 45) { swipe.moved = true; (dx < 0 ? libro.next() : libro.prev()); }
});
window.addEventListener('keydown', (e) => {
  if (state === 'intro' && (e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body) { e.preventDefault(); deliver(); }
  if (state !== 'reading') return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') libro.next();
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') libro.prev();
  else if (e.key === 'Escape') closeReader();
});

// ---------- Secuencias ----------
/** Rectángulo en pantalla de la portada del libro que sostiene Alice. */
function propScreenRect() {
  const prop = animator.prop;
  prop.updateMatrixWorld(true);
  const xs = [], ys = [];
  for (const c of prop.userData.coverCorners) {
    const p = prop.localToWorld(c.clone()).project(camera);
    xs.push((p.x + 1) / 2 * window.innerWidth);
    ys.push((1 - p.y) / 2 * window.innerHeight);
  }
  const left = Math.min(...xs), top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/** Prepara la transformación FLIP del libro DOM hacia/desde un rectángulo. */
function flyTransform(rect) {
  fly.style.transform = 'none';
  const cover = libro.leaves[0].querySelector('.front').getBoundingClientRect();
  const base = fly.getBoundingClientRect();
  fly.style.transformOrigin = `${cover.left - base.left}px ${cover.top - base.top}px`;
  const s = rect.height / cover.height;
  return `translate(${rect.left - cover.left}px, ${rect.top - cover.top}px) scale(${s})`;
}

async function waitFor(cond, timeout = 4000) {
  const t0 = performance.now();
  while (!cond() && performance.now() - t0 < timeout) await sleep(50);
}

async function deliver() {
  if (state !== 'intro' || !animator) return;
  setState('offering');
  document.body.classList.remove('hover-alice');
  shot = SHOTS.offer;
  animator.showProp(true);
  await sleep(1100);
  await waitFor(() => animator.propReady);
  await sleep(350);

  // El libro sale de su mano hacia el primer plano
  libro.layout();
  libro.reset();
  const start = flyTransform(propScreenRect());
  fly.classList.remove('animating');
  fly.style.transform = start;
  fly.getBoundingClientRect(); // forzar estilo inicial
  animator.setPropHidden(true);
  setState('opening');
  fly.classList.add('animating');
  fly.style.transform = 'none';
  await sleep(1050);

  setState('reading');
  animator.showProp(false); // Alice baja el brazo mientras se lee
  shot = SHOTS.idle;
  await sleep(450);
  if (state === 'reading' && libro.flips === 0) libro.next(); // abrir la portada
}

async function closeReader() {
  if (state !== 'reading') return;
  setState('closing');
  // Cerrar el libro
  if (libro.flips !== 0) {
    libro.flips = 0; libro.focus = 'R';
    libro.apply(false, true);
    await sleep(950);
  }
  // Alice levanta la mano para recibirlo
  shot = SHOTS.offer;
  animator.showProp(true);
  await sleep(900);
  await waitFor(() => animator.propReady);
  fly.classList.add('animating');
  fly.style.transform = flyTransform(propScreenRect());
  await sleep(1000);

  animator.setPropHidden(false);
  setState('returning');
  fly.classList.remove('animating');
  fly.style.transform = 'none';
  await sleep(1300);
  animator.showProp(false); // guarda el libro
  shot = SHOTS.idle;
  await sleep(900);
  setState('intro');
}

$('#openBtn').addEventListener('click', deliver);

// ---------- Puntero: mirada, paralaje y tocar a Alice ----------
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const gaze = new THREE.Vector3();
let pointerActive = false, lastMove = 0;

window.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  parallaxTarget.set(pointer.x, pointer.y);
  pointerActive = true;
  lastMove = performance.now();
  if (state === 'intro') document.body.classList.toggle('hover-alice', hitsAlice());
});
document.addEventListener('pointerleave', () => { pointerActive = false; parallaxTarget.set(0, 0); });
$('#stage').addEventListener('click', () => { if (state === 'intro' && hitsAlice()) deliver(); });

function hitsAlice() {
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectsBox(aliceBox);
}
function updateGaze() {
  if (!animator) return;
  const follow = pointerActive && state === 'intro' && performance.now() - lastMove < 4000;
  if (!follow) { animator.lookTarget = camera.position; return; }
  raycaster.setFromCamera(pointer, camera);
  animator.lookTarget = raycaster.ray.at(camera.position.distanceTo(camLook) * 0.85, gaze);
}

// ---------- Bucle ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  libro.layout();
  libro.apply(true);
});

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  updateCamera(dt);
  updateGaze();
  animator?.update(dt);
  cards.userData.update(t, dt);
  motes.userData.update(t, dt);
  renderer.render(scene, camera);
}
// En pruebas sin ventana requestAnimationFrame no avanza con el tiempo virtual:
// usar un temporizador para poder verificar las secuencias reales.
if (TEST === 'flow' || TEST === 'roundtrip') { const id = setInterval(() => { if (window.__frozen) clearInterval(id); else frame(); }, 1000 / 30); }
else renderer.setAnimationLoop(frame);

// ---------- Modo de prueba (capturas sin animaciones largas) ----------
//   ?test=intro            escena inicial con la cámara ya colocada
//   ?test=offer            Alice sosteniendo el libro
//   ?test=read&pos=N       libro abierto en la posición de lectura N
//   ?test=flow             secuencia real: entregar y abrir
//   ?test=roundtrip        secuencia real: entregar, abrir, cerrar y devolver
function snapCamera() {
  const p = framed(shot.pos, shot.look);
  camPos.copy(p); camLook.copy(shot.look);
}
function runTest() {
  $('#loader').style.transition = 'none';
  document.querySelectorAll('.title, .cta-wrap, #stage, .reader-ui, .close-btn').forEach((el) => { el.style.transition = 'none'; });
  if (TEST === 'offer') {
    shot = SHOTS.offer; snapCamera();
    animator.showProp(true); animator.weights.prop = 1;
    setState('offering');
  } else if (TEST === 'read') {
    shot = SHOTS.idle; snapCamera();
    host.classList.add('instant');
    setState('reading');
    const pos = +(new URLSearchParams(location.search).get('pos') || 1);
    for (let i = 0; i < pos; i++) { libro.busy = false; libro.next(); }
    libro.apply(true);
    libro.visibleFaces().forEach((f) => f.classList.add('revealed'));
    document.querySelectorAll('.ink').forEach((el) => { el.style.transition = 'none'; });
  } else if (TEST === 'flow' || TEST === 'roundtrip') {
    snapCamera();
    setState('intro');
    (async () => {
      await sleep(300);
      // &freeze=ms : congela el vuelo del libro ese tiempo después de empezar
      const freeze = +(new URLSearchParams(location.search).get('freeze') || 0);
      if (freeze) {
        (async () => {
          await waitFor(() => state === 'opening', 10000);
          await sleep(freeze);
          fly.style.transform = getComputedStyle(fly).transform;
          fly.classList.remove('animating');
          document.querySelectorAll('#stage').forEach((el) => { el.style.transition = 'none'; });
          window.__frozen = true;
        })();
      }
      await deliver();
      console.log('FLOW opened, flips', libro.flips, 'propHidden', animator.propHidden);
      if (TEST === 'roundtrip') {
        await sleep(1500);
        await closeReader();
        console.log('ROUNDTRIP done, prop weight', animator.weights.prop.toFixed(2), 'visible', animator.prop.visible);
      }
    })().catch((e) => console.log('FLOW ERROR', e.stack));
  } else {
    snapCamera();
    setState('intro');
  }
}

// Ganchos para depurar desde la consola
window.__carta = { deliver, closeReader, libro, get state() { return state; } };
