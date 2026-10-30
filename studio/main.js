import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

import { createUI } from './ui.js';
import {
  loadDemo, loadFileList, collectStats, disposeObject, findSkeletons,
  guessUnitScale, basename, humanNumber, tuneMaterials, computeBounds,
} from './importers.js';
import { makeContactShadowTexture } from '../src/textures.js';

/* ------------------------------------------------------------------ */
/*  Renderer                                                          */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById('view');
const viewport = document.getElementById('viewport');
const loadingEl = document.getElementById('viewer-loading');
const loadingText = document.getElementById('loading-text');
const statusEl = document.getElementById('status');
const formatEl = document.getElementById('format-info');
const fpsEl = document.getElementById('fps');
const toastEl = document.getElementById('toast');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e13);

const camera = new THREE.PerspectiveCamera(38, viewport.clientWidth / viewport.clientHeight, 0.01, 200);
camera.position.set(2.4, 1.8, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.9, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minDistance = 0.2;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.52;
controls.autoRotateSpeed = 0.7;

/* entorno IBL suave */
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const envRT = pmrem.fromScene(room, 0.04);
scene.environment = envRT.texture;
scene.environmentIntensity = 0.45;
room.traverse((o) => {
  if (o.geometry) o.geometry.dispose();
  if (o.material) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => m.dispose());
  }
});
pmrem.dispose();

/* luces */
const hemi = new THREE.HemisphereLight(0x93a7c4, 0x080a0e, 0.45);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffe9d4, 2.1);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);

const fill = new THREE.DirectionalLight(0x8fb6dd, 0.65);
scene.add(fill, fill.target);

const rim = new THREE.DirectionalLight(0xffb7c4, 0.9);
scene.add(rim, rim.target);

/* escenario */
const stage = new THREE.Group();
scene.add(stage);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(1, 96),
  new THREE.MeshStandardMaterial({
    color: 0x0d1117,
    roughness: 0.82,
    metalness: 0.16,
    envMapIntensity: 0.55,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
stage.add(floor);

const grid = new THREE.GridHelper(20, 20, 0x2c3a4b, 0x161d26);
grid.position.y = 0.003;
grid.material.transparent = true;
grid.material.opacity = 0.45;
grid.material.depthWrite = false;
stage.add(grid);

const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: makeContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.6,
    color: 0x000000,
  })
);
contact.rotation.x = -Math.PI / 2;
contact.position.y = 0.004;
stage.add(contact);

const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0x85c9f6);
selectionBox.visible = false;
selectionBox.material.transparent = true;
selectionBox.material.opacity = 0.8;
selectionBox.material.depthTest = false;
selectionBox.renderOrder = 999;
scene.add(selectionBox);

/* ------------------------------------------------------------------ */
/*  Estado                                                            */
/* ------------------------------------------------------------------ */
let asset = null;
let selected = null;
let skeletonHelper = null;
let camTween = null;
let pendingTextureMaterial = null;

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = type;
}

function toast(text, isError = false) {
  toastEl.textContent = text;
  toastEl.classList.toggle('is-error', isError);
  toastEl.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('is-on'), 4200);
}

function showLoading(text) {
  loadingText.textContent = text;
  loadingEl.classList.add('is-on');
}
function hideLoading() {
  loadingEl.classList.remove('is-on');
}

