import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';

const MODEL_EXT = ['obj', 'glb', 'gltf', 'dae', 'stl', 'ply'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'gif'];

export function basename(url = '') {
  const clean = String(url).split(/[?#]/)[0];
  const part = clean.split(/[\\/]/).pop() || '';
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function extensionOf(name = '') {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function isImageFile(file) {
  return IMAGE_EXT.includes(extensionOf(file.name));
}

function pickModelFile(files) {
  const ranked = files
    .filter((f) => MODEL_EXT.includes(extensionOf(f.name)))
    .sort((a, b) => {
      const ia = MODEL_EXT.indexOf(extensionOf(a.name));
      const ib = MODEL_EXT.indexOf(extensionOf(b.name));
      if (ia !== ib) return ia - ib;
      return b.size - a.size;
    });
  return ranked[0] || null;
}

/** Reescribe rutas absolutas de Windows dentro de un .mtl a nombres simples. */
export function sanitizeMtl(text) {
  return text.replace(
    /^(\s*(?:map_\w+|bump|disp|decal|refl|norm)\s+)(.+)$/gim,
    (line, key, value) => {
      const parts = value.trim().replace(/^"|"$/g, '').split(/\s+/);
      if (!parts.length) return line;
      parts[parts.length - 1] = basename(parts[parts.length - 1]);
      return key + parts.join(' ');
    }
  );
}

/**
 * Quita del MTL las referencias a texturas que no vienen en la selección.
 * Devuelve el texto limpio y la lista de nombres ausentes.
 */
export function stripMissingMaps(mtlText, availableNames) {
  const available = new Set([...availableNames].map((n) => n.toLowerCase()));
  const missing = new Set();
  const lines = mtlText.split(/\r?\n/).filter((line) => {
    const m = line.match(/^\s*(?:map_\w+|bump|disp|decal|refl|norm)\s+(.+)$/i);
    if (!m) return true;
    const name = basename(m[1].trim().replace(/^"|"$/g, '').split(/\s+/).pop());
    if (available.has(name.toLowerCase())) return true;
    missing.add(name);
    return false;
  });
  return { text: lines.join('\n'), missing: [...missing] };
}

function prepareTexture(texture, renderer) {
  if (!texture) return;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
}

/** Espera a que el gestor termine de cargar las texturas de un MTL. */
function waitForTextures(manager, timeout = 8000) {
  return new Promise((resolve) => {
    if (!manager.itemsTotal) return resolve();
    const timer = setTimeout(resolve, timeout);
    const previous = manager.onLoad;
    manager.onLoad = () => {
      clearTimeout(timer);
      if (previous) previous();
      resolve();
    };
  });
}

/**
 * Convierte los materiales Phong del MTL a materiales PBR (físicos),
 * conservando mapas y ajustando el aspecto según el tipo de textura.
 */
export function convertMaterials(object, renderer) {
  const cache = new Map();

  function convert(mat) {
    if (!mat) return mat;
    if (cache.has(mat)) return cache.get(mat);
    if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
      cache.set(mat, mat);
      return mat;
    }

    const map = mat.map || null;
    const normalMap = mat.normalMap || mat.bumpMap || null;

    const out = new THREE.MeshPhysicalMaterial({
      name: mat.name || 'Material',
      color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
      map,
      normalMap,
      aoMap: mat.aoMap || null,
      alphaMap: mat.alphaMap || null,
      emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000),
      emissiveMap: mat.emissiveMap || null,
      roughness: 0.68,
      metalness: 0.04,
      clearcoat: 0.08,
      clearcoatRoughness: 0.45,
      sheen: 0,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0x9db7dd),
      envMapIntensity: 0.75,
      transparent: mat.transparent ?? false,
      opacity: mat.opacity ?? 1,
      alphaTest: mat.alphaTest ?? 0,
      side: mat.side ?? THREE.FrontSide,
      depthWrite: mat.depthWrite ?? true,
    });

    if (out.normalMap) {
      out.normalMap.colorSpace = THREE.NoColorSpace;
      out.normalScale.set(1, 1);
    }
    if (out.map) out.map.colorSpace = THREE.SRGBColorSpace;
    if (out.aoMap) out.aoMap.colorSpace = THREE.NoColorSpace;
    if (out.alphaMap) out.alphaMap.colorSpace = THREE.NoColorSpace;
    if (out.emissiveMap) out.emissiveMap.colorSpace = THREE.SRGBColorSpace;

    [out.map, out.normalMap, out.aoMap, out.alphaMap, out.emissiveMap].forEach((t) => prepareTexture(t, renderer));

    cache.set(mat, out);
    return out;
  }

  object.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    if (Array.isArray(o.material)) {
      o.material = o.material.map(convert);
    } else {
      o.material = convert(o.material);
    }
  });
}

