// Libro interactivo (DOM + CSS 3D) para la carta.
//
// Estructura: .book > .leaf × N; cada hoja tiene cara delantera (página derecha)
// y trasera (página izquierda). Pasar página = rotar la hoja -180° sobre el lomo.
//
//   caras: [portada, guarda, ...páginas, (relleno), contraportada]
//
// Modo doble (pantallas anchas): se ve el pliego completo.
// Modo simple (móvil): se ve una página; la vista se desplaza de la izquierda a
// la derecha del pliego antes de pasar la hoja.

// Tiempos (ms). La duración del giro se pasa al CSS como --flip.
const FLIP_MS = 1050;        // pasar una hoja
const CLOSE_MS = 1000;       // cada hoja al cerrar el libro
const CLOSE_STAGGER = 110;   // desfase entre hojas al cerrar (cascada)

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ORNAMENT = `<svg class="orn" viewBox="0 0 120 24" aria-hidden="true"><path d="M2 12h38M80 12h38" stroke="currentColor" stroke-width="1"/><path d="M60 3c-6 0-9 5-9 9s3 9 9 9 9-5 9-9-3-9-9-9zm0 4c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5z" fill="currentColor"/><path d="M44 12c4-5 8-5 11 0-3 5-7 5-11 0zM76 12c-4-5-8-5-11 0 3 5 7 5 11 0z" fill="currentColor"/></svg>`;
const CORNER = `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M4 56V20C4 10 10 4 20 4h36" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 50V24c0-8 6-14 14-14h26" fill="none" stroke="currentColor" stroke-width=".8"/><path d="M16 16c6 0 10 4 10 10-6 0-10-4-10-10z" fill="currentColor"/><circle cx="8" cy="8" r="2.5" fill="currentColor"/></svg>`;
const EMBLEM = `<svg class="emblem" viewBox="0 0 200 200" aria-hidden="true">
  <g fill="none" stroke="currentColor">
    <circle cx="100" cy="100" r="92" stroke-width="2"/><circle cx="100" cy="100" r="84" stroke-width=".8" stroke-dasharray="2 5"/>
    <path d="M100 34 L112 62 L100 56 L88 62 Z" fill="currentColor" stroke="none"/>
    <path d="M100 166 L112 138 L100 144 L88 138 Z" fill="currentColor" stroke="none"/>
  </g>
  <path d="M100 150c-4-4-50-30-50-62 0-17 13-28 27-28 10 0 18 6 23 14 5-8 13-14 23-14 14 0 27 11 27 28 0 32-46 58-50 62z" fill="currentColor" opacity=".95"/>
  <path d="M100 82a10 10 0 0 0-6 18l-4 22h20l-4-22a10 10 0 0 0-6-18z" fill="#4a0710"/>
  <g fill="currentColor" font-family="Georgia,serif" font-size="20" text-anchor="middle">
    <text x="30" y="107">♠</text><text x="170" y="107">♣</text>
  </g>
</svg>`;

export class Libro {
  /**
   * @param {HTMLElement} host  contenedor (se rellena)
   * @param {typeof import('../contenido.js').CARTA} carta
   */
  constructor(host, carta) {
    this.host = host;
    this.carta = carta;
    this.flips = 0;      // hojas pasadas
    this.focus = 'R';    // en modo simple: 'L' | 'R'
    this.busy = false;
    this.onchange = null;

    const faces = [this.coverHTML(), this.exlibrisHTML()];
    carta.paginas.forEach((txt, i) => faces.push(this.pageHTML(txt, i + 1, i === carta.paginas.length - 1)));
    if (faces.length % 2 === 0) faces.push(this.fillerHTML()); // la contraportada debe caer en una cara trasera
    faces.push(this.backCoverHTML());
    this.leafCount = faces.length / 2;

    host.innerHTML = `<div class="book" aria-live="polite"></div>`;
    this.book = host.querySelector('.book');
    this.leaves = [];
    for (let i = 0; i < this.leafCount; i++) {
      const leaf = document.createElement('div');
      leaf.className = 'leaf' + (i === 0 ? ' is-cover' : '') + (i === this.leafCount - 1 ? ' is-last' : '');
      leaf.innerHTML = `<div class="face front">${faces[i * 2]}</div><div class="face back">${faces[i * 2 + 1]}</div>`;
      this.book.appendChild(leaf);
      this.leaves.push(leaf);
    }
    this.faces = [...this.book.querySelectorAll('.face')];
    host.style.setProperty('--flip', FLIP_MS + 'ms');
    this.layout();
    this.apply(true);
  }

