import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  makeMoonTexture,
  makeSparkTexture,
  makeFloorMaps,
  makeButterflyTexture,
  makeContactShadowTexture,
  mulberry32,
} from './textures.js';

/**
 * Construye el "teatro" donde vive Alice: cielo, luna, suelo ritual,
 * polvo suspendido y mariposas azules.
 */
export function createWorld(scene, renderer) {
  const rng = mulberry32(99);

  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.FogExp2(0x060a12, 0.052);

  /* ---------------- iluminación de estudio (IBL) ---------------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.22;
  room.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
  pmrem.dispose();

  /* ---------------- cielo ---------------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x04050a) },
        uMid: { value: new THREE.Color(0x0a1724) },
        uBottom: { value: new THREE.Color(0x020306) },
        uAccent: { value: new THREE.Color(0x2d6f8f) },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uTop, uMid, uBottom, uAccent;
        uniform float uTime;
        void main() {
          float h = vDir.y;
          vec3 col = mix(uBottom, uMid, smoothstep(-0.55, 0.05, h));
          col = mix(col, uTop, smoothstep(0.0, 0.85, h));
          float aurora = smoothstep(0.05, 0.55, h) * (1.0 - smoothstep(0.55, 0.9, h));
          float bands = 0.5 + 0.5 * sin(vDir.x * 5.0 + vDir.z * 3.0 + uTime * 0.08);
          col += uAccent * aurora * bands * 0.16;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  /* ---------------- estrellas ---------------- */
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 900; i++) {
    const a = rng() * Math.PI * 2;
    const r = 24 + rng() * 26;
    const y = Math.pow(rng(), 0.55) * 34 - 1;
    starPos.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xa9c9ff,
      size: 0.075,
      map: makeSparkTexture(),
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false,
    })
  );
  scene.add(stars);

  /* ---------------- luna + halo ---------------- */
  const moonTex = makeMoonTexture();
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({
      map: moonTex,
      transparent: true,
      depthWrite: false,
      color: new THREE.Color(0.95, 1.1, 1.35),
      fog: false,
    })
  );
  moon.position.set(-5.2, 6.4, -19);
  moon.renderOrder = -5;
  scene.add(moon);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSparkTexture(),
      color: 0x6fb8ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  halo.position.copy(moon.position).add(new THREE.Vector3(0, 0, 0.4));
  halo.scale.set(15, 15, 1);
  scene.add(halo);

  /* ---------------- suelo ritual ---------------- */
  const floorMaps = makeFloorMaps();
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6.4, 128),
    new THREE.MeshStandardMaterial({
      map: floorMaps.albedo,
      emissiveMap: floorMaps.emissive,
      emissive: new THREE.Color(0x2c7fa8),
      emissiveIntensity: 0.55,
      metalness: 0.35,
      roughness: 0.42,
      envMapIntensity: 0.8,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const voidFloor = new THREE.Mesh(
    new THREE.CircleGeometry(45, 64),
    new THREE.MeshStandardMaterial({
      color: 0x05070b,
      metalness: 0.1,
      roughness: 0.9,
    })
  );
  voidFloor.rotation.x = -Math.PI / 2;
  voidFloor.position.y = -0.04;
  scene.add(voidFloor);

  /* sombra de contacto suave bajo los pies */
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: makeContactShadowTexture(),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      color: 0x000000,
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.006;
  scene.add(contact);

  /* ---------------- luces ---------------- */
  const hemi = new THREE.HemisphereLight(0x7f95bb, 0x05060a, 0.4);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffe6c8, 1.35);
  key.position.set(2.8, 5.2, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  key.shadow.camera.left = -2.2;
  key.shadow.camera.right = 2.2;
  key.shadow.camera.top = 2.8;
  key.shadow.camera.bottom = -1.2;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x7cc6ff, 1.0);
  rim.position.set(-3.4, 3.6, -4.2);
  scene.add(rim);

  const fill = new THREE.PointLight(0x93a9cf, 1.6, 7, 2);
  fill.position.set(-1.8, 1.4, 2.4);
  scene.add(fill);

  const magic = new THREE.PointLight(0x54b8ff, 2.2, 4, 2);
  magic.position.set(0.6, 1.5, 0.6);
  scene.add(magic);

  /* ---------------- polvo suspendido ---------------- */
  const DUST = 700;
  const dustGeo = new THREE.BufferGeometry();
  const dustBase = new Float32Array(DUST * 3);
  const dustSeed = new Float32Array(DUST);
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 4.6;
    dustBase[i * 3] = Math.cos(a) * r;
    dustBase[i * 3 + 1] = 0.15 + rng() * 2.7;
    dustBase[i * 3 + 2] = Math.sin(a) * r;
    dustSeed[i] = rng() * Math.PI * 2;
  }
  dustPos.set(dustBase);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0x9ed4ff,
      size: 0.022,
      map: makeSparkTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  scene.add(dust);

  /* ---------------- mariposas azules ---------------- */
  const butterflyTex = makeButterflyTexture();
  const butterflies = [];
  for (let i = 0; i < 11; i++) {
    const mat = new THREE.SpriteMaterial({
      map: butterflyTex,
      color: new THREE.Color(0.45, 0.85, 1.25),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    const s = 0.085 + rng() * 0.075;
    sprite.scale.set(s, s, 1);
    scene.add(sprite);
    butterflies.push({
      sprite,
      radius: 0.55 + rng() * 1.8,
      speed: 0.16 + rng() * 0.32,
      phase: rng() * Math.PI * 2,
      y: 0.75 + rng() * 1.5,
      bob: 0.1 + rng() * 0.35,
      flap: 4 + rng() * 5,
      scale: s,
    });
  }

  /* ---------------- actualización ---------------- */
  const tmp = new THREE.Vector3();

  function update(t) {
    sky.material.uniforms.uTime.value = t;
    stars.rotation.y = t * 0.0035;
    halo.material.opacity = 0.42 + Math.sin(t * 0.55) * 0.08;

    // polvo: ascenso lento con oscilación
    for (let i = 0; i < DUST; i++) {
      const s = dustSeed[i];
      dustPos[i * 3] = dustBase[i * 3] + Math.sin(t * 0.18 + s) * 0.22;
      dustPos[i * 3 + 1] = 0.15 + ((dustBase[i * 3 + 1] + t * 0.035 + s * 0.05) % 2.9);
      dustPos[i * 3 + 2] = dustBase[i * 3 + 2] + Math.cos(t * 0.15 + s * 1.3) * 0.22;
    }
    dustGeo.attributes.position.needsUpdate = true;

    // mariposas
    for (const b of butterflies) {
      const a = t * b.speed + b.phase;
      tmp.set(
        Math.cos(a) * b.radius,
        b.y + Math.sin(t * 0.9 + b.phase) * b.bob,
        Math.sin(a) * b.radius * 0.75
      );
      b.sprite.position.copy(tmp);
      const flap = 0.35 + Math.abs(Math.sin(t * b.flap + b.phase)) * 0.8;
      b.sprite.scale.set(b.scale * flap, b.scale, 1);
      b.sprite.material.opacity = 0.55 + Math.abs(Math.sin(t * b.flap + b.phase)) * 0.4;
    }

    // la luz mágica respira
    magic.intensity = 1.8 + Math.sin(t * 1.3) * 0.5;
  }

  return { update, moon, key, floor };
}