function download(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

const ui = createUI({
  onSelect: (obj) => selectObject(obj),
  onFocus: (obj) => focusObject(obj),
  onChange: () => {
    updateSelectionBox();
    if (selected) setStatus(`Editado · ${selected.name || selected.type}`);
  },
  onReplaceTexture: (material) => {
    pendingTextureMaterial = material;
    document.getElementById('texture-input').click();
  },
});
ui.resetTreeSelection();

/* ------------------------------------------------------------------ */
/*  Cámara                                                            */
/* ------------------------------------------------------------------ */
const VIEW_DIRS = {
  front: [0, 0.16, 1],
  three: [0.85, 0.32, 1],
  side: [1, 0.12, 0.02],
  top: [0.02, 1, 0.08],
  back: [-0.2, 0.2, -1],
};

function easeInOut(u) {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function flyTo(position, target, duration = 0.9, done) {
  camTween = {
    p0: camera.position.clone(),
    t0: controls.target.clone(),
    p1: position.clone(),
    t1: target.clone(),
    time: 0,
    duration,
    done,
  };
  controls.autoRotate = false;
}

function updateTween(dt) {
  if (!camTween) return;
  camTween.time += dt;
  const u = Math.min(camTween.time / camTween.duration, 1);
  const e = easeInOut(u);
  camera.position.lerpVectors(camTween.p0, camTween.p1, e);
  controls.target.lerpVectors(camTween.t0, camTween.t1, e);
  if (u >= 1) {
    const done = camTween.done;
    camTween = null;
    controls.autoRotate = document.getElementById('t-rotate').checked;
    if (done) done();
  }
}

function fitCameraToBox(box, view = 'three', animate = true) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const dir = new THREE.Vector3(...VIEW_DIRS[view]).normalize();

  const fitSize = Math.max(size.y, size.x / Math.max(camera.aspect, 0.2), size.z);
  const dist = fitSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.18 + maxDim * 0.2;

  const position = center.clone().add(dir.multiplyScalar(dist));

  camera.near = Math.max(0.001, maxDim * 0.001);
  camera.far = Math.max(50, maxDim * 100);
  camera.updateProjectionMatrix();

  controls.minDistance = maxDim * 0.12;
  controls.maxDistance = maxDim * 12;

  if (animate) {
    flyTo(position, center, 0.9);
  } else {
    camera.position.copy(position);
    controls.target.copy(center);
    controls.update();
  }
}

function currentDirection() {
  return camera.position.clone().sub(controls.target).normalize();
}

function focusObject(obj = selected) {
  if (!asset) return;
  const target = obj && obj !== asset.object ? obj : asset.wrapper;
  const box = computeBounds(target);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const dist = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.55;
  const position = center.clone().add(currentDirection().multiplyScalar(dist));
  flyTo(position, center, 0.75);
}

/* ------------------------------------------------------------------ */
/*  Escenario y encuadre                                              */
/* ------------------------------------------------------------------ */
function fitStageTo(stats) {
  const box = stats.box;
  const size = stats.size;
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);

  floor.scale.setScalar(maxDim * 5);
  grid.scale.setScalar(maxDim * 0.55);
  grid.position.set(0, 0.003, 0);
  contact.scale.set(Math.max(size.x, size.z, 0.3) * 1.9, Math.max(size.x, size.z, 0.3) * 1.9, 1);
  contact.position.set(center.x, 0.004, center.z);

  key.target.position.copy(center);
  key.target.updateMatrixWorld();
  key.position.set(center.x + maxDim * 1.5, center.y + maxDim * 2.0, center.z + maxDim * 1.6);
  key.shadow.camera.left = -maxDim * 1.1;
  key.shadow.camera.right = maxDim * 1.1;
  key.shadow.camera.top = maxDim * 1.4;
  key.shadow.camera.bottom = -maxDim * 1.1;
  key.shadow.camera.near = maxDim * 0.05;
  key.shadow.camera.far = maxDim * 7;
  key.shadow.camera.updateProjectionMatrix();

  fill.target.position.copy(center);
  fill.target.updateMatrixWorld();
  fill.position.set(center.x - maxDim * 2.2, center.y + maxDim * 0.9, center.z + maxDim * 1.8);

  rim.target.position.copy(center);
  rim.target.updateMatrixWorld();
  rim.position.set(center.x - maxDim * 2.0, center.y + maxDim * 1.6, center.z - maxDim * 2.2);
}

/* ------------------------------------------------------------------ */
/*  Selección                                                         */
/* ------------------------------------------------------------------ */
function updateSelectionBox() {
  if (!selected) {
    selectionBox.visible = false;
    return;
  }
  const visible = selected.visible && isAncestorVisible(selected, asset ? asset.wrapper : null);
  if (!visible) {
    selectionBox.visible = false;
    return;
  }
  const box = computeBounds(selected);
  if (box.isEmpty()) {
    selectionBox.visible = false;
    return;
  }
  box.expandByScalar(Math.max(box.getSize(new THREE.Vector3()).length() * 0.004, 0.002));
  selectionBox.box.copy(box);
  selectionBox.visible = true;
  selectionBox.updateMatrixWorld(true);
}

