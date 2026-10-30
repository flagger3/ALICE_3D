import * as THREE from 'three';
import { mesh, tubeAlong, V3 } from './geometry.js';

/**
 * Vorpal Blade: hoja curva de plata, guarda con quillons, empuñadura
 * envuelta y una leve luz azul en el filo.
 */
export function createBlade(mats) {
  const g = new THREE.Group();
  g.name = 'vorpal-blade';

  const steel = new THREE.MeshPhysicalMaterial({
    color: 0xd9e4ee,
    metalness: 1,
    roughness: 0.17,
    envMapIntensity: 1.8,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    emissive: new THREE.Color(0x0a2233),
    emissiveIntensity: 0.7,
    side: THREE.DoubleSide,
  });

  const shape = new THREE.Shape();
  shape.moveTo(-0.03, 0.012);
  shape.bezierCurveTo(-0.064, 0.14, -0.054, 0.36, -0.008, 0.585);
  shape.quadraticCurveTo(0, 0.604, 0.008, 0.585);
  shape.bezierCurveTo(0.056, 0.39, 0.062, 0.16, 0.03, 0.012);
  shape.closePath();

  const bladeGeo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: 0.007,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.0025,
    bevelSegments: 3,
    curveSegments: 40,
  });
  bladeGeo.translate(0, 0, -0.0035);
  bladeGeo.computeVertexNormals();
  const blade = new THREE.Mesh(bladeGeo, steel);
  blade.castShadow = true;
  g.add(blade);

  // vaciado / grabado central
  for (const z of [0.0058, -0.0058]) {
    g.add(
      tubeAlong(
        [V3(-0.012, 0.055, z), V3(-0.02, 0.2, z), V3(-0.008, 0.4, z), V3(0.006, 0.54, z)],
        0.0014,
        mats.metalDark,
        { tubular: 40, radial: 4 }
      )
    );
    // voluta decorativa
    g.add(
      tubeAlong(
        [V3(-0.026, 0.028, z), V3(-0.036, 0.07, z), V3(-0.018, 0.1, z), V3(-0.002, 0.075, z)],
        0.0011,
        mats.metalDark,
        { tubular: 26, radial: 4 }
      )
    );
  }

  // guarda central
  const guardBlock = mesh(new THREE.BoxGeometry(0.052, 0.014, 0.024), mats.metal, [0, 0.004, 0]);
  g.add(guardBlock);

  // quillons curvos
  for (const s of [-1, 1]) {
    const pts = [
      V3(s * 0.018, 0.006, 0),
      V3(s * 0.05, 0.018, 0),
      V3(s * 0.075, 0.05, 0),
      V3(s * 0.083, 0.078, 0),
    ];
    g.add(tubeAlong(pts, 0.0065, mats.metal, { tubular: 26, radial: 7 }));
    g.add(mesh(new THREE.SphereGeometry(0.008, 12, 10), mats.metal, [s * 0.083, 0.078, 0]));
  }

  // empuñadura
  const handle = mesh(new THREE.CylinderGeometry(0.0125, 0.014, 0.15, 16), mats.leather, [0, -0.083, 0]);
  g.add(handle);
  for (let i = 0; i < 7; i++) {
    const y = -0.02 - i * 0.019;
    const ring = mesh(new THREE.TorusGeometry(0.0145, 0.0022, 6, 18), mats.leatherSoft, [0, y, 0], [Math.PI / 2, 0, 0]);
    g.add(ring);
  }
  // pomo
  g.add(mesh(new THREE.SphereGeometry(0.018, 18, 14), mats.metal, [0, -0.163, 0], null, [1, 1.15, 1]));
  g.add(mesh(new THREE.TorusGeometry(0.015, 0.003, 8, 20), mats.gold, [0, -0.148, 0], [Math.PI / 2, 0, 0]));

  // fulgor del filo
  const glowMat = mats.bladeGlow.clone();
  glowMat.opacity = 0.55;
  const edge = tubeAlong(
    [V3(0.03, 0.02, 0), V3(0.05, 0.2, 0), V3(0.045, 0.4, 0), V3(0.02, 0.56, 0)],
    0.0012,
    glowMat,
    { tubular: 40, radial: 4 }
  );
  edge.castShadow = false;
  g.add(edge);

  g.userData.grip = 0.085;
  g.userData.steel = steel;
  g.userData.edge = edge;
  return g;
}
