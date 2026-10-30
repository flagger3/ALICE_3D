import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { createHead } from './head.js';
import { createHair } from './hair.js';
import { createBlade } from './blade.js';
import {
  mesh, lathe, taperedLimb, tubeAlong, ribbonGeometry,
  skirtGeometry, frontPatch, outlinePoints, V3,
} from './geometry.js';

const lerp = THREE.MathUtils.lerp;

function radiusAt(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i];
    const [r1, y1] = profile[i + 1];
    if (y >= y0 && y <= y1) {
      const k = (y - y0) / Math.max(y1 - y0, 1e-6);
      return r0 + (r1 - r0) * k;
    }
  }
  return profile[profile.length - 1][0];
}

function windify(base, uniforms, key) {
  const m = base.clone();
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      float windMask = smoothstep(1.07, 0.58, position.y);
      float sway = sin(position.x * 5.0 + position.z * 3.5 + uTime * 1.35) * 0.6
                 + sin(uTime * 0.8 + position.y * 7.0) * 0.4;
      transformed.x += sway * 0.014 * uWind * windMask;
      transformed.z += cos(position.x * 4.0 - position.z * 2.0 - uTime * 1.1) * 0.011 * uWind * windMask;
    `
    );
  };
  m.customProgramCacheKey = () => key;
  return m;
}

function makeBow(material, scale = 1) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const loop = mesh(new THREE.SphereGeometry(1, 20, 14), material, [s * 0.045 * scale, 0, 0], [0, 0, s * 0.5], [0.055 * scale, 0.032 * scale, 0.016 * scale]);
    g.add(loop);
    const tail = new THREE.Mesh(
      ribbonGeometry(
        [V3(s * 0.008, -0.008, 0), V3(s * 0.025, -0.06, -0.004), V3(s * 0.018, -0.12, -0.002), V3(s * 0.035, -0.17, 0)],
        [0.016, 0.019, 0.014, 0.004], 0.004, 14, 4, 0xe9e4d8, 0xe9e4d8
      ),
      material
    );
    tail.castShadow = true;
    g.add(tail);
  }
  g.add(mesh(new THREE.SphereGeometry(1, 16, 12), material, [0, 0, 0.006], null, [0.018 * scale, 0.021 * scale, 0.017 * scale]));
  return g;
}

export function createAlice() {
  const mats = createMaterials();
  const root = new THREE.Group();
  root.name = 'Alice';
  const uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

  const bodiceProfile = [
    [0.118, 0.995], [0.111, 1.05], [0.121, 1.11], [0.142, 1.19],
    [0.158, 1.26], [0.16, 1.315], [0.15, 1.35], [0.137, 1.372],
  ];
  const torsoProfile = [
    [0.112, 0.94], [0.105, 1.0], [0.097, 1.06], [0.105, 1.13],
    [0.125, 1.21], [0.142, 1.28], [0.145, 1.34], [0.132, 1.4],
    [0.1, 1.44], [0.065, 1.465], [0.05, 1.475],
  ];

  /* ------------------------------ torso ------------------------------ */
  const torso = lathe(torsoProfile, 64, mats.skin);
  torso.scale.z = 0.78;
  root.add(torso);

  for (const s of [-1, 1]) {
    root.add(mesh(new THREE.SphereGeometry(0.058, 20, 16), mats.skin, [s * 0.148, 1.402, 0], null, [1.05, 0.78, 0.92]));
  }

  const neck = mesh(new THREE.CylinderGeometry(0.043, 0.052, 0.1, 20), mats.skin, [0, 1.48, 0]);
  root.add(neck);

  /* ------------------------------ corpiño ------------------------------ */
  const bodice = lathe(bodiceProfile, 64, mats.dress);
  bodice.scale.z = 0.8;
  root.add(bodice);

  // ribete del escote
  const neckTrim = mesh(new THREE.TorusGeometry(0.152, 0.006, 8, 64), mats.lace, [0, 1.345, 0], [Math.PI / 2, 0, 0], [1, 0.8, 1]);
  root.add(neckTrim);

  // cordones traseros
  for (let i = 0; i < 6; i++) {
    const y = 1.075 + i * 0.042;
    root.add(
      tubeAlong(
        [V3(-0.055, y, -0.1), V3(0, y + 0.008, -0.112), V3(0.055, y, -0.1)],
        0.0016,
        mats.satin,
        { tubular: 16, radial: 4 }
      )
    );
  }

  /* ------------------------------ delantal ------------------------------ */
  const bibRadius = (y) => radiusAt(bodiceProfile, y);
  const bibGeo = frontPatch({
    y0: 1.04, y1: 1.33, halfAngle0: 0.43, halfAngle1: 0.3,
    radiusAt: bibRadius, zScale: 0.8, offset: 0.008,
    segments: 40, rows: 20,
  });
  const bib = new THREE.Mesh(bibGeo, mats.apron);
  bib.castShadow = true;
  root.add(bib);

  // ribete superior del peto
  const bibTop = [];
  for (let i = 0; i <= 24; i++) {
    const a = -0.3 + (i / 24) * 0.6;
    const r = bibRadius(1.33) + 0.01;
    bibTop.push(V3(Math.cos(Math.PI / 2 + a) * r, 1.33, Math.sin(Math.PI / 2 + a) * r * 0.8));
  }
  root.add(tubeAlong(bibTop, 0.0055, mats.lace, { tubular: 32, radial: 6 }));

  // tirantes del delantal
  for (const s of [-1, 1]) {
    root.add(
      tubeAlong(
        [
          V3(s * 0.095, 1.325, 0.082),
          V3(s * 0.108, 1.39, 0.045),
          V3(s * 0.112, 1.415, -0.005),
          V3(s * 0.09, 1.32, -0.092),
        ],
        0.012,
        mats.apron,
        { tubular: 30, radial: 8 }
      )
    );
  }

  /* ------------------------------ falda ------------------------------ */
  const skirtR = (y) => {
    const t = THREE.MathUtils.clamp((1.04 - y) / 0.44, 0, 1);
    return 0.128 + 0.312 * Math.pow(t, 0.82);
  };
  const skirtMat = windify(mats.dress, uniforms, 'alice-wind-skirt');
  const skirt = new THREE.Mesh(
    skirtGeometry({
      yTop: 1.04, yBottom: 0.6, rTop: 0.128, rBottom: 0.44,
      folds: 15, foldAmp: 0.032, zScale: 0.92, segments: 180, rings: 36,
      hemWave: 0.012,
    }),
    skirtMat
  );
  skirt.castShadow = true;
  skirt.receiveShadow = true;
  root.add(skirt);

  const petticoatMat = windify(mats.lace, uniforms, 'alice-wind-petticoat');
  const petticoat = new THREE.Mesh(
    skirtGeometry({
      yTop: 0.64, yBottom: 0.558, rTop: 0.395, rBottom: 0.452,
      folds: 26, foldAmp: 0.014, zScale: 0.92, segments: 180, rings: 8,
      hemWave: 0.006, hemWaveFreq: 12,
    }),
    petticoatMat
  );
  petticoat.castShadow = true;
  root.add(petticoat);

  // delantal de falda
  const apronMat = windify(mats.apron, uniforms, 'alice-wind-apron');
  const apronSkirtGeo = frontPatch({
    y0: 0.655, y1: 1.045, halfAngle0: 0.62, halfAngle1: 0.4,
    radiusAt: (y) => skirtR(y), folds: 15, foldAmp: 0.032,
    zScale: 0.92, offset: 0.03, segments: 72, rows: 30,
    bottomWave: 0.006, waveFreq: 8,
  });
  const apronSkirt = new THREE.Mesh(apronSkirtGeo, apronMat);
  apronSkirt.castShadow = true;
  apronSkirt.receiveShadow = true;
  root.add(apronSkirt);

  // ruedo ondulado del delantal
  const hemPts = [];
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const a = Math.PI / 2 + (-0.62 + t * 1.24);
    const r = skirtR(0.655) + 0.034 + Math.sin(a * 15) * 0.03;
    hemPts.push(V3(Math.cos(a) * r, 0.655 + Math.sin(t * Math.PI * 8) * 0.004, Math.sin(a) * r * 0.92));
  }
  root.add(tubeAlong(hemPts, 0.0045, mats.lace, { tubular: 90, radial: 6 }));

  // liguero / cinta de la cintura
  root.add(mesh(new THREE.TorusGeometry(0.132, 0.008, 8, 64), mats.satin, [0, 1.045, 0], [Math.PI / 2, 0, 0], [1, 0.86, 1]));
  const backBow = makeBow(mats.apron, 1);
  backBow.position.set(0, 1.035, -0.115);
  backBow.rotation.y = Math.PI;
  root.add(backBow);

  /* ------------------------------ piernas ------------------------------ */
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.077, 0.925, 0);
    root.add(hip);

    const thigh = taperedLimb(0.068, 0.05, 0.44, mats.skin);
    hip.add(thigh);
    hip.add(mesh(new THREE.SphereGeometry(0.068, 18, 14), mats.skin, [0, 0, 0], null, [1, 0.85, 1]));

    // media de muslo
    const thighStocking = lathe(
      [
        [0.05, -0.44], [0.056, -0.34], [0.061, -0.25], [0.066, -0.16], [0.069, -0.1],
      ],
      28,
      mats.stocking
    );
    hip.add(thighStocking);

    const knee = new THREE.Group();
    knee.position.set(0, -0.44, 0);
    hip.add(knee);
    knee.add(mesh(new THREE.SphereGeometry(0.049, 18, 14), mats.stocking, null, null, [1, 0.9, 1]));

    // pantorrilla con media
    const calfStocking = lathe(
      [
        [0.028, -0.38], [0.034, -0.3], [0.042, -0.23], [0.051, -0.15], [0.055, -0.09], [0.047, -0.01],
      ],
      28,
      mats.stocking
    );
    knee.add(calfStocking);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.38, 0);
    knee.add(ankle);

    // bota
    const boot = new THREE.Group();
    ankle.add(boot);
    const sole = mesh(new THREE.CapsuleGeometry(0.045, 0.12, 6, 18), mats.leatherSoft, [0, -0.076, 0.042], [Math.PI / 2, 0, 0], [0.95, 0.55, 1]);
    boot.add(sole);
    boot.add(mesh(new THREE.SphereGeometry(0.055, 22, 16), mats.leather, [0, -0.044, 0.038], null, [0.84, 0.76, 1.55]));
    boot.add(mesh(new THREE.CylinderGeometry(0.047, 0.053, 0.17, 20), mats.leather, [0, 0.055, 0]));
    boot.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 24), mats.leatherSoft, [0, 0.14, 0], [Math.PI / 2, 0, 0]));
    const heel = mesh(new THREE.BoxGeometry(0.056, 0.05, 0.05), mats.leather, [0, -0.072, -0.058]);
    boot.add(heel);
    for (let i = 0; i < 4; i++) {
      const y = -0.012 + i * 0.034;
      boot.add(
        tubeAlong(
          [V3(-0.035, y, 0.068), V3(0, y + 0.014, 0.076), V3(0.035, y, 0.068)],
          0.0022,
          mats.lace,
          { tubular: 12, radial: 4 }
        )
      );
      for (const s of [-1, 1]) {
        boot.add(mesh(new THREE.SphereGeometry(0.0045, 10, 8), mats.metal, [s * 0.035, y, 0.069]));
      }
    }
    // puntera brillante
    boot.add(mesh(new THREE.SphereGeometry(0.03, 16, 12), mats.leather, [0, -0.055, 0.128], null, [0.8, 0.5, 0.7]));

    legs.push({ hip, knee, ankle, side });
    hip.rotation.z = side * 0.028;
    hip.rotation.x = side > 0 ? -0.02 : 0.015;
    knee.rotation.x = side > 0 ? 0.03 : -0.02;
  }

  /* ------------------------------ brazos ------------------------------ */
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.166, 1.398, 0);
    shoulder.rotation.z = side * (side > 0 ? 0.2 : 0.14);
    shoulder.rotation.x = -0.05;
    root.add(shoulder);

    // manga abullonada
    shoulder.add(mesh(new THREE.SphereGeometry(0.075, 24, 18), mats.dress, [0, -0.005, 0], null, [1.04, 0.92, 1.0]));
    shoulder.add(mesh(new THREE.TorusGeometry(0.05, 0.013, 8, 24), mats.lace, [0, -0.068, 0], [Math.PI / 2, 0, 0]));
    shoulder.add(mesh(new THREE.TorusGeometry(0.057, 0.006, 8, 28), mats.lace, [0, -0.079, 0], [Math.PI / 2, 0, 0]));

    const upper = taperedLimb(0.042, 0.033, 0.26, mats.skin);
    upper.position.y = -0.02;
    shoulder.add(upper);
    shoulder.add(mesh(new THREE.SphereGeometry(0.044, 16, 12), mats.skin, [0, 0, 0]));

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.275, 0);
    elbow.rotation.x = -0.18;
    elbow.rotation.z = side * 0.07;
    shoulder.add(elbow);
    elbow.add(mesh(new THREE.SphereGeometry(0.034, 16, 12), mats.skin));
    const forearm = taperedLimb(0.033, 0.025, 0.235, mats.skin);
    elbow.add(forearm);

    const wrist = new THREE.Group();
    wrist.position.set(0, -0.235, 0);
    elbow.add(wrist);
    wrist.add(mesh(new THREE.TorusGeometry(0.026, 0.0045, 8, 20), mats.satin, [0, -0.005, 0], [Math.PI / 2, 0, 0]));

    const hand = new THREE.Group();
    hand.position.set(0, -0.018, 0);
    wrist.add(hand);

    const gripping = side > 0;
    hand.add(mesh(new THREE.SphereGeometry(1, 20, 16), mats.skin, [0, -0.028, 0], null, [0.035, 0.046, 0.021]));
    const curl = gripping ? -1.15 : -0.22;
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.017;
      const finger = mesh(
        new THREE.CapsuleGeometry(0.0062, 0.03, 4, 10),
        mats.skin,
        [fx, -0.07, gripping ? 0.014 : 0.002],
        [curl - f * 0.03, 0, 0]
      );
      hand.add(finger);
      if (!gripping) {
        hand.add(mesh(new THREE.SphereGeometry(0.0042, 8, 6), mats.nail, [fx, -0.093, 0.009], null, [0.9, 1.25, 0.5]));
      }
    }
    const thumb = mesh(
      new THREE.CapsuleGeometry(0.007, 0.022, 4, 10),
      mats.skin,
      [side * -0.026, -0.045, 0.014],
      [gripping ? -1.1 : -0.35, 0, side * 0.7]
    );
    hand.add(thumb);

    arms.push({ shoulder, elbow, wrist, hand, side, baseZ: side * 0.14, baseElbow: -0.18 });
  }

  /* ------------------------------ cuello / gargantilla ------------------------------ */
  root.add(mesh(new THREE.TorusGeometry(0.047, 0.008, 8, 40), mats.satin, [0, 1.505, 0], [Math.PI / 2, 0, 0]));
  const chokerBow = makeBow(mats.satin, 0.42);
  chokerBow.position.set(0, 1.5, 0.05);
  chokerBow.rotation.y = 0;
  root.add(chokerBow);

  /* ------------------------------ cabeza y pelo ------------------------------ */
  const head = createHead(mats);
  root.add(head.group);
  const hair = createHair(mats);
  head.group.add(hair.group);

  /* ------------------------------ Vorpal ------------------------------ */
  const heldBlade = createBlade(mats);
  const rightHand = arms.find((a) => a.side > 0);
  const bladeAnchor = new THREE.Group();
  bladeAnchor.position.set(0.025, -0.13, 0.015);
  bladeAnchor.rotation.set(0.12, 0, Math.PI - 0.24);
  bladeAnchor.add(heldBlade);
  rightHand.hand.add(bladeAnchor);

  const floatingBlade = createBlade(mats);
  const floatPivot = new THREE.Group();
  floatPivot.position.set(0.56, 1.0, 0.26);
  floatPivot.add(floatingBlade);
  floatingBlade.rotation.z = 0.35;
  const bladeLight = new THREE.PointLight(0x64c8ff, 0, 2.2, 2);
  bladeLight.position.set(0, 0.2, 0);
  floatPivot.add(bladeLight);
  floatPivot.visible = false;
  root.add(floatPivot);

  /* ------------------------------ animación ------------------------------ */
  let mode = 'held';
  const api = {
    root,
    height: 1.72,
    mats,
    update(t, dt, state = {}) {
      uniforms.uTime.value = t;
      uniforms.uWind.value = state.wind ?? 1;

      const lookX = state.lookX ?? 0;
      const lookY = state.lookY ?? 0;

      const k = 1 - Math.exp(-6 * Math.min(dt, 0.05));
      head.group.rotation.y = lerp(head.group.rotation.y, lookX * 0.38, k);
      head.group.rotation.x = lerp(head.group.rotation.x, -lookY * 0.16 + Math.sin(t * 0.55) * 0.012, k);
      head.group.rotation.z = Math.sin(t * 0.45) * 0.018;

      root.position.y = Math.sin(t * 1.15) * 0.004;
      root.rotation.z = Math.sin(t * 0.5) * 0.003;

      for (const a of arms) {
        const sway = Math.sin(t * 0.8 + (a.side > 0 ? 0.8 : 2.1));
        a.shoulder.rotation.z = a.baseZ + sway * 0.018;
        a.shoulder.rotation.x = -0.05 + Math.sin(t * 1.05 + a.side) * 0.012;
        a.elbow.rotation.x = a.baseElbow + Math.sin(t * 0.9 + a.side) * 0.022;
      }

      for (const l of legs) {
        l.knee.rotation.x = (l.side > 0 ? 0.03 : -0.02) + Math.sin(t * 0.35 + l.side) * 0.006;
      }

      hair.update(t, state.wind ?? 1);
      head.update(t, dt);

      if (mode === 'floating') {
        floatPivot.position.y = 1.0 + Math.sin(t * 1.1) * 0.045;
        floatPivot.rotation.y = t * 0.35;
        floatingBlade.rotation.z = 0.35 + Math.sin(t * 0.9) * 0.08;
        const glow = 1.2 + Math.sin(t * 2.2) * 0.45;
        floatingBlade.userData.steel.emissiveIntensity = glow;
        bladeLight.intensity = 2.2 + Math.sin(t * 2.2) * 0.9;
      } else {
        heldBlade.userData.steel.emissiveIntensity = 0.55 + Math.sin(t * 1.7) * 0.15;
      }
    },
    setBladeMode(next) {
      mode = next === 'floating' ? 'floating' : 'held';
      floatPivot.visible = mode === 'floating';
      heldBlade.visible = mode === 'held';
      if (mode === 'floating') {
        rightHand.hand.rotation.z = -0.25;
      } else {
        rightHand.hand.rotation.z = 0;
      }
      return mode;
    },
    get bladeMode() {
      return mode;
    },
  };

  return api;
}