function isAncestorVisible(obj, stop) {
  let p = obj;
  while (p) {
    if (p.visible === false) return false;
    if (p === stop) break;
    p = p.parent;
  }
  return true;
}

function selectObject(obj) {
  selected = obj || null;
  ui.setSelection(selected);
  updateSelectionBox();
}

function pickAt(clientX, clientY) {
  if (!asset) return null;
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(asset.object, true);
  for (const hit of hits) {
    let o = hit.object;
    if (o.isMesh && o.visible && isAncestorVisible(o, asset.wrapper)) return o;
  }
  return null;
}

let pointerDown = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 0) pointerDown = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  if (!pointerDown || e.button !== 0) return;
  const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
  pointerDown = null;
  if (moved > 5) return;
  selectObject(pickAt(e.clientX, e.clientY));
});

/* ------------------------------------------------------------------ */
/*  Carga de modelos                                                  */
/* ------------------------------------------------------------------ */
function clearAsset() {
  if (!asset) return;
  if (skeletonHelper) {
    scene.remove(skeletonHelper);
    skeletonHelper.geometry?.dispose();
    if (skeletonHelper.material) skeletonHelper.material.dispose();
    skeletonHelper = null;
  }
  scene.remove(asset.wrapper);
  disposeObject(asset.wrapper);
  if (asset.resources) asset.resources.forEach((u) => URL.revokeObjectURL(u));
  if (asset.textureUrl) URL.revokeObjectURL(asset.textureUrl);
  asset = null;
  selected = null;
  selectionBox.visible = false;
  ui.resetTreeSelection();
}

function setAsset(result) {
  clearAsset();

  const wrapper = new THREE.Group();
  wrapper.name = result.label;
  wrapper.add(result.object);
  scene.add(wrapper);

  const rawBox = computeBounds(result.object);
  const unit = guessUnitScale(rawBox);
  wrapper.scale.setScalar(unit);
  wrapper.updateMatrixWorld(true);

  // centrar en X/Z y apoyar sobre el suelo
  let box = computeBounds(wrapper);
  wrapper.position.set(
    -(box.min.x + box.max.x) / 2,
    -box.min.y,
    -(box.min.z + box.max.z) / 2
  );
  wrapper.updateMatrixWorld(true);
  box = computeBounds(wrapper);

  asset = {
    ...result,
    wrapper,
    unit,
    box,
    name: result.label.replace(/\.[^.]+$/, ''),
  };

  ui.buildTree(result.object, result.label);
  const stats = collectStats(wrapper);
  const unitText = unit === 0.01 ? 'cm → m (auto)' : unit === 0.001 ? 'mm → m (auto)' : 'unidades del archivo';
  ui.setStats(stats, unitText);
  formatEl.textContent = result.format;
  document.getElementById('model-scale').value = String(unit);

  fitStageTo(stats);
  fitCameraToBox(stats.box, 'three', false);

  const largest = largestMesh(result.object);
  if (largest) selectObject(largest);

  const missingNote = result.missingTextures?.length
    ? ` · faltan ${result.missingTextures.length} textura${result.missingTextures.length === 1 ? '' : 's'}`
    : '';
  const okClass = result.missingTextures?.length ? '' : 'is-ok';

  setStatus(`Cargado ${result.label} · ${stats.meshes} malla${stats.meshes === 1 ? '' : 's'} · ${humanNumber(stats.tris)} triángulos${missingNote}`, okClass);
  hideLoading();

  if (result.missingTextures?.length) {
    const list = result.missingTextures;
    const sample = list.slice(0, 3).join(', ');
    const extra = list.length > 3 ? ` +${list.length - 3}` : '';
    toast(`Faltan ${list.length} textura${list.length === 1 ? '' : 's'}: ${sample}${extra}. Se usa el color base.`);
  }

  // texturas
  const isCurrent = () => asset && asset.wrapper === wrapper;
  result.manager.onLoad = () => {
    if (!isCurrent()) return;
    tuneMaterials(result.object, result.urlNames);
    ui.refresh();
    hideLoading();
    setStatus(`Listo · ${result.label} · ${humanNumber(stats.tris)} triángulos${missingNote}`, okClass);
  };
  result.manager.onError = (url) => {
    if (!isCurrent()) return;
    setStatus(`No se pudo cargar un recurso: ${basename(url)}`, 'is-error');
  };
  setTimeout(() => {
    if (!isCurrent()) return;
    tuneMaterials(result.object, result.urlNames);
    hideLoading();
    ui.refresh();
  }, 1000);
}

