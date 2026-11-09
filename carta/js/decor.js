// Decorado de la escena: iluminación teatral, tablero que se funde en la
// oscuridad, naipes flotantes, motas de luz y el librito que Alice entrega.
// Estética inspirada en lo victoriano/gótico, con elementos propios.
import * as THREE from 'three';

export const PALETTE = {
  night: 0x0c0709,
  blood: 0x8e0f1b,
  bone: 0xefe4d0,
  gold: 0xc9a24a,
};

// ---------- Luces ----------
export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffe9dc, 0x1a0b10, 0.35));

  // Foco cenital cálido: "escenario"
  const spot = new THREE.SpotLight(0xffe6cc, 38, 9, 0.42, 0.65, 1.6);
  spot.position.set(1.2, 4.6, 2.4);
  spot.target.position.set(0, 0.9, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  scene.add(spot, spot.target);

  // Contraluces de color (carmesí y verde azulado) para recortar la silueta
  const rimL = new THREE.DirectionalLight(0xff3d6e, 1.6);
  rimL.position.set(-3, 2.2, -2.5);
  const rimR = new THREE.DirectionalLight(0x57d6c9, 0.9);
  rimR.position.set(3, 1.8, -2.8);
  // Relleno frontal suave para la cara
  const fill = new THREE.DirectionalLight(0xffd9c2, 0.55);
  fill.position.set(-1.5, 1.6, 3);
  scene.add(rimL, rimR, fill);
  return { spot };
}

// ---------- Suelo: tablero que se desvanece ----------
export function createFloor() {
  const N = 16, S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N * S;
  const g = c.getContext('2d');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    g.fillStyle = (x + y) % 2 ? '#3a0a10' : '#8c7d6c';
    g.fillRect(x * S, y * S, S, S);
  }
  // Desgaste sutil
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 6, 1 + Math.random() * 2);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  // Máscara radial: el tablero se disuelve en la niebla
  const a = document.createElement('canvas');
  a.width = a.height = 256;
  const ga = a.getContext('2d');
  const grad = ga.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.55, '#bbb'); grad.addColorStop(1, '#000');
  ga.fillStyle = grad; ga.fillRect(0, 0, 256, 256);
  const alphaMap = new THREE.CanvasTexture(a);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4, 96),
    new THREE.MeshStandardMaterial({ map, alphaMap, transparent: true, roughness: 0.38, metalness: 0.1, depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.renderOrder = -1;
  return floor;
}

// ---------- Naipes flotantes ----------
const SUITS = [
  { s: '♥', c: '#a3121f' }, { s: '♦', c: '#a3121f' },
  { s: '♠', c: '#17090b' }, { s: '♣', c: '#17090b' },
];
const RANKS = ['A', 'K', 'Q', 'J', '10', '7', '3'];

function cardFace(rank, suit) {
  const W = 256, H = 360, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  roundRect(g, 4, 4, W - 8, H - 8, 18); g.fillStyle = '#f3ead9'; g.fill();
  g.strokeStyle = '#c9a24a'; g.lineWidth = 3; roundRect(g, 14, 14, W - 28, H - 28, 12); g.stroke();
  g.fillStyle = suit.c; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 40px Georgia, serif';
  g.fillText(rank, 40, 46); g.font = '34px Georgia, serif'; g.fillText(suit.s, 40, 84);
  g.save(); g.translate(W - 40, H - 46); g.rotate(Math.PI);
  g.font = 'bold 40px Georgia, serif'; g.fillText(rank, 0, 0); g.font = '34px Georgia, serif'; g.fillText(suit.s, 0, -38);
  g.restore();
  g.font = '150px Georgia, serif'; g.fillText(suit.s, W / 2, H / 2 + 6);
  return c;
}
function cardBack() {
  const W = 256, H = 360, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  roundRect(g, 4, 4, W - 8, H - 8, 18); g.fillStyle = '#5c0c16'; g.fill();
  g.save(); roundRect(g, 18, 18, W - 36, H - 36, 10); g.clip();
  g.strokeStyle = 'rgba(201,162,74,.55)'; g.lineWidth = 2;
  for (let i = -H; i < W + H; i += 18) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke();
    g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke();
  }
  g.restore();
  g.strokeStyle = '#c9a24a'; g.lineWidth = 4; roundRect(g, 18, 18, W - 36, H - 36, 10); g.stroke();
  g.fillStyle = '#c9a24a'; g.font = '90px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('♥', W / 2, H / 2 + 4);
  return c;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function createCards(count = 14) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.13, 0.183);
  const backTex = new THREE.CanvasTexture(cardBack());
  backTex.colorSpace = THREE.SRGBColorSpace;
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6 });
  const cards = [];
  for (let i = 0; i < count; i++) {
    const tex = new THREE.CanvasTexture(cardFace(RANKS[i % RANKS.length], SUITS[i % SUITS.length]));
    tex.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.Group();
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    const back = new THREE.Mesh(geo, backMat);
    back.rotation.y = Math.PI;
    card.add(front, back);
    card.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // Órbita alrededor de Alice, evitando el espacio entre ella y la cámara
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    card.userData = {
      angle, radius: 1.3 + Math.random() * 1.4, height: 0.35 + Math.random() * 1.9,
      speed: (0.03 + Math.random() * 0.04) * (i % 2 ? 1 : -1),
      spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.6),
      bob: Math.random() * Math.PI * 2,
    };
    card.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    group.add(card);
    cards.push(card);
  }
  group.userData.update = (t, dt) => {
    for (const c of cards) {
      const u = c.userData;
      u.angle += u.speed * dt;
      // Elipse más ancha que profunda; delante de Alice se apartan hacia los lados
      let x = Math.sin(u.angle) * u.radius * 1.25;
      let z = Math.cos(u.angle) * u.radius * 0.9 - 0.4;
      if (z > 0.2 && Math.abs(x) < 0.9) x += Math.sign(x || 1) * (0.9 - Math.abs(x));
      c.position.set(x, u.height + Math.sin(t * 0.6 + u.bob) * 0.08, z);
      c.rotation.x += u.spin.x * dt; c.rotation.y += u.spin.y * dt; c.rotation.z += u.spin.z * dt * 0.3;
    }
  };
  return group;
}