/**
 * Ajusta el aspecto PBR de los materiales según el nombre de la textura base.
 * Se llama cuando las imágenes ya terminaron de cargar porque el nombre solo
 * existe en la URL de la imagen en ese momento.
 */
export function tuneMaterials(object, urlNames) {
  const presets = (label) => {
    if (/skin/.test(label)) return { roughness: 0.52, clearcoat: 0.22, metalness: 0.04, sheen: 0 };
    if (/hair/.test(label)) return { roughness: 0.38, clearcoat: 0.35, metalness: 0.06, sheen: 0.35 };
    if (/eye/.test(label)) return { roughness: 0.2, clearcoat: 1, metalness: 0.04, sheen: 0 };
    if (/(cloth|skirt)/.test(label)) return { roughness: 0.78, clearcoat: 0.4, metalness: 0.03, sheen: 0.5 };
    return null;
  };

  const srcOf = (tex) => tex?.image?.currentSrc || tex?.image?.src || tex?.name || '';
  const labelOf = (tex) => {
    const src = srcOf(tex);
    return urlNames?.get(src) || src;
  };
  const nameOf = (tex) => basename(urlNames?.get(srcOf(tex)) || srcOf(tex));

  object.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || m.userData.autoTuned) continue;
      const mapName = labelOf(m.map);
      const normalName = labelOf(m.normalMap);
      const tune = presets(`${mapName} ${normalName}`.toLowerCase());
      if (!tune) continue;
      m.roughness = tune.roughness;
      m.clearcoat = tune.clearcoat;
      m.metalness = tune.metalness;
      m.sheen = tune.sheen;
      m.needsUpdate = true;
      m.userData.autoTuned = true;
      if (m.map && !m.map.name) m.map.name = nameOf(m.map);
      if (m.normalMap && !m.normalMap.name) m.normalMap.name = nameOf(m.normalMap);
    }
  });
}

export function ensureDefaultMaterial(object, color = 0xc9d2dd) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.08,
    envMapIntensity: 0.8,
  });
  object.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    if (!o.material || (Array.isArray(o.material) && o.material.length === 0)) {
      o.material = mat;
    }
  });
}

/* ------------------------------------------------------------------------- */
/*  Carga del modelo de demostración: CHECKMATE                              */
/* ------------------------------------------------------------------------- */

export async function loadDemo({ renderer, onStatus = () => {} } = {}) {
  onStatus('Descargando Checkmate.obj…');
  const [objRes, mtlRes] = await Promise.all([
    fetch('./CHECKMATE/Checkmate.obj'),
    fetch('./CHECKMATE/Checkmate.mtl'),
  ]);
  if (!objRes.ok) throw new Error(`No se pudo leer Checkmate.obj (${objRes.status}).`);
  const [objText, mtlText] = await Promise.all([objRes.text(), mtlRes.ok ? mtlRes.text() : Promise.resolve('')]);

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => `./CHECKMATE/images/${basename(url)}`);

  let materials = null;
  if (mtlText) {
    onStatus('Preparando materiales y texturas…');
    materials = new MTLLoader(manager).setResourcePath('').parse(sanitizeMtl(mtlText), './CHECKMATE/images/');
    materials.preload();
  }

  onStatus('Construyendo geometría…');
  const obj = new OBJLoader(manager).setMaterials(materials).parse(objText);
  obj.name = 'Checkmate';
  onStatus('Cargando texturas…');
  await waitForTextures(manager);
  if (renderer) convertMaterials(obj, renderer);
  else ensureDefaultMaterial(obj);
  tuneMaterials(obj);

  return {
    object: obj,
    manager,
    label: 'Checkmate.obj',
    format: 'OBJ + MTL',
    resources: [],
  };
}

/* ------------------------------------------------------------------------- */
/*  Carga desde archivos locales (input o drag & drop)                       */
/* ------------------------------------------------------------------------- */