function largestMesh(root) {
  let best = null;
  let bestCount = -1;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const count = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
    if (count > bestCount) {
      best = o;
      bestCount = count;
    }
  });
  return best;
}

async function importFiles(fileList) {
  showLoading('Leyendo archivos…');
  setStatus('Importando archivos…');
  try {
    const result = await loadFileList(fileList, {
      renderer,
      onStatus: (msg) => {
        setStatus(msg);
        loadingText.textContent = msg;
      },
    });
    setAsset(result);
  } catch (err) {
    console.error(err);
    hideLoading();
    setStatus(err.message || 'Error al cargar los archivos.', 'is-error');
    toast(err.message || 'Error al cargar los archivos.', true);
  }
}

async function importDemo() {
  showLoading('Cargando Checkmate.obj…');
  setStatus('Cargando el modelo de demostración…');
  try {
    const result = await loadDemo({
      renderer,
      onStatus: (msg) => {
        setStatus(msg);
        loadingText.textContent = msg;
      },
    });
    setAsset(result);
  } catch (err) {
    console.error(err);
    hideLoading();
    setStatus('No se pudo cargar la demo. Abre la carpeta con un servidor local.', 'is-error');
    toast('No se pudo cargar CHECKMATE. Sirve la carpeta con un servidor local (python -m http.server).', true);
  }
}

/* ------------------------------------------------------------------ */
/*  Archivos y arrastrar/soltar                                       */
/* ------------------------------------------------------------------ */
const fileInput = document.getElementById('file-input');
const folderInput = document.getElementById('folder-input');
const textureInput = document.getElementById('texture-input');

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length) importFiles(fileInput.files);
  fileInput.value = '';
});
folderInput.addEventListener('change', () => {
  if (folderInput.files && folderInput.files.length) importFiles(folderInput.files);
  folderInput.value = '';
});

textureInput.addEventListener('change', () => {
  const file = textureInput.files && textureInput.files[0];
  textureInput.value = '';
  if (!file || !pendingTextureMaterial) return;
  const material = pendingTextureMaterial;
  pendingTextureMaterial = null;
  const url = URL.createObjectURL(file);
  new THREE.TextureLoader().load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      tex.name = file.name;
      tex.needsUpdate = true;
      if (material.userData.baseMap && material.userData.baseMap !== material.map) {
        material.userData.baseMap.dispose?.();
      }
      material.userData.baseMap = tex;
      material.map = tex;
      material.needsUpdate = true;
      ui.refresh();
      setStatus(`Textura reemplazada · ${file.name}`, 'is-ok');
      toast(`Textura aplicada: ${file.name}`);
      URL.revokeObjectURL(url);
    },
    undefined,
    () => {
      URL.revokeObjectURL(url);
      toast('No se pudo leer la imagen.', true);
    }
  );
});

function readEntries(reader) {
  return new Promise((resolve) => {
    const out = [];
    const step = () => {
      reader.readEntries((batch) => {
        if (!batch.length) resolve(out);
        else {
          out.push(...batch);
          step();
        }
      });
    };
    step();
  });
}

async function walkEntry(entry, files) {
  if (!entry) return;
  if (entry.isFile) {
    await new Promise((resolve) => entry.file((f) => { files.push(f); resolve(); }));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await readEntries(reader);
    for (const e of entries) await walkEntry(e, files);
  }
}