// ---------- Motas de luz ----------
export function createMotes(count = 260) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const palette = [new THREE.Color(0xffb38a), new THREE.Color(0xff5577), new THREE.Color(0xffe3a6)];
  const reset = (i, anyY) => {
    const r = 0.6 + Math.random() * 3.2, a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.sin(a) * r;
    pos[i * 3 + 1] = anyY ? Math.random() * 3 : -0.1;
    pos[i * 3 + 2] = Math.cos(a) * r - 0.6;
    vel[i * 3] = (Math.random() - 0.5) * 0.04;
    vel[i * 3 + 1] = 0.04 + Math.random() * 0.1;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
  };
  for (let i = 0; i < count; i++) {
    reset(i, true);
    const c = palette[i % palette.length];
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const sc = document.createElement('canvas'); sc.width = sc.height = 64;
  const sg = sc.getContext('2d');
  const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  sg.fillStyle = grad; sg.fillRect(0, 0, 64, 64);

  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.035, map: new THREE.CanvasTexture(sc), vertexColors: true, transparent: true,
    opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  pts.userData.update = (t, dt) => {
    for (let i = 0; i < count; i++) {
      pos[i * 3] += (vel[i * 3] + Math.sin(t * 0.7 + i) * 0.02) * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] > 3.2) reset(i, false);
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

// ---------- Librito para la mano de Alice ----------
// Origen = punto de agarre (borde inferior del libro); portada mirando a +Z.
export function createBookProp() {
  const W = 0.12, H = 0.165, D = 0.03;
  const c = document.createElement('canvas'); c.width = 512; c.height = 704;
  const g = c.getContext('2d');
  const lg = g.createLinearGradient(0, 0, 512, 704);
  lg.addColorStop(0, '#7d0d18'); lg.addColorStop(1, '#4a0710');
  g.fillStyle = lg; g.fillRect(0, 0, 512, 704);
  g.strokeStyle = '#d4af5a'; g.lineWidth = 10; g.strokeRect(28, 28, 456, 648);
  g.lineWidth = 3; g.strokeRect(48, 48, 416, 608);
  g.fillStyle = '#d4af5a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '230px Georgia, serif'; g.fillText('♥', 256, 330);
  g.font = 'italic 54px Georgia, serif'; g.fillText('Juana', 256, 540);
  const cover = new THREE.CanvasTexture(c); cover.colorSpace = THREE.SRGBColorSpace;

  const leather = new THREE.MeshStandardMaterial({ color: 0x5e0a14, roughness: 0.55 });
  const front = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.5, metalness: 0.15 });
  const pages = new THREE.MeshStandardMaterial({ color: 0xeee1c6, roughness: 0.9 });
  // Caras de BoxGeometry: +x, -x, +y, -y, +z, -z
  const book = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [pages, leather, pages, pages, front, leather]);
  book.position.set(0, H / 2 - 0.015, 0.012);
  book.castShadow = true;
  const group = new THREE.Group();
  group.name = 'BookProp';
  group.add(book);
  // Esquinas de la portada (espacio local) para proyectar el libro a pantalla
  group.userData.coverCorners = [
    new THREE.Vector3(-W / 2, -0.015, 0.012 + D / 2), new THREE.Vector3(W / 2, -0.015, 0.012 + D / 2),
    new THREE.Vector3(-W / 2, H - 0.015, 0.012 + D / 2), new THREE.Vector3(W / 2, H - 0.015, 0.012 + D / 2),
  ];
  return group;
}
