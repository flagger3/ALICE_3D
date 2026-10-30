import * as THREE from 'three';
import { mesh, lathe, ribbonGeometry, tubeAlong, V3 } from './geometry.js';
import { makeBlushTexture } from './textures.js';

/**
 * Cabeza estilizada de Alice. El grupo pivota en la base del cuello
 * (y = 1.50 en coordenadas de personaje) para poder girarla.
 */
export function createHead(mats) {
  const group = new THREE.Group();
  group.name = 'alice-head';
  group.position.set(0, 1.5, 0);

  /* ---------------------------- cráneo ---------------------------- */
  const skull = lathe(
    [
      [0.012, -0.035],
      [0.035, -0.020],
      [0.062, 0.000],
      [0.082, 0.024],
      [0.096, 0.058],
      [0.104, 0.088],
      [0.108, 0.118],
      [0.106, 0.150],
      [0.095, 0.180],
      [0.065, 0.205],
      [0.030, 0.218],
      [0.0001, 0.222],
    ],
    64,
    mats.skin
  );
  skull.scale.z = 0.93;
  group.add(skull);

  // sienes / mandíbula suave
  const jaw = mesh(new THREE.SphereGeometry(0.058, 24, 18), mats.skin, [0, 0.022, 0.026], null, [1.0, 0.72, 0.82]);
  group.add(jaw);

  // orejas
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.026, 16, 12), mats.skin, [s * 0.103, 0.095, -0.002], [0, s * 0.25, 0], [0.6, 1.12, 0.8]);
    group.add(ear);
    const inner = mesh(new THREE.SphereGeometry(0.017, 12, 10), mats.skinWarm, [s * 0.104, 0.096, 0.006], [0, s * 0.25, 0], [0.45, 0.85, 0.5]);
    group.add(inner);
  }

  /* ---------------------------- ojos ---------------------------- */
  const eyes = [];
  const eyeDefs = [-1, 1];
  for (const side of eyeDefs) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.042, 0.112, 0.076);
    eye.rotation.y = -side * 0.05;
    group.add(eye);

    const sclera = mesh(new THREE.SphereGeometry(0.03, 28, 22), mats.eyeWhite, null, null, [0.96, 1.06, 0.72]);
    eye.add(sclera);

    // iris ligeramente abombado
    const irisGeo = new THREE.CircleGeometry(0.0158, 40);
    const ip = irisGeo.attributes.position;
    for (let i = 0; i < ip.count; i++) {
      const x = ip.getX(i);
      const y = ip.getY(i);
      const r2 = (x * x + y * y) / (0.0158 * 0.0158);
      ip.setZ(i, 0.005 * (1 - r2));
    }
    irisGeo.computeVertexNormals();
    const iris = new THREE.Mesh(irisGeo, mats.iris);
    iris.position.z = 0.0148;
    eye.add(iris);

    // brillos
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.0042, 16), glintMat);
    glint.position.set(0.0055, 0.0065, 0.0215);
    eye.add(glint);
    const glint2 = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 12), glintMat);
    glint2.position.set(-0.006, -0.005, 0.0218);
    eye.add(glint2);

    // párpado superior
    const lidPivot = new THREE.Group();
    eye.add(lidPivot);
    const lid = mesh(
      new THREE.SphereGeometry(0.032, 26, 18, 0, Math.PI * 2, 0, 1.32),
      mats.skin,
      null,
      null,
      [1.0, 1.06, 0.78]
    );
    lidPivot.add(lid);
    lidPivot.rotation.x = 0.28;

    // delineado y pestañas
    const lashPts = [];
    for (let i = 0; i <= 14; i++) {
      const t = -1 + (i / 14) * 2;
      lashPts.push(V3(0.0265 * t, 0.0135 + 0.0055 * (1 - t * t) - Math.abs(t) * 0.002, 0.0205 - Math.abs(t) * 0.003));
    }
    const liner = tubeAlong(lashPts, 0.0014, mats.lash, { tubular: 32, radial: 5 });
    eye.add(liner);

    for (let i = 0; i < 3; i++) {
      const tt = 0.45 + i * 0.22;
      const base = lashPts[Math.round(tt * 14)];
      const tip = base.clone().add(V3(side * (0.012 + i * 0.004), 0.011 + i * 0.002, -0.002));
      const lash = new THREE.Mesh(
        ribbonGeometry([base, base.clone().lerp(tip, 0.55).add(V3(0, 0.002, 0)), tip], [0.0016, 0.0012, 0.0002], 0.001, 8, 4, 0x08070a, 0x08070a),
        mats.lash
      );
      eye.add(lash);
    }

    // pestañas inferiores suaves
    const lower = tubeAlong(
      [V3(-0.017, -0.013, 0.021), V3(0, -0.016, 0.0225), V3(0.017, -0.013, 0.021)],
      0.0009,
      mats.lash,
      { tubular: 20, radial: 4 }
    );
    eye.add(lower);

    eyes.push({ group: eye, lidPivot });
  }

  /* ---------------------------- cejas ---------------------------- */
  for (const side of [-1, 1]) {
    const pts = [
      V3(side * 0.078, 0.148, 0.070),
      V3(side * 0.052, 0.160, 0.085),
      V3(side * 0.024, 0.154, 0.091),
    ];
    const brow = new THREE.Mesh(
      ribbonGeometry(pts, [0.0022, 0.0052, 0.0012], 0.0022, 12, 4, 0x1d1416, 0x2a1d1f),
      mats.brow
    );
    group.add(brow);
  }

  /* ---------------------------- nariz ---------------------------- */
  group.add(mesh(new THREE.SphereGeometry(0.0135, 18, 14), mats.skin, [0, 0.082, 0.100], [0.15, 0, 0], [0.9, 1.35, 1.0]));
  group.add(mesh(new THREE.SphereGeometry(0.010, 14, 10), mats.skinWarm, [0, 0.070, 0.101], [0, 0, 0], [0.7, 0.55, 0.6]));

  /* ---------------------------- labios ---------------------------- */
  const lipY = 0.041;
  group.add(mesh(new THREE.SphereGeometry(1, 24, 16), mats.lip, [0, lipY + 0.005, 0.0985], [0.1, 0, 0], [0.0255, 0.0062, 0.009]));
  group.add(mesh(new THREE.SphereGeometry(1, 20, 14), mats.lip, [0, lipY, 0.1005], [0, 0, 0], [0.0225, 0.0088, 0.0105]));
  for (const s of [-1, 1]) {
    group.add(mesh(new THREE.SphereGeometry(1, 14, 10), mats.lip, [s * 0.011, lipY + 0.009, 0.0995], null, [0.011, 0.0048, 0.007]));
  }
  group.add(
    tubeAlong(
      [V3(-0.022, lipY + 0.001, 0.1045), V3(0, lipY - 0.0015, 0.1075), V3(0.022, lipY + 0.001, 0.1045)],
      0.0011,
      mats.lipDark,
      { tubular: 24, radial: 4 }
    )
  );

  /* ---------------------------- rubor ---------------------------- */
  const blushTex = makeBlushTexture();
  const blushMat = new THREE.MeshBasicMaterial({
    map: blushTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
  });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.036), blushMat);
    b.position.set(s * 0.056, 0.083, 0.083);
    b.rotation.y = s * 0.45;
    b.rotation.z = s * 0.12;
    group.add(b);
  }

  /* ---------------------------- parpadeo ---------------------------- */
  let nextBlink = 2 + Math.random() * 3;
  let blinkT = -1;
  const OPEN = 0.28;
  const CLOSED = 1.72;

  function update(t, dt) {
    nextBlink -= dt;
    if (nextBlink <= 0) {
      blinkT = 0;
      nextBlink = 2.2 + Math.random() * 4.2;
    }
    if (blinkT >= 0) {
      blinkT += dt;
      const p = Math.min(blinkT / 0.16, 1);
      const v = Math.sin(p * Math.PI);
      const angle = OPEN + (CLOSED - OPEN) * v;
      for (const e of eyes) e.lidPivot.rotation.x = angle;
      if (p >= 1) blinkT = -1;
    }
  }

  return { group, update, skull };
}