async function filesFromDrop(dt) {
  const items = dt.items ? Array.from(dt.items) : [];
  const entries = items
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (entries.length) {
    const files = [];
    for (const e of entries) await walkEntry(e, files);
    return files;
  }
  return Array.from(dt.files || []);
}

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  document.body.classList.add('is-dragging');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) document.body.classList.remove('is-dragging');
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('is-dragging');
  const files = await filesFromDrop(e.dataTransfer);
  if (files.length) importFiles(files);
});

/* ------------------------------------------------------------------ */
/*  Acciones de la barra                                              */
/* ------------------------------------------------------------------ */
document.querySelectorAll('[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'open-files') fileInput.click();
    else if (action === 'open-folder') folderInput.click();
    else if (action === 'load-demo') importDemo();
    else if (action === 'export') exportGlb();
    else if (action === 'shot') takeScreenshot();
    else if (action === 'toggle-left') togglePanel('left');
    else if (action === 'toggle-right') togglePanel('right');
  });
});

document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!asset) return;
    fitCameraToBox(computeBounds(asset.wrapper), btn.dataset.view, true);
  });
});

function togglePanel(side) {
  const panel = document.getElementById(side === 'left' ? 'panel-left' : 'panel-right');
  const other = document.getElementById(side === 'left' ? 'panel-right' : 'panel-left');
  other.classList.remove('is-open');
  panel.classList.toggle('is-open');
  document.getElementById('close-panels').classList.toggle('is-on', panel.classList.contains('is-open'));
}
document.getElementById('close-panels').addEventListener('click', () => {
  document.getElementById('panel-left').classList.remove('is-open');
  document.getElementById('panel-right').classList.remove('is-open');
  document.getElementById('close-panels').classList.remove('is-on');
});

/* ------------------------------------------------------------------ */
/*  Exportar / capturar                                               */
/* ------------------------------------------------------------------ */
function exportGlb() {
  if (!asset) {
    toast('No hay ningún modelo cargado.', true);
    return;
  }
  setStatus('Exportando GLB…');
  const exporter = new GLTFExporter();
  exporter.parse(
    asset.wrapper,
    (buffer) => {
      const blob = new Blob([buffer], { type: 'model/gltf-binary' });
      download(blob, `${asset.name || 'modelo'}-editado.glb`);
      setStatus(`GLB exportado · ${(blob.size / 1024 / 1024).toFixed(2)} MB`, 'is-ok');
      toast('GLB exportado. Incluye las transformaciones y materiales actuales.');
    },
    (err) => {
      console.error(err);
      setStatus('Error al exportar GLB.', 'is-error');
      toast('No se pudo exportar el GLB. Revisa la consola.', true);
    },
    { binary: true, onlyVisible: true, embedImages: true }
  );
}

function takeScreenshot() {
  if (!asset) return;
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (!blob) return;
    download(blob, `${asset.name || 'modelo'}-captura.png`);
  }, 'image/png');
}

/* ------------------------------------------------------------------ */
/*  Ajustes de escena                                                 */
/* ------------------------------------------------------------------ */
const exposure = document.getElementById('exposure');
const exposureOut = document.getElementById('exposure-out');
exposure.addEventListener('input', () => {
  const v = parseFloat(exposure.value);
  renderer.toneMappingExposure = v;
  exposureOut.textContent = v.toFixed(2);
});

const keyLight = document.getElementById('key-light');
const keyLightOut = document.getElementById('key-light-out');
keyLight.addEventListener('input', () => {
  const v = parseFloat(keyLight.value);
  key.intensity = v;
  keyLightOut.textContent = v.toFixed(2);
});

const envIntensity = document.getElementById('env-intensity');
const envIntensityOut = document.getElementById('env-intensity-out');
envIntensity.addEventListener('input', () => {
  const v = parseFloat(envIntensity.value);
  scene.environmentIntensity = v;
  envIntensityOut.textContent = v.toFixed(2);
});

const BGS = {
  studio: 0x0b0e13,
  midnight: 0x04060b,
  ink: 0x111827,
  wine: 0x1b0c12,
  paper: 0xd7dde5,
};
document.querySelectorAll('[data-bg]').forEach((swatch) => {
  swatch.addEventListener('click', () => {
    document.querySelectorAll('[data-bg]').forEach((s) => s.classList.remove('is-on'));
    swatch.classList.add('is-on');
    scene.background.setHex(BGS[swatch.dataset.bg] ?? BGS.studio);
  });
});

