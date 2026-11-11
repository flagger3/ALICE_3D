// Carta para Juana — escena principal.
//
// Estados (body[data-state]):
//   loading → intro → offering (Alice levanta el libro) → opening (el libro
//   vuela a primer plano) → reading → closing (se cierra hoja a hoja) → fading
//   (el libro se desvanece) → intro
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AliceAnimator } from './alice-animator.js';
import { addLights, createFloor, createCards, createMotes, createBookProp, pickPalette } from './decor.js';
import { Libro } from './libro.js';
import { CARTA } from '../contenido.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TEST = new URLSearchParams(location.search).get('test');
let state = 'loading';
let readingSince = 0; // ver frame(): la escena se congela mientras se lee
const setState = (s) => {
  state = s; document.body.dataset.state = s;
  if (s === 'reading') readingSince = performance.now();
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
// Móviles: menos resolución interna y sombras más pequeñas (la pantalla es pequeña
// y el ahorro de GPU se nota en la fluidez y la batería).
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
const MAX_PR = Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2);
let pixelRatio = MAX_PR;
const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE || window.devicePixelRatio < 2, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const PAL = pickPalette();
document.body.dataset.paleta = PAL.name;
renderer.toneMappingExposure = PAL.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.fog.color, PAL.fog.near, PAL.fog.far);
addLights(scene, PAL, { shadowSize: MOBILE ? 1024 : 2048 });
scene.add(createFloor(PAL));
const cards = createCards(reducedMotion ? 8 : MOBILE ? 10 : 14, PAL);
const motes = createMotes(reducedMotion ? 80 : MOBILE ? 160 : 260, PAL);
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
  await sleep(600);
  await waitFor(() => animator.propReady);
  await sleep(150);

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
  await sleep(950);

  setState('reading');
  animator.showProp(false); // Alice baja el brazo mientras se lee
  shot = SHOTS.idle;
  await sleep(250);
  if (state === 'reading' && libro.flips === 0) libro.next(); // abrir la portada
}

async function closeReader() {
  if (state !== 'reading') return;
  setState('closing');
  // 1) Cerrar el libro: las hojas caen en cascada hasta la portada
  const dur = libro.close();
  if (dur) await sleep(dur + 150);
  // 2) El libro cerrado se desvanece mientras la escena vuelve a enfocarse
  setState('fading');
  fly.classList.add('vanish');
  await sleep(1100);
  // 3) Dejarlo todo listo para volver a abrirla
  setState('intro'); // oculta el lector antes de devolverle la opacidad al libro
  fly.classList.remove('vanish', 'animating');
  fly.style.transform = 'none';
  libro.reset();
  animator.setPropHidden(false); // el libro vuelve a "aparecer" en su mano solo al ofrecerlo
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
  renderer.render(scene, camera); // al redimensionar se borra el lienzo (importa si la escena está en pausa)
  libro.layout();
  libro.apply(true);
});

// Resolución adaptativa: si el equipo no llega a ~45 fps, bajar la resolución interna
// por pasos (nunca por debajo de 1) en lugar de dejar que todo vaya a tirones.
const perf = { frames: 0, time: 0, last: performance.now() };
function adaptQuality() {
  const now = performance.now();
  const ms = now - perf.last;
  perf.last = now;
  if (ms > 250) return; // pestaña en segundo plano o pausa: no cuenta
  perf.frames++; perf.time += ms;
  if (perf.time < 2000) return;
  const fps = perf.frames / (perf.time / 1000);
  perf.frames = 0; perf.time = 0;
  if (fps < 45 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Mientras se lee, la escena queda detrás del libro, desenfocada y oscurecida:
// tras la transición se congela el último fotograma. Así la GPU queda libre para
// pasar las páginas con fluidez (el desenfoque de pantalla completa es caro si
// el lienzo cambia en cada fotograma).
const PAUSE_AFTER = 1800; // ms: deja terminar el desenfoque y que Alice baje el brazo
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  if (state === 'reading' && performance.now() - readingSince > PAUSE_AFTER) { perf.last = performance.now(); return; }
  if (!TEST) adaptQuality();
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
//   ?test=roundtrip        secuencia real: entregar, abrir, cerrar y desvanecer (&pasar=N páginas antes)
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
        // &pasar=N : pasar N páginas antes de cerrar (para ver el cierre en cascada)
        const pasar = +(new URLSearchParams(location.search).get('pasar') || 0);
        for (let i = 0; i < pasar; i++) { await waitFor(() => !libro.busy); libro.next(); await sleep(1200); }
        console.log('ROUNDTRIP flips before close', libro.flips);
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
