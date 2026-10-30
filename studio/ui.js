import * as THREE from 'three';

const fmtInt = (n) => n.toLocaleString('es-ES');
const fmtDim = (v) => (v >= 1 ? `${v.toFixed(2)} m` : `${(v * 100).toFixed(1)} cm`);
const deg = (rad) => THREE.MathUtils.radToDeg(rad);
const rad = (d) => THREE.MathUtils.degToRad(d);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const b = el('button', className || 'btn btn--tiny', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function field(label, control) {
  const wrap = el('div', 'field');
  wrap.appendChild(el('span', 'field__label', label));
  wrap.appendChild(control);
  return wrap;
}

function slider(label, value, min, max, step, onInput, format = (v) => v.toFixed(2)) {
  const wrap = el('label', 'slider');
  wrap.appendChild(el('span', '', label));
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = el('output', '', format(value));
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  wrap.append(input, out);
  return wrap;
}

function check(label, checked, onChange) {
  const l = el('label', 'check');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  l.append(input, document.createTextNode(label));
  return l;
}

export function createUI(hooks) {
  const treeEl = document.getElementById('tree');
  const transformEl = document.getElementById('transform');
  const materialEl = document.getElementById('material');
  const statsEl = document.getElementById('stats');
  const countEl = document.getElementById('scene-count');
  const selectionLabel = document.getElementById('selection-label');
  const modelName = document.getElementById('model-name');
  const fileLabel = document.getElementById('file-label');
  const focusBtn = document.getElementById('focus-btn');

  let modelRoot = null;
  let selected = null;
  let rowMap = new Map();
  const initial = new WeakMap();

  /* --------------------------- jerarquía --------------------------- */
  function hasMeshChild(obj) {
    let found = false;
    obj.traverse((o) => {
      if (o.isMesh) found = true;
    });
    return found;
  }

  function captureInitial(root) {
    root.traverse((o) => {
      initial.set(o, {
        position: o.position.clone(),
        quaternion: o.quaternion.clone(),
        scale: o.scale.clone(),
        visible: o.visible,
      });
    });
  }

  function rowLabel(obj) {
    if (!obj.name) return obj.isMesh ? 'Malla' : 'Grupo';
    return obj.name;
  }

  function triCount(obj) {
    const g = obj.geometry;
    if (!g) return 0;
    const pos = g.attributes.position;
    return Math.round((g.index ? g.index.count : pos ? pos.count : 0) / 3);
  }

  function buildTree(root, label) {
    modelRoot = root;
    selected = null;
    rowMap.clear();
    treeEl.innerHTML = '';
    captureInitial(root);

    let meshCount = 0;
    root.traverse((o) => { if (o.isMesh) meshCount++; });
    countEl.textContent = `${meshCount} malla${meshCount === 1 ? '' : 's'}`;
    modelName.textContent = label || root.name || 'Modelo';
    fileLabel.textContent = label || '—';
    fileLabel.title = label || '';
    selectionLabel.textContent = 'Sin selección';
    selectionLabel.className = 'chip';

    const walk = (obj, depth) => {
      if (obj.isBone) return;
      const isMesh = !!obj.isMesh;
      if (!isMesh && depth > 0 && !hasMeshChild(obj)) return;

      const row = el('div', 'tree-node');
      row.style.setProperty('--depth', String(Math.min(depth, 6)));
      row.setAttribute('role', 'treeitem');
      row.tabIndex = 0;
      if (obj.visible === false) row.classList.add('is-hidden');

      const glyph = el('span', 'tree-node__glyph', isMesh ? '▣' : '◈');
      const name = el('span', 'tree-node__name', rowLabel(obj));
      name.title = rowLabel(obj);
      const meta = el('span', 'tree-node__count', isMesh ? fmtInt(triCount(obj)) : '');
      row.append(glyph, name, meta);

      if (depth > 0 || isMesh) {
        const eye = el('button', 'tree-node__eye', obj.visible === false ? '○' : '◉');
        eye.type = 'button';
        eye.title = obj.visible === false ? 'Mostrar' : 'Ocultar';
        eye.addEventListener('click', (e) => {
          e.stopPropagation();
          obj.visible = !obj.visible;
          eye.textContent = obj.visible ? '◉' : '○';
          row.classList.toggle('is-hidden', !obj.visible);
          hooks.onChange();
        });
        row.appendChild(eye);
      }

      const select = () => {
        hooks.onSelect(obj);
      };
      row.addEventListener('click', select);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      });

      treeEl.appendChild(row);
      rowMap.set(obj.uuid, row);

      const children = obj.children || [];
      for (const child of children) {
        if (child.isBone || child.isLight || child.isCamera) continue;
        walk(child, depth + 1);
      }
    };

    walk(root, 0);
  }

  function setSelection(obj) {
    selected = obj;
    for (const row of rowMap.values()) row.classList.remove('is-selected');
    if (obj && rowMap.has(obj.uuid)) rowMap.get(obj.uuid).classList.add('is-selected');

    if (obj) {
      selectionLabel.textContent = rowLabel(obj);
      selectionLabel.className = 'chip chip--sel';
    } else {
      selectionLabel.textContent = 'Sin selección';
      selectionLabel.className = 'chip';
    }
    renderTransform();
    renderMaterial();
  }

  /* --------------------------- transformar --------------------------- */
  function renderTransform() {
    transformEl.innerHTML = '';
    if (!selected) {
      transformEl.appendChild(el('p', 'empty', 'Selecciona una malla o un grupo en la escena para editar su transformación.'));
      return;
    }
    const obj = selected;

    const head = el('div', 'mat-head');
    const info = el('div');
    info.appendChild(el('div', 'mat-name', rowLabel(obj)));
    info.appendChild(el('div', 'mat-type', obj.isMesh ? 'Malla' : 'Grupo'));
    head.appendChild(info);
    transformEl.appendChild(head);

    const makeRow = (label, getter, setter, step, decimals = 3) => {
      const row = el('div', 'transform-row');
      row.appendChild(el('span', '', label));
      const xyz = el('div', 'xyz');
      ['X', 'Y', 'Z'].forEach((axis) => {
        const wrap = el('label');
        wrap.appendChild(el('b', '', axis));
        const input = document.createElement('input');
        input.type = 'number';
        input.step = String(step);
        input.value = getter(axis).toFixed(decimals);
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          if (Number.isFinite(v)) {
            setter(axis, v);
            hooks.onChange();
          }
        });
        wrap.appendChild(input);
        xyz.appendChild(wrap);
      });
      row.appendChild(xyz);
      transformEl.appendChild(row);
    };

    const axisIndex = { X: 'x', Y: 'y', Z: 'z' };
    makeRow('Posición', (a) => obj.position[axisIndex[a]], (a, v) => { obj.position[axisIndex[a]] = v; }, 0.01);
    makeRow('Rotación°', (a) => deg(obj.rotation[axisIndex[a]]), (a, v) => { obj.rotation[axisIndex[a]] = rad(v); }, 1, 1);
    makeRow('Escala', (a) => obj.scale[axisIndex[a]], (a, v) => { obj.scale[axisIndex[a]] = Math.max(0.0001, v); }, 0.01);

    const actions = el('div', 'inline');
    actions.style.marginTop = '10px';
    actions.appendChild(button('Enfocar', 'btn btn--tiny', () => hooks.onFocus(obj)));
    actions.appendChild(button('Restablecer', 'btn btn--tiny', () => {
      const snap = initial.get(obj);
      if (!snap) return;
      obj.position.copy(snap.position);
      obj.quaternion.copy(snap.quaternion);
      obj.scale.copy(snap.scale);
      obj.visible = snap.visible;
      hooks.onChange();
      renderTransform();
      setSelection(obj);
    }));
    transformEl.appendChild(actions);
  }

  /* --------------------------- material --------------------------- */
  function meshesUsing(material) {
    let n = 0;
    if (!modelRoot) return n;
    modelRoot.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.includes(material)) n++;
    });
    return n;
  }

  function textureData(texture) {
    if (!texture) return null;
    const img = texture.image;
    const src = img && (img.currentSrc || img.src);
    const fallback = src ? src.split(/[\\/]/).pop().split('?')[0] : '';
    const name = texture.name || fallback || 'textura';
    return { src, name };
  }

  function renderMaterial() {
    materialEl.innerHTML = '';
    const mesh = selected && selected.isMesh ? selected : (selected && selected.isGroup ? firstMesh(selected) : null);
    if (!mesh) {
      materialEl.appendChild(el('p', 'empty', 'Selecciona una malla para editar su material. Los grupos no tienen material propio.'));
      return;
    }
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material) {
      materialEl.appendChild(el('p', 'empty', 'Esta malla no tiene material.'));
      return;
    }

    const isPhysical = material.isMeshPhysicalMaterial;
    const baseMap = material.map || material.userData.baseMap || null;
    const baseNormal = material.normalMap || material.userData.baseNormal || null;
    const tex = textureData(baseMap);

    const head = el('div', 'mat-head');
    const swatch = el('span', 'mat-swatch');
    swatch.style.background = `#${material.color ? material.color.getHexString() : 'ffffff'}`;
    head.appendChild(swatch);
    const info = el('div');
    info.appendChild(el('div', 'mat-name', material.name || 'Material'));
    const shared = meshesUsing(material);
    info.appendChild(el('div', 'mat-type', `${isPhysical ? 'Physical' : material.type} · ${shared} malla${shared === 1 ? '' : 's'}`));
    head.appendChild(info);
    materialEl.appendChild(head);

    // color
    const colorLine = el('div', 'color-line');
    const color = document.createElement('input');
    color.type = 'color';
    color.value = `#${material.color ? material.color.getHexString() : 'ffffff'}`;
    color.addEventListener('input', () => {
      material.color.set(color.value);
      swatch.style.background = color.value;
      hooks.onChange();
    });
    colorLine.appendChild(color);
    colorLine.appendChild(el('span', 'mat-type', tex ? tex.name : 'Sin textura base'));
    materialEl.appendChild(field('Color base', colorLine));

    // sliders
    materialEl.appendChild(slider('Rugosidad', material.roughness ?? 0.7, 0, 1, 0.01, (v) => {
      material.roughness = v;
      material.needsUpdate = true;
    }));
    materialEl.appendChild(slider('Metalicidad', material.metalness ?? 0, 0, 1, 0.01, (v) => {
      material.metalness = v;
    }));
    if (isPhysical) {
      materialEl.appendChild(slider('Clearcoat', material.clearcoat ?? 0, 0, 1, 0.01, (v) => {
        material.clearcoat = v;
      }));
    }
    materialEl.appendChild(slider('Opacidad', material.opacity ?? 1, 0, 1, 0.01, (v) => {
      material.opacity = v;
      material.transparent = v < 1 || material.userData.forceTransparent === true;
      material.needsUpdate = true;
    }));
    if (material.normalMap || baseNormal) {
      const strength = material.normalScale ? material.normalScale.x : 1;
      materialEl.appendChild(slider('Fuerza normal', strength, 0, 2, 0.01, (v) => {
        material.normalScale.set(v, v);
      }));
    }

    // textura base
    if (tex) {
      const row = el('div', 'tex-row');
      if (tex.src) {
        const img = document.createElement('img');
        img.src = tex.src;
        img.alt = tex.name;
        img.loading = 'lazy';
        row.appendChild(img);
      }
      const meta = el('div', 'tex-row__meta');
      meta.appendChild(el('b', '', tex.name));
      meta.appendChild(el('span', '', 'mapa base'));
      row.appendChild(meta);
      row.appendChild(button('Cambiar', 'btn btn--tiny', () => hooks.onReplaceTexture(material)));
      materialEl.appendChild(row);
    }

    // normal map info
    const normal = textureData(baseNormal);
    if (normal) {
      const row = el('div', 'tex-row');
      if (normal.src) {
        const img = document.createElement('img');
        img.src = normal.src;
        img.alt = normal.name;
        row.appendChild(img);
      }
      const meta = el('div', 'tex-row__meta');
      meta.appendChild(el('b', '', normal.name));
      meta.appendChild(el('span', '', 'normal map'));
      row.appendChild(meta);
      materialEl.appendChild(row);
    }

    // opciones
    const opts = el('div');
    opts.style.marginTop = '10px';
    if (baseMap) {
      opts.appendChild(check('Mapa base', !!material.map, (on) => {
        if (on) {
          material.map = material.userData.baseMap || baseMap;
        } else {
          material.userData.baseMap = material.map || baseMap;
          material.map = null;
        }
        material.needsUpdate = true;
        hooks.onChange();
        renderMaterial();
      }));
    }
    if (baseNormal) {
      opts.appendChild(check('Normal map', !!material.normalMap, (on) => {
        if (on) {
          material.normalMap = material.userData.baseNormal || baseNormal;
        } else {
          material.userData.baseNormal = material.normalMap || baseNormal;
          material.normalMap = null;
        }
        material.needsUpdate = true;
        hooks.onChange();
        renderMaterial();
      }));
    }
    opts.appendChild(check('Wireframe', !!material.wireframe, (on) => {
      material.wireframe = on;
      material.needsUpdate = true;
      hooks.onChange();
    }));
    opts.appendChild(check('Sombras planas', !!material.flatShading, (on) => {
      material.flatShading = on;
      material.needsUpdate = true;
      hooks.onChange();
    }));
    opts.appendChild(check('Doble cara', material.side === THREE.DoubleSide, (on) => {
      material.side = on ? THREE.DoubleSide : THREE.FrontSide;
      material.needsUpdate = true;
      hooks.onChange();
    }));
    materialEl.appendChild(opts);
  }

  function firstMesh(root) {
    let found = null;
    root.traverse((o) => {
      if (!found && o.isMesh) found = o;
    });
    return found;
  }

  function refresh() {
    renderMaterial();
  }

  /* --------------------------- métricas --------------------------- */
  function setStats(stats, unitText = '') {
    const size = stats.size;
    statsEl.innerHTML = '';
    const rows = [
      ['Mallas', fmtInt(stats.meshes)],
      ['Triángulos', fmtInt(stats.tris)],
      ['Vértices', fmtInt(stats.verts)],
      ['Materiales', fmtInt(stats.materials)],
      ['Dimensiones', `${fmtDim(size.x)} × ${fmtDim(size.y)} × ${fmtDim(size.z)}`],
    ];
    for (const [k, v] of rows) {
      const row = el('div');
      row.appendChild(el('dt', '', k));
      row.appendChild(el('dd', '', v));
      statsEl.appendChild(row);
    }
    if (unitText) {
      const row = el('div');
      row.appendChild(el('dt', '', 'Unidad'));
      row.appendChild(el('dd', '', unitText));
      statsEl.appendChild(row);
    }
  }

  focusBtn.addEventListener('click', () => hooks.onFocus(selected));

  return {
    buildTree,
    setSelection,
    setStats,
    refresh,
    get selected() { return selected; },
    get modelRoot() { return modelRoot; },
    select: (obj) => { selected = obj; },
    resetTreeSelection: () => setSelection(null),
  };
}