  // ---------- Contenido ----------
  coverHTML() {
    return `<div class="cover">
      <div class="cover-frame"><span class="c tl">${CORNER}</span><span class="c tr">${CORNER}</span><span class="c bl">${CORNER}</span><span class="c br">${CORNER}</span></div>
      <div class="cover-inner">
        <p class="cover-pre">Para</p>
        ${EMBLEM}
        <h2 class="cover-title">${esc(this.carta.destinataria)}</h2>
        <p class="cover-hint">toca para abrir</p>
      </div></div>`;
  }
  exlibrisHTML() {
    return `<div class="page endpaper"><div class="exlibris">
      <p>${esc(this.carta.exlibris)}</p><p class="exlibris-name">${esc(this.carta.destinataria)}</p>${ORNAMENT}
      </div></div>`;
  }
  pageHTML(text, n, isLast) {
    const list = text.trim().split(/\n\s*\n/).map((p) => p.trim());
    // En la primera página: un primer párrafo corto ("Querida Juana:") es el saludo,
    // y la letra capital pasa al siguiente párrafo.
    const salutation = n === 1 && list.length > 1 && list[0].length <= 40;
    const dropIdx = n === 1 ? (salutation ? 1 : 0) : -1;
    const paras = list.map((p, i) => {
      const cls = salutation && i === 0 ? ' salutation' : i === dropIdx ? ' dropcap' : '';
      return `<p class="ink${cls}" style="--i:${i}">${esc(p).replace(/\n/g, '<br>')}</p>`;
    }).join('');
    const sign = isLast
      ? `<div class="signature ink" style="--i:${text.split(/\n\s*\n/).length}"><p>${esc(this.carta.despedida)}</p><p class="sig-name">${esc(this.carta.firma)}</p></div>`
      : '';
    return `<div class="page"><span class="corner tl">${CORNER}</span><span class="corner br">${CORNER}</span>
      <div class="content">${paras}${sign}</div>
      <div class="folio">— ${ROMAN[n] || n} —</div></div>`;
  }
  fillerHTML() {
    return `<div class="page endpaper"><div class="exlibris fin"><p>Fin</p>${ORNAMENT}</div></div>`;
  }
  backCoverHTML() {
    return `<div class="cover back-cover"><div class="cover-frame"><span class="c tl">${CORNER}</span><span class="c tr">${CORNER}</span><span class="c bl">${CORNER}</span><span class="c br">${CORNER}</span></div>
      <div class="cover-inner"><p class="cover-pre">♥</p></div></div>`;
  }

