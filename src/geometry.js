import * as THREE from 'three';

/* Helpers de construcción geométrica --------------------------------- */

export function mesh(geometry, material, position, rotation, scale) {
  const m = new THREE.Mesh(geometry, material);
  if (position) m.position.set(position[0], position[1], position[2]);
  if (rotation) m.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function lathe(points, segments, material, { phiStart = 0, phiLength = Math.PI * 2 } = {}) {
  const vecs = points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y));
  const geo = new THREE.LatheGeometry(vecs, segments, phiStart, phiLength);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function taperedLimb(rTop, rBottom, length, material, segments = 18) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, length, segments, 1, true);
  geo.translate(0, -length / 2, 0);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function tubeAlong(points, radius, material, { tubular = 64, radial = 8, closed = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.5);
  const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return m;
}

/**
 * Mechón de pelo: cinta elíptica afinada a lo largo de una curva.
 * Devuelve geometría con colores por vértice (raíz oscura, puntas claras).
 */
export function ribbonGeometry(points, widths, thickness = 0.008, segments = 26, radialSegments = 6, rootColor = 0x08080d, tipColor = 0x222438, center = null) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const frames = curve.computeFrenetFrames(segments, false);
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const idx = [];
  const cr = new THREE.Color(rootColor);
  const ct = new THREE.Color(tipColor);
  const c = new THREE.Color();
  const tangent = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const wAxis = new THREE.Vector3();
  const fallbackN = new THREE.Vector3();
  const fallbackB = new THREE.Vector3();

  const widthAt = (t) => {
    const n = widths.length - 1;
    const f = Math.min(t * n, n - 1e-6);
    const i = Math.floor(f);
    const k = f - i;
    const base = widths[i] * (1 - k) + widths[i + 1] * k;
    // punta fina
    return base * Math.pow(1 - t, 0.18);
  };

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    curve.getTangentAt(t, tangent);

    if (center) {
      // plano del mechón tangente al cráneo: ancho alrededor, grosor radial
      radial.copy(p).sub(center);
      radial.addScaledVector(tangent, -radial.dot(tangent));
      if (radial.lengthSq() < 1e-8) radial.set(0, 0, 1);
      radial.normalize();
      wAxis.crossVectors(tangent, radial).normalize();
    } else {
      fallbackN.copy(frames.normals[i]);
      fallbackB.copy(frames.binormals[i]);
    }

    const w = widthAt(t) * 0.5;
    const th = thickness * (1 - t * 0.55) * 0.5;
    c.copy(cr).lerp(ct, Math.pow(t, 0.7));
    for (let j = 0; j < radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      if (center) {
        pos.push(
          p.x + wAxis.x * ca * w + radial.x * sa * th,
          p.y + wAxis.y * ca * w + radial.y * sa * th,
          p.z + wAxis.z * ca * w + radial.z * sa * th
        );
        nor.push(
          wAxis.x * ca + radial.x * sa,
          wAxis.y * ca + radial.y * sa,
          wAxis.z * ca + radial.z * sa
        );
      } else {
        pos.push(
          p.x + fallbackN.x * ca * w + fallbackB.x * sa * th,
          p.y + fallbackN.y * ca * w + fallbackB.y * sa * th,
          p.z + fallbackN.z * ca * w + fallbackB.z * sa * th
        );
        nor.push(
          fallbackN.x * ca + fallbackB.x * sa,
          fallbackN.y * ca + fallbackB.y * sa,
          fallbackN.z * ca + fallbackB.z * sa
        );
      }
      uv.push(t, j / radialSegments);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const cc = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      idx.push(a, cc, b, b, cc, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Falda acampanada con pliegues y bajo ondulado.
 */
export function skirtGeometry({
  yTop, yBottom, rTop, rBottom, folds = 16, foldAmp = 0.03,
  zScale = 0.9, segments = 160, rings = 34, hemWave = 0.012, hemWaveFreq = 3,
}) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const yBase = yTop + (yBottom - yTop) * t;
    const rBase = rTop + (rBottom - rTop) * Math.pow(t, 0.82);
    for (let j = 0; j <= segments; j++) {
      const u = j / segments;
      const a = u * Math.PI * 2;
      const fold = Math.sin(a * folds) * foldAmp * Math.pow(t, 1.25);
      const r = rBase + fold;
      const y = yBase + Math.sin(a * hemWaveFreq + 0.6) * hemWave * Math.pow(t, 3);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r * zScale);
      uv.push(u, 1 - t);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + 1;
      const c = a + (segments + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Parche frontal de tela (delantal, peto) que sigue la silueta del torso
 * o de la falda. `radiusAt(y)` define el radio.
 */
export function frontPatch({
  y0, y1, halfAngle0, halfAngle1, radiusAt, folds = 0, foldAmp = 0,
  zScale = 1, offset = 0.01, segments = 48, rows = 24, bottomWave = 0, waveFreq = 6,
}) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = y0 + (y1 - y0) * t;
    const half = halfAngle0 + (halfAngle1 - halfAngle0) * t;
    const rBase = radiusAt(y) + offset;
    for (let j = 0; j <= segments; j++) {
      const u = j / segments;
      const a = Math.PI / 2 + (-half + u * half * 2);
      const fold = folds ? Math.sin(a * folds) * foldAmp * t : 0;
      const r = rBase + fold;
      const wave = Math.sin(u * Math.PI * waveFreq) * bottomWave * Math.pow(t, 4);
      pos.push(Math.cos(a) * r, y + wave, Math.sin(a) * r * zScale);
      uv.push(u, 1 - t);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + 1;
      const c = a + (segments + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Punto y vector auxiliares */
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function outlinePoints({ y0, y1, halfAngle0, halfAngle1, radiusAt, zScale = 1, offset = 0.012, samples = 40 }) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const y = y0 + (y1 - y0) * t;
    const half = halfAngle0 + (halfAngle1 - halfAngle0) * t;
    const r = radiusAt(y) + offset;
    // borde derecho del parche (centrado en +Z)
    pts.push(V3(Math.cos(Math.PI / 2 + half) * r, y, Math.sin(Math.PI / 2 + half) * r * zScale));
  }
  return pts;
}
