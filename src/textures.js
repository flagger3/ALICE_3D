import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function surface(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return { c, ctx };
}

function texture(canvas, { srgb = true, repeat = [1, 1], anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

function grain(ctx, w, h, amount = 10, rng = Math.random) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount * 2;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ */
/*  Tejidos                                                            */
/* ------------------------------------------------------------------ */

export function makeDressFabric() {
  const { c, ctx } = surface(512, 512);
  const rng = mulberry32(7);
  ctx.fillStyle = '#1b2442';
  ctx.fillRect(0, 0, 512, 512);

  // trama fina
  for (let i = 0; i < 512; i += 3) {
    ctx.strokeStyle = i % 6 === 0 ? 'rgba(90,110,160,.10)' : 'rgba(5,8,20,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  // vetas de terciopelo
  for (let i = 0; i < 140; i++) {
    const x = rng() * 512, y = rng() * 512, l = 30 + rng() * 90;
    ctx.strokeStyle = `rgba(${70 + rng() * 50},${85 + rng() * 50},${150 + rng() * 60},.05)`;
    ctx.lineWidth = 2 + rng() * 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 8, y + l);
    ctx.stroke();
  }
  grain(ctx, 512, 512, 7, rng);
  return texture(c, { repeat: [3, 3] });
}

export function makeApronFabric() {
  const { c, ctx } = surface(512, 512);
  const rng = mulberry32(21);
  ctx.fillStyle = '#eeeae0';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 512; i += 4) {
    ctx.strokeStyle = i % 8 === 0 ? 'rgba(160,155,140,.16)' : 'rgba(255,255,255,.20)';
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  grain(ctx, 512, 512, 5, rng);
  return texture(c, { repeat: [2, 2] });
}

/* ------------------------------------------------------------------ */
/*  Medias a rayas                                                     */
/* ------------------------------------------------------------------ */

export function makeStockingTexture() {
  const w = 512, h = 1024;
  const { c, ctx } = surface(w, h);
  const rng = mulberry32(3);
  ctx.fillStyle = '#e9e2d6';
  ctx.fillRect(0, 0, w, h);
  // rayas horizontales: 8 bandas
  ctx.fillStyle = '#191722';
  for (let i = 0; i < 8; i += 2) ctx.fillRect(0, i * (h / 8), w, h / 8);

  // nervaduras del punto
  for (let x = 0; x < w; x += 5) {
    ctx.strokeStyle = 'rgba(0,0,0,.06)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 6) {
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  grain(ctx, w, h, 9, rng);
  return texture(c, { repeat: [1, 1] });
}

/* ------------------------------------------------------------------ */
/*  Iris                                                               */
/* ------------------------------------------------------------------ */

export function makeIrisTexture() {
  const S = 512;
  const { c, ctx } = surface(S, S);
  const rng = mulberry32(11);
  const cx = S / 2, cy = S / 2;

  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, S / 2 - 2, 0, Math.PI * 2);
  ctx.clip();

  const g = ctx.createRadialGradient(cx, cy, S * 0.04, cx, cy, S * 0.5);
  g.addColorStop(0.0, '#b39a62');
  g.addColorStop(0.22, '#8fae63');
  g.addColorStop(0.55, '#5d7d42');
  g.addColorStop(0.82, '#33481f');
  g.addColorStop(1.0, '#101708');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // fibras radiales
  for (let i = 0; i < 260; i++) {
    const a = (i / 260) * Math.PI * 2 + rng() * 0.02;
    const r0 = S * (0.13 + rng() * 0.08);
    const r1 = S * (0.34 + rng() * 0.13);
    ctx.strokeStyle = rng() > 0.5
      ? `rgba(190,214,140,${0.10 + rng() * 0.25})`
      : `rgba(10,24,8,${0.12 + rng() * 0.3})`;
    ctx.lineWidth = 1 + rng() * 2.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  // anillo limbal
  ctx.strokeStyle = 'rgba(6,12,4,.95)';
  ctx.lineWidth = S * 0.075;
  ctx.beginPath();
  ctx.arc(cx, cy, S / 2 - S * 0.045, 0, Math.PI * 2);
  ctx.stroke();

  // pupila
  const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.17);
  pg.addColorStop(0, '#000');
  pg.addColorStop(0.78, '#000');
  pg.addColorStop(1, 'rgba(4,6,3,.92)');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.17, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  return texture(c, { repeat: [1, 1] });
}

/* ------------------------------------------------------------------ */
/*  Luna, chispas, mariposa, rubor, sombra                             */
/* ------------------------------------------------------------------ */

export function makeMoonTexture() {
  const S = 512;
  const { c, ctx } = surface(S, S);
  const rng = mulberry32(5);
  const cx = S / 2, cy = S / 2;

  const halo = ctx.createRadialGradient(cx, cy, S * 0.14, cx, cy, S * 0.5);
  halo.addColorStop(0, 'rgba(190,225,255,.85)');
  halo.addColorStop(0.32, 'rgba(140,190,240,.28)');
  halo.addColorStop(0.7, 'rgba(80,130,200,.07)');
  halo.addColorStop(1, 'rgba(40,80,140,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);

  const R = S * 0.29;
  const disc = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.1, cx, cy, R);
  disc.addColorStop(0, '#f4f8ff');
  disc.addColorStop(0.65, '#cfe0f4');
  disc.addColorStop(1, '#9cb6d6');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 45; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * R * 0.9;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const rr = (4 + rng() * 22) * (0.5 + rng());
    ctx.fillStyle = `rgba(120,150,185,${0.05 + rng() * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * (0.7 + rng() * 0.5), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  return texture(c, { repeat: [1, 1] });
}

export function makeSparkTexture() {
  const S = 128;
  const { c, ctx } = surface(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(215,240,255,.9)');
  g.addColorStop(0.5, 'rgba(140,205,255,.28)');
  g.addColorStop(1, 'rgba(80,150,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return texture(c, { repeat: [1, 1] });
}

export function makeButterflyTexture() {
  const S = 256;
  const { c, ctx } = surface(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  ctx.shadowColor = 'rgba(120,210,255,.9)';
  ctx.shadowBlur = 18;

  const wing = (dir) => {
    ctx.save();
    ctx.scale(dir, 1);
    const g = ctx.createLinearGradient(0, 0, 110, -70);
    g.addColorStop(0, 'rgba(225,250,255,.95)');
    g.addColorStop(0.45, 'rgba(120,205,250,.9)');
    g.addColorStop(1, 'rgba(40,110,200,.55)');
    ctx.fillStyle = g;
    // ala superior
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.bezierCurveTo(26, -58, 88, -86, 106, -34);
    ctx.bezierCurveTo(118, 0, 78, 26, 8, 16);
    ctx.closePath();
    ctx.fill();
    // ala inferior
    ctx.beginPath();
    ctx.moveTo(6, 14);
    ctx.bezierCurveTo(52, 22, 82, 48, 66, 84);
    ctx.bezierCurveTo(52, 108, 18, 62, 2, 28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,50,90,.5)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.bezierCurveTo(50, -30, 86, -44, 104, -34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, 20);
    ctx.bezierCurveTo(40, 40, 62, 62, 64, 82);
    ctx.stroke();
    ctx.restore();
  };
  wing(1);
  wing(-1);

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(235,250,255,.95)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 4, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,245,255,.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, -18);
  ctx.quadraticCurveTo(-16, -40, -24, -44);
  ctx.moveTo(2, -18);
  ctx.quadraticCurveTo(16, -40, 24, -44);
  ctx.stroke();

  return texture(c, { repeat: [1, 1] });
}

export function makeBlushTexture() {
  const S = 128;
  const { c, ctx } = surface(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(214,120,125,.55)');
  g.addColorStop(0.55, 'rgba(200,100,110,.22)');
  g.addColorStop(1, 'rgba(190,90,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return texture(c, { repeat: [1, 1] });
}

export function makeContactShadowTexture() {
  const S = 256;
  const { c, ctx } = surface(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,.72)');
  g.addColorStop(0.45, 'rgba(0,0,0,.38)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return texture(c, { repeat: [1, 1] });
}

/* ------------------------------------------------------------------ */
/*  Suelo con sigilo                                                   */
/* ------------------------------------------------------------------ */

export function makeFloorMaps() {
  const S = 1024;
  const albedo = surface(S, S);
  const emis = surface(S, S);
  const rng = mulberry32(42);
  const a = albedo.ctx;
  const e = emis.ctx;

  a.fillStyle = '#12151b';
  a.fillRect(0, 0, S, S);
  // piedra
  for (let i = 0; i < 900; i++) {
    const x = rng() * S, y = rng() * S;
    const r = 10 + rng() * 90;
    a.fillStyle = `rgba(${18 + rng() * 22},${22 + rng() * 26},${30 + rng() * 30},${0.05 + rng() * 0.12})`;
    a.beginPath();
    a.ellipse(x, y, r, r * (0.35 + rng() * 0.9), rng() * Math.PI, 0, Math.PI * 2);
    a.fill();
  }
  // grietas
  for (let i = 0; i < 40; i++) {
    let x = rng() * S, y = rng() * S;
    a.strokeStyle = 'rgba(4,6,9,.55)';
    a.lineWidth = 1 + rng() * 2;
    a.beginPath();
    a.moveTo(x, y);
    for (let j = 0; j < 12; j++) {
      x += (rng() - 0.5) * 46;
      y += (rng() - 0.5) * 46;
      a.lineTo(x, y);
    }
    a.stroke();
  }
  grain(a, S, S, 12, rng);

  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;

  const ring = (r, width, alpha) => {
    a.strokeStyle = `rgba(70,120,140,${alpha * 0.5})`;
    a.lineWidth = width;
    a.beginPath();
    a.arc(cx, cy, r, 0, Math.PI * 2);
    a.stroke();
    e.strokeStyle = `rgba(90,200,235,${alpha})`;
    e.lineWidth = width;
    e.beginPath();
    e.arc(cx, cy, r, 0, Math.PI * 2);
    e.stroke();
  };
  ring(S * 0.19, 2, 0.55);
  ring(S * 0.205, 1, 0.35);
  ring(S * 0.33, 1.5, 0.45);
  ring(S * 0.345, 3, 0.5);
  ring(S * 0.455, 2, 0.6);
  ring(S * 0.47, 1, 0.3);

  // runas entre anillos
  const runes = 16;
  for (let i = 0; i < runes; i++) {
    const ang = (i / runes) * Math.PI * 2;
    a.save();
    e.save();
    a.translate(cx, cy);
    e.translate(cx, cy);
    a.rotate(ang);
    e.rotate(ang);
    a.translate(0, -S * 0.388);
    e.translate(0, -S * 0.388);
    a.strokeStyle = 'rgba(80,150,170,.35)';
    e.strokeStyle = 'rgba(110,220,255,.55)';
    a.lineWidth = e.lineWidth = 2;
    const glyph = () => {
      const seq = [
        [0, -9, 6, 0], [6, 0, 0, 9], [0, 9, -6, 0], [-6, 0, 0, -9],
        [0, -6, 6, 4], [-6, -4, 0, 6], [0, -8, 0, 8], [-5, -5, 5, 5],
      ];
      const n = 2 + ((rng() * 4) | 0);
      const used = new Set();
      for (let k = 0; k < n; k++) {
        let idx = (rng() * seq.length) | 0;
        while (used.has(idx)) idx = (idx + 1) % seq.length;
        used.add(idx);
        const s = seq[idx];
        a.beginPath(); a.moveTo(s[0], s[1]); a.lineTo(s[2], s[3]); a.stroke();
        e.beginPath(); e.moveTo(s[0], s[1]); e.lineTo(s[2], s[3]); e.stroke();
      }
    };
    glyph();
    a.restore();
    e.restore();
  }

  // radios tenues
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    e.strokeStyle = 'rgba(70,160,200,.16)';
    e.lineWidth = 1;
    e.beginPath();
    e.moveTo(cx + Math.cos(ang) * S * 0.21, cy + Math.sin(ang) * S * 0.21);
    e.lineTo(cx + Math.cos(ang) * S * 0.45, cy + Math.sin(ang) * S * 0.45);
    e.stroke();
  }

  return {
    albedo: texture(albedo.c, { repeat: [1, 1] }),
    emissive: texture(emis.c, { repeat: [1, 1] }),
  };
}