export async function loadFileList(fileList, { renderer, onStatus = () => {} } = {}) {
  const files = Array.from(fileList);
  if (!files.length) throw new Error('No hay archivos.');

  const modelFile = pickModelFile(files);
  if (!modelFile) {
    throw new Error('No se encontró ningún modelo (.obj, .glb, .gltf, .dae, .stl o .ply).');
  }

  const urls = [];
  const objectUrls = new Map();
  const urlNames = new Map();
  for (const f of files) {
    const url = URL.createObjectURL(f);
    urls.push(url);
    objectUrls.set(basename(f.name).toLowerCase(), url);
    urlNames.set(url, f.name);
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const name = basename(url).toLowerCase();
    return objectUrls.get(name) || url;
  });

  const ext = extensionOf(modelFile.name);
  onStatus(`Leyendo ${modelFile.name}…`);
  let object = null;
  let format = ext.toUpperCase();
  let missingTextures = [];

  try {
    if (ext === 'obj') {
      const objText = await modelFile.text();
      const mtlRef = (objText.match(/^\s*mtllib\s+(.+)$/im) || [])[1];
      let mtlFile = null;
      if (mtlRef) {
        const name = basename(mtlRef.trim());
        mtlFile = files.find((f) => basename(f.name).toLowerCase() === name.toLowerCase()) || null;
      }
      if (!mtlFile) mtlFile = files.find((f) => extensionOf(f.name) === 'mtl') || null;

      let materials = null;
      if (mtlFile) {
        onStatus('Preparando materiales…');
        const available = files.map((f) => f.name);
        const cleaned = stripMissingMaps(sanitizeMtl(await mtlFile.text()), available);
        missingTextures = cleaned.missing;
        materials = new MTLLoader(manager).setResourcePath('').parse(cleaned.text, '');
        materials.preload();
        format = `OBJ · ${mtlFile.name}`;
      }
      onStatus('Construyendo geometría…');
      object = new OBJLoader(manager).setMaterials(materials).parse(objText);
      object.name = modelFile.name.replace(/\.[^.]+$/, '');
      if (!materials) ensureDefaultMaterial(object);
      else {
        onStatus('Cargando texturas…');
        await waitForTextures(manager);
      }
    } else if (ext === 'glb' || ext === 'gltf') {
      onStatus('Leyendo escena glTF…');
      const gltf = await new Promise((resolve, reject) => {
        new GLTFLoader(manager).load(objectUrls.get(basename(modelFile.name).toLowerCase()), resolve, undefined, reject);
      });
      object = gltf.scene || gltf.scenes[0];
      object.name = modelFile.name;
      format = ext === 'glb' ? 'GLB' : 'glTF';
    } else if (ext === 'stl') {
      onStatus('Leyendo STL…');
      const buffer = await modelFile.arrayBuffer();
      const geometry = new STLLoader().parse(buffer);
      object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc9d2dd, roughness: 0.55, metalness: 0.1 }));
      object.name = modelFile.name;
      format = 'STL';
    } else if (ext === 'ply') {
      onStatus('Leyendo PLY…');
      const buffer = await modelFile.arrayBuffer();
      const geometry = new PLYLoader().parse(buffer);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const hasColors = !!geometry.attributes.color;
      const material = new THREE.MeshStandardMaterial({
        color: hasColors ? 0xffffff : 0xc9d2dd,
        vertexColors: hasColors,
        roughness: 0.55,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });
      object = new THREE.Mesh(geometry, material);
      object.name = modelFile.name;
      format = 'PLY';
    } else if (ext === 'dae') {
      onStatus('Leyendo Collada…');
      const collada = await new Promise((resolve, reject) => {
        new ColladaLoader(manager).load(objectUrls.get(basename(modelFile.name).toLowerCase()), resolve, undefined, reject);
      });
      object = collada.scene;
      object.name = modelFile.name;
      format = 'DAE';
    }
  } catch (err) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    throw err;
  }

  if (!object) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    throw new Error('El archivo no contiene una escena válida.');
  }

  convertMaterials(object, renderer);
  tuneMaterials(object, urlNames);
  if (format.startsWith('OBJ') && !files.some(isImageFile)) {
    ensureDefaultMaterial(object);
  }

  return {
    object,
    manager,
    label: modelFile.name,
    format,
    resources: urls,
    urlNames,
    missingTextures,
  };
}

/* ------------------------------------------------------------------------- */
/*  Métricas y utilidades                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Caja envolvente robusta. Box3.setFromObject usa la pose actual de los
 * SkinnedMesh, que en algunos DAE llega sin actualizar y devuelve medidas
 * erróneas; aquí usamos la geometría en su pose de enlace.
 */
export function computeBounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox || g.boundingBox.isEmpty()) return;
    tmp.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
  });
  return box;
}

export function collectStats(root) {
  let meshes = 0;
  let tris = 0;
  let verts = 0;
  const materials = new Set();
  const textures = new Set();

  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    const pos = g.attributes.position;
    verts += pos ? pos.count : 0;
    if (g.index) tris += g.index.count / 3;
    else if (pos) tris += pos.count / 3;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      materials.add(m);
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'emissiveMap']) {
        if (m[key]) textures.add(m[key]);
      }
    }
  });

  const box = computeBounds(root);
  const size = box.getSize(new THREE.Vector3());
  return { meshes, tris: Math.round(tris), verts, materials: materials.size, textures: textures.size, size, box };
}

export function disposeObject(root) {
  root.traverse((o) => {
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
}

export function findSkeletons(root) {
  const list = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) list.push(o);
  });
  return list;
}

export function guessUnitScale(box) {
  const h = box.max.y - box.min.y;
  if (!Number.isFinite(h) || h <= 0) return 1;
  if (h > 25 && h < 1000) return 0.01; // centímetros
  if (h > 1000) return 0.001; // milímetros
  return 1;
}

export function humanNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} k`;
  return String(n);
}
