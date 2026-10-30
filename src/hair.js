import * as THREE from 'three';
import { ribbonGeometry, mesh, V3 } from './geometry.js';
import { mulberry32 } from './textures.js';

/**
 * Cabello negro azulado de Alice: casquete + mechones en cinta.
 * Todo se construye en coordenadas locales de la cabeza.
 */
export function createHair(mats) {
  const group = new THREE.Group();
  group.name = 'alice-hair';
  const rng = mulberry32(2024);

  /* ------------------------- casquete ------------------------- */
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.1235, 48, 32, Math.PI / 2 + 0.5, Math.PI * 2 - 1.0, 0, 1.66),
    mats.hair
  );
  cap.position.set(0, 0.1, -0.004);
  cap.scale.set(1.035, 1.08, 1.01);
  cap.castShadow = true;
  group.add(cap);

  // nuca
  const nape = mesh(new THREE.SphereGeometry(0.096, 24, 18), mats.hair, [0, 0.026, -0.048], [0.2, 0, 0], [1.05, 1.05, 0.9]);
  group.add(nape);

  const locks = [];
  const headCenter = V3(0, 0.1, 0);

  function addLock(points, widths, { sway = 1, phase = 0, thickness = 0.008, rootColor = 0x06060b, tipColor = 0x202235 } = {}) {
    const root = points[0].clone();
    const rel = points.map((p) => p.clone().sub(root));
    const geo = ribbonGeometry(rel, widths, thickness, 28, 6, rootColor, tipColor, headCenter.clone().sub(root));
    const m = new THREE.Mesh(geo, mats.hairLock);
    m.castShadow = true;
    m.receiveShadow = false;
    const pivot = new THREE.Group();
    pivot.position.copy(root);
    pivot.add(m);
    group.add(pivot);
    locks.push({ pivot, sway, phase, baseX: 0, baseZ: 0 });
    return pivot;
  }

  /* ------------------------- flequillo ------------------------- */
  const frontLocks = [
    {
      pts: [
        V3(0.018, 0.222, 0.06), V3(0.066, 0.206, 0.082), V3(0.097, 0.156, 0.093),
        V3(0.108, 0.096, 0.088), V3(0.101, 0.038, 0.074), V3(0.093, -0.002, 0.058),
      ],
      w: [0.018, 0.04, 0.044, 0.036, 0.024, 0.003],
    },
    {
      pts: [
        V3(-0.018, 0.224, 0.058), V3(-0.058, 0.207, 0.086), V3(-0.088, 0.163, 0.096),
        V3(-0.098, 0.105, 0.091), V3(-0.09, 0.047, 0.078), V3(-0.079, 0.005, 0.063),
      ],
      w: [0.016, 0.036, 0.042, 0.034, 0.022, 0.003],
    },
    {
      pts: [
        V3(-0.012, 0.226, 0.052), V3(-0.043, 0.205, 0.088), V3(-0.064, 0.172, 0.098),
        V3(-0.071, 0.133, 0.095), V3(-0.077, 0.096, 0.086),
      ],
      w: [0.012, 0.028, 0.031, 0.025, 0.003],
    },
    {
      pts: [
        V3(0.055, 0.215, 0.055), V3(0.018, 0.19, 0.096), V3(-0.024, 0.174, 0.104),
        V3(-0.064, 0.158, 0.095),
      ],
      w: [0.008, 0.017, 0.019, 0.002],
      opt: { sway: 0.5, thickness: 0.005 },
    },
    {
      pts: [
        V3(0.104, 0.168, 0.018), V3(0.123, 0.112, 0.045), V3(0.126, 0.042, 0.061),
        V3(0.114, -0.028, 0.058), V3(0.101, -0.088, 0.045),
      ],
      w: [0.022, 0.04, 0.038, 0.028, 0.004],
    },
    {
      pts: [
        V3(-0.104, 0.168, 0.018), V3(-0.123, 0.112, 0.045), V3(-0.126, 0.042, 0.061),
        V3(-0.114, -0.028, 0.058), V3(-0.101, -0.088, 0.045),
      ],
      w: [0.022, 0.04, 0.038, 0.028, 0.004],
    },
    {
      pts: [
        V3(0.088, 0.16, 0.0), V3(0.128, 0.1, 0.03), V3(0.145, 0.0, 0.05),
        V3(0.135, -0.12, 0.07), V3(0.112, -0.22, 0.088),
      ],
      w: [0.03, 0.046, 0.042, 0.03, 0.005],
      opt: { sway: 0.8 },
    },
    {
      pts: [
        V3(-0.088, 0.16, 0.0), V3(-0.128, 0.1, 0.03), V3(-0.145, 0.0, 0.05),
        V3(-0.135, -0.12, 0.07), V3(-0.112, -0.22, 0.088),
      ],
      w: [0.03, 0.046, 0.042, 0.03, 0.005],
      opt: { sway: 0.8 },
    },
  ];

  for (const l of frontLocks) {
    addLock(l.pts, l.w, { sway: 0.35, phase: rng() * 6.28, ...(l.opt || {}) });
  }

  /* ------------------------- nuca / melena ------------------------- */
  const BACK = 28;
  for (let i = 0; i < BACK; i++) {
    const u = i / (BACK - 1);
    const ang = -1.35 + u * 2.7;
    const jitter = (rng() - 0.5) * 0.02;
    const x = Math.sin(ang) * 0.108;
    const z = -Math.cos(ang) * 0.092;
    const rootY = 0.205 - Math.abs(ang) * 0.018 + jitter;
    const root = V3(x, rootY, z);
    const spread = 1.22 + rng() * 0.5;
    const w = 0.048 + rng() * 0.032;
    const length = 0.27 + rng() * 0.14;
    const sideWiggle = (rng() - 0.5) * 0.04;
    const pts = [
      root.clone(),
      V3(x * spread, rootY - 0.07, z * 1.22 - 0.012),
      V3(x * (spread + 0.22), 0.005, z * 1.25 - 0.03),
      V3(x * (spread + 0.42) + sideWiggle, -length * 0.55, z * 1.05 - 0.015),
      V3(x * (spread + 0.2) + sideWiggle * 1.8, -length, z * 0.75 + 0.03),
    ];
    addLock(pts, [w * 0.7, w, w * 1.08, w * 0.85, 0.004], {
      sway: 1,
      phase: rng() * Math.PI * 2,
      thickness: 0.011,
      tipColor: i % 5 === 0 ? 0x30344f : 0x1e2032,
    });
  }

  /* ------------------------- mechones sueltos ------------------------- */
  for (let i = 0; i < 5; i++) {
    const s = i % 2 === 0 ? 1 : -1;
    const x = s * (0.04 + rng() * 0.05);
    const root = V3(x, 0.228, -0.03 - rng() * 0.04);
    const pts = [
      root,
      root.clone().add(V3(x * 0.6, 0.03, -0.05)),
      root.clone().add(V3(x * 1.4 + (rng() - 0.5) * 0.05, -0.05, -0.09)),
      root.clone().add(V3(x * 1.8 + (rng() - 0.5) * 0.08, -0.14, -0.1)),
    ];
    addLock(pts, [0.012, 0.02, 0.016, 0.002], { sway: 1.4, phase: rng() * 6.28, thickness: 0.005 });
  }

  /* ------------------------- animación ------------------------- */
  function update(t, wind = 1) {
    for (const l of locks) {
      l.pivot.rotation.z = Math.sin(t * 0.75 + l.phase) * 0.022 * l.sway * wind;
      l.pivot.rotation.x = Math.cos(t * 0.58 + l.phase * 1.3) * 0.014 * l.sway * wind;
    }
  }

  return { group, update };
}