document.getElementById('t-floor').addEventListener('change', (e) => {
  floor.visible = e.target.checked;
  contact.visible = e.target.checked;
});
document.getElementById('t-grid').addEventListener('change', (e) => {
  grid.visible = e.target.checked;
});
document.getElementById('t-shadows').addEventListener('change', (e) => {
  renderer.shadowMap.enabled = e.target.checked;
  key.castShadow = e.target.checked;
  scene.traverse((o) => {
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { m.needsUpdate = true; });
    }
  });
});
document.getElementById('t-rotate').addEventListener('change', (e) => {
  controls.autoRotate = e.target.checked;
});
document.getElementById('t-wire').addEventListener('change', (e) => {
  if (!asset) return;
  asset.object.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      m.wireframe = e.target.checked;
      m.needsUpdate = true;
    });
  });
  ui.refresh();
});
document.getElementById('t-skeleton').addEventListener('change', (e) => {
  if (!asset) return;
  if (!e.target.checked) {
    if (skeletonHelper) skeletonHelper.visible = false;
    return;
  }
  const skins = findSkeletons(asset.object);
  if (!skins.length) {
    e.target.checked = false;
    toast('Este modelo no contiene esqueleto / skinning.', true);
    return;
  }
  if (!skeletonHelper) {
    skeletonHelper = new THREE.SkeletonHelper(asset.object);
    skeletonHelper.material.depthTest = false;
    skeletonHelper.material.transparent = true;
    skeletonHelper.material.opacity = 0.75;
    scene.add(skeletonHelper);
  }
  skeletonHelper.visible = true;
});

document.getElementById('apply-scale').addEventListener('click', () => {
  if (!asset) return;
  const value = parseFloat(document.getElementById('model-scale').value);
  if (!Number.isFinite(value) || value <= 0) {
    toast('Introduce una escala válida.', true);
    return;
  }
  asset.wrapper.scale.setScalar(value);
  asset.wrapper.position.set(0, 0, 0);
  asset.wrapper.updateMatrixWorld(true);
  const box = computeBounds(asset.wrapper);
  asset.wrapper.position.set(
    -(box.min.x + box.max.x) / 2,
    -box.min.y,
    -(box.min.z + box.max.z) / 2
  );
  asset.wrapper.updateMatrixWorld(true);
  const stats = collectStats(asset.wrapper);
  asset.box = stats.box;
  ui.setStats(stats, value === 0.01 ? 'cm → m' : value === 0.001 ? 'mm → m' : 'escala aplicada');
  fitStageTo(stats);
  updateSelectionBox();
  setStatus(`Escala aplicada · ${value}`, 'is-ok');
});

/* ------------------------------------------------------------------ */
/*  Atajos                                                            */
/* ------------------------------------------------------------------ */
document.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  const typing = /INPUT|TEXTAREA|SELECT/.test(tag);
  if (e.key === 'Escape') {
    document.getElementById('panel-left').classList.remove('is-open');
    document.getElementById('panel-right').classList.remove('is-open');
    document.getElementById('close-panels').classList.remove('is-on');
    if (!typing) selectObject(null);
  }
  if (!typing && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    focusObject(selected);
  }
  if (!typing && (e.key === 'g' || e.key === 'G')) {
    const cb = document.getElementById('t-grid');
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  }
});

/* ------------------------------------------------------------------ */
/*  Loop y resize                                                     */
/* ------------------------------------------------------------------ */
const clock = new THREE.Clock();
let fpsAccum = 0;
let fpsFrames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateTween(dt);
  controls.update();
  renderer.render(scene, camera);

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum > 0.5) {
    fpsEl.textContent = `${Math.round(fpsFrames / fpsAccum)} fps`;
    fpsAccum = 0;
    fpsFrames = 0;
  }
}

function onResize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);
if (window.ResizeObserver) new ResizeObserver(onResize).observe(viewport);

onResize();
animate();

/* carga inicial */
importDemo();

window.__STUDIO__ = { scene, camera, renderer, controls, get asset() { return asset; }, ui, THREE };