  // ---------- Medidas ----------
  layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    this.single = vw < 820 || vw / vh < 1.05;
    const pw = this.single
      ? Math.min(430, vw - 28, (vh - 160) / 1.4) // móvil: aprovechar el ancho (letra más grande)
      : Math.min(420, (vw - 200) / 2, (vh - 170) / 1.4);
    this.pw = Math.max(220, Math.floor(pw));
    this.host.style.setProperty('--pw', this.pw + 'px');
    this.host.classList.toggle('single', this.single);
    this.fitAll();
  }

  /** Reduce la letra de las páginas cuyo texto no cabe. */
  fitAll() {
    for (const content of this.host.querySelectorAll('.content')) {
      content.style.setProperty('--fit', 1);
      for (let k = 1; k > 0.6 && content.scrollHeight > content.clientHeight + 1; k -= 0.05) {
        content.style.setProperty('--fit', k.toFixed(2));
      }
    }
  }

  // ---------- Navegación ----------
  /** Posiciones de lectura en orden. */
  get positions() {
    const p = [{ flips: 0, focus: 'R' }];
    for (let f = 1; f < this.leafCount; f++) {
      if (this.single) p.push({ flips: f, focus: 'L' }, { flips: f, focus: 'R' });
      else p.push({ flips: f, focus: 'B' });
    }
    p.push({ flips: this.leafCount, focus: 'L' });
    return p;
  }
  get index() {
    const pos = this.positions;
    const exact = pos.findIndex((p) => p.flips === this.flips && (p.focus === this.focus || p.focus === 'B'));
    // Tras cambiar entre modo simple/doble el foco puede no existir: misma hoja basta
    return exact >= 0 ? exact : pos.findIndex((p) => p.flips === this.flips);
  }
  get atStart() { return this.index <= 0; }
  get atEnd() { return this.index >= this.positions.length - 1; }

  next() { this.go(this.index + 1); }
  prev() { this.go(this.index - 1); }
  reset() {
    this.flips = 0; this.focus = 'R';
    this.faces.forEach((f) => f.classList.remove('revealed')); // la tinta vuelve a aparecer al releer
    this.apply(true);
  }

  go(i) {
    const pos = this.positions;
    if (this.busy || i < 0 || i >= pos.length) return;
    const target = pos[i];
    const flipping = target.flips !== this.flips;
    this.flips = target.flips;
    this.focus = target.focus;
    this.apply(false, flipping);
  }

  apply(instant = false, flipping = false) {
    const pw = this.pw;
    // Desplazamiento del libro para centrar lo que se lee
    let x = 0;
    if (this.flips === 0) x = -pw / 2;                    // portada (a la derecha del lomo)
    else if (this.flips === this.leafCount) x = pw / 2;   // contraportada (a la izquierda)
    else if (this.single) x = this.focus === 'L' ? pw / 2 : -pw / 2;
    this.host.style.setProperty('--x', x + 'px'); // lo heredan el libro y su sombra

    this.leaves.forEach((leaf, i) => {
      const flipped = i < this.flips;
      const was = leaf.classList.contains('flipped');
      leaf.classList.toggle('flipped', flipped);
      // Orden de apilado: las no pasadas, la primera arriba; las pasadas, la última arriba
      leaf.style.zIndex = flipped ? i + 1 : this.leafCount - i;
      if (was !== flipped && !instant) {
        leaf.classList.add('turning');
        clearTimeout(leaf._t);
        leaf._t = setTimeout(() => leaf.classList.remove('turning'), FLIP_MS);
      }
    });
    this.host.classList.toggle('instant', instant);
    this.host.classList.toggle('is-closed', this.flips === 0 || this.flips === this.leafCount);

    // Revelar la tinta de las caras visibles (tras el giro)
    const visible = this.visibleFaces();
    clearTimeout(this._reveal);
    this._reveal = setTimeout(() => visible.forEach((f) => f.classList.add('revealed')), flipping && !instant ? FLIP_MS * 0.55 : 40);

    if (flipping && !instant) { this.busy = true; setTimeout(() => { this.busy = false; }, FLIP_MS * 0.6); }
    this.onchange?.(this);
  }

  /**
   * Cierra el libro hoja a hoja, en cascada desde la de arriba hasta la portada,
   * como cuando se deja caer un montón de páginas. Devuelve la duración total (ms).
   */
  close() {
    const turned = [];
    for (let i = this.flips - 1; i >= 0; i--) turned.push(i);
    if (!turned.length) return 0;
    const total = CLOSE_MS + (turned.length - 1) * CLOSE_STAGGER;
    this.flips = 0; this.focus = 'R'; this.busy = true;
    this.host.classList.remove('instant');
    clearTimeout(this._reveal);
    // El libro se recentra (portada a la derecha del lomo) durante toda la cascada
    this.book.style.transitionDuration = total + 'ms';
    this.host.style.setProperty('--x', -this.pw / 2 + 'px');
    turned.forEach((i, k) => {
      const leaf = this.leaves[i];
      leaf.style.transitionDuration = CLOSE_MS + 'ms';
      clearTimeout(leaf._t);
      // Cada hoja conserva su sitio en la pila hasta que empieza a girar
      leaf._t = setTimeout(() => {
        leaf.classList.add('turning');
        leaf.classList.remove('flipped');
        leaf.style.zIndex = this.leafCount - i;
        leaf._t = setTimeout(() => { leaf.classList.remove('turning'); leaf.style.transitionDuration = ''; }, CLOSE_MS);
      }, k * CLOSE_STAGGER);
    });
    setTimeout(() => {
      this.book.style.transitionDuration = '';
      this.host.classList.add('is-closed');
      this.busy = false;
      this.onchange?.(this);
    }, total);
    return total;
  }

  visibleFaces() {
    const out = [];
    const left = this.flips > 0 ? this.leaves[this.flips - 1].querySelector('.back') : null;
    const right = this.flips < this.leafCount ? this.leaves[this.flips].querySelector('.front') : null;
    if (left && (!this.single || this.focus === 'L' || this.flips === this.leafCount)) out.push(left);
    if (right && (!this.single || this.focus === 'R' || this.flips === 0)) out.push(right);
    return out;
  }

  /** Texto del indicador de página. */
  get label() {
    const i = this.index, n = this.positions.length;
    if (i === 0) return 'Portada';
    if (i === n - 1) return 'Fin';
    return `${i} / ${n - 2}`;
  }
}
