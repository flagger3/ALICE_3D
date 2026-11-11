// Capa de animación procedural para Checkmate.glb (rig 3ds Max Biped, sin clips).
//
// Cada frame se restaura la pose de reposo (T-pose) y se aplican capas:
//   tronco (balanceo/respiración) → brazos y dedos → cabeza/mirada →
//   cara (ojos, párpados, boca) → movimiento secundario (pelo, falda, lazo, cintas).
//
// Dos tipos de rotación, ambos en ESPACIO DEL MODELO (independiente de cómo se
// coloque el modelo en la escena):
//   rotateModel(): ejes del modelo en el estado actual. Para tronco, brazos,
//                  cuello y cadenas secundarias (la gravedad/inercia es "global").
//   rotateRest():  ejes que el hueso tenía en reposo, arrastrados por sus padres.
//                  Para cara y dedos: si la cabeza gira, el párpado sigue
//                  cerrándose "hacia abajo de la cara", no hacia abajo del mundo.
//
// Convenciones (modelo mirando a +Z, Y arriba):
//   +Y gira hacia +X (izquierda del personaje) · -X mira arriba · -Z baja el brazo izquierdo
import * as THREE from 'three';

const DEG = THREE.MathUtils.DEG2RAD;
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp; // amortiguación exponencial independiente del framerate

// ---- Valores calibrados con capturas (grados / metros) ----
const POSE = { upperArmDown: 70, upperArmFwd: 10, forearmBend: 15 };
// Curvatura relajada por falange [base, media, punta]; del índice al meñique aumenta.
const FINGER_CURL = { thumb: [4, 8, 6], index: [10, 14, 9], step: [3, 3, 2] };
// Brazo derecho sosteniendo un objeto (cartel, libro…): antebrazo hacia delante,
// puño cerrado, y la muñeca lo mece suavemente (amplitud configurable por objeto).
const HOLD = { wave: 9, waveHz: 0.45 };
// Estilos de agarre (ajustados con capturas):
//   fist — puño cerrado alrededor de algo fino (el palito de un cartel)
//   palm — palma hacia arriba con los dedos relajados: ofrecer algo grueso (un libro)
// twist: giro del antebrazo sobre su eje. grip: dónde va el origen del objeto,
// como fracción muñeca→base del dedo corazón más desplazamientos en metros.
// El pulgar apunta a +Z en T-pose: se cierra rotando sobre X de reposo, no sobre Z.
const HOLD_STYLES = {
  fist: {
    upperArmDown: 52, upperArmFwd: 25, forearmBend: 92, twist: 0,
    finger: [55, 70, 45], thumbX: [25, 30, 20],
    grip: { along: 1.0, up: -0.02, inward: 0.01, fwd: 0 },
  },
  // Palma hacia la cámara, dedos casi rectos por detrás del objeto; el objeto se
  // alinea con el plano de la palma (alignToPalm) para que los dedos no lo atraviesen.
  //   grip.up / grip.fwd se miden entonces en ejes de la palma (dedos / normal).
  palm: {
    upperArmDown: 60, upperArmFwd: 18, forearmBend: 92, twist: 90, wristUp: 0.8,
    finger: [2, 3, 2], thumbX: [0, 0, 0],
    grip: { along: 0.7, up: -0.06, inward: 0, fwd: 0.019, alignToPalm: true },
  },
};
const BLINK = { upperLid: 52, lowerLid: -12, duration: 0.16 };
const GAZE = { headYaw: 25, headPitch: 12, eyeYaw: 22, eyePitch: 14, neckShare: 0.35 };
const MOUTH = {
  jawOpen: 14, jawRound: 6,            // grados
  cornerWide: [0.006, 0.002, -0.002],  // desplazamiento comisura izq. (la der. se refleja en X)
  cornerRound: [-0.007, 0, 0.002],
  upperOpen: [0, 0.0015, 0],
  upperRound: [0, 0.001, 0.003],
};

// ---- Cadenas secundarias: muelle amortiguado por cadena ----
//   freq (Hz) y zeta definen el muelle; gain escala la inercia; wind es una brisa (m/s²).
const CHAIN_TYPES = {
  hair:   { freq: 1.1, zeta: 0.25, gain: 1.0, max: 12, wind: 0.25 },
  ribbon: { freq: 0.8, zeta: 0.15, gain: 1.3, max: 22, wind: 0.6 },
  bow:    { freq: 2.0, zeta: 0.30, gain: 0.6, max: 8,  wind: 0.2 },
  skirt:  { freq: 2.6, zeta: 0.45, gain: 0.35, max: 3, wind: 0 },  // la falda es rígida (torre)
};
const seq = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}_${i + 1}`);
const CHAINS = [
  ...['front_right', 'front_left'].map((s) => ['hair', seq('hair_' + s, 3)]),
  ...['back_right', 'back_left', 'back_middle'].map((s) => ['hair', seq('hair_' + s, 4)]),
  ['ribbon', seq('Ribbon_Right', 6)], ['ribbon', seq('Ribbon_Left', 6)],
  ['bow', seq('Bow_Right', 2)], ['bow', seq('Bow_Left', 2)],
  ...['Left_Side', 'Left_Back', 'Right_Back', 'Left_Front', 'Right_Side', 'Right_Front']
    .map((s) => ['skirt', seq('Skirt_' + s, 6)]),
];

// ---- Colisiones del pelo ----
// Esferas (centro en espacio del modelo con la pose relajada, radio en m) pegadas a un hueso,
// medidas sobre la malla: hombreras, trapecios y espalda alta. Si un mechón entra
// en una, se gira su raíz hacia fuera lo justo para que quede apoyado encima.
const HAIR_COLLIDERS = [
  { bone: 'Arm_Left_UpperArm',  c: [0.135, 1.30, 0.0],   r: 0.085 },
  { bone: 'Arm_Right_UpperArm', c: [-0.135, 1.30, 0.0],  r: 0.085 },
  { bone: 'Bip01-Spine2',       c: [0.06, 1.30, -0.01],  r: 0.075 },
  { bone: 'Bip01-Spine2',       c: [-0.06, 1.30, -0.01], r: 0.075 },
  { bone: 'Bip01-Spine2',       c: [0, 1.27, -0.005],    r: 0.055 },
  { bone: 'Arm_Left_UpperArm',  c: [0.12, 1.28, -0.04],  r: 0.06 },  // parte trasera de las hombreras
  { bone: 'Arm_Right_UpperArm', c: [-0.12, 1.28, -0.04], r: 0.06 },
  // Pecho: ajustado para no tocar el pelo en reposo (sus puntas van metidas en el corpiño)
  { bone: 'Bip01-Spine2',       c: [0, 1.22, 0.04],      r: 0.104 },
];
const HAIR_COLLISION = { samples: 18, margin: 0.004, iterations: 3, maxAngle: 40 };

export class AliceAnimator {
  /** @param {THREE.Object3D} root  gltf.scene de Checkmate.glb (en reposo) */
  constructor(root) {
    this.root = root;
    this.bones = {};
    root.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });

    const required = [
      'Bip01-Spine', 'Bip01-Spine1', 'Bip01-Spine2', 'Bip01-Neck', 'Bip01-Head', 'Skirt_Root',
      'Arm_Left_UpperArm', 'Arm_Right_UpperArm', 'Arm_Left_Forearm', 'Arm_Right_Forearm',
      'Face_Eye_Left', 'Face_Eye_Right', 'Face_UpperLids', 'Face_LowerLids',
      'Face_Jaw', 'Face_Lip_Upper', 'Face_Lip_Corner_Left', 'Face_Lip_Corner_Right',
    ];
    const missing = required.filter((n) => !this.bones[n]);
    if (missing.length) throw new Error('Faltan huesos: ' + missing.join(', '));

    // Reposo: transformaciones locales + orientación/escala en espacio del modelo
    root.updateMatrixWorld(true);
    const rootInvQ = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const rootScale = root.getWorldScale(new THREE.Vector3()).x;
    this.rest = new Map();
    for (const b of Object.values(this.bones)) {
      const wq = b.getWorldQuaternion(new THREE.Quaternion());
      this.rest.set(b, {
        q: b.quaternion.clone(),
        p: b.position.clone(),
        modelQ: rootInvQ.clone().multiply(wq),
        modelQInv: rootInvQ.clone().multiply(wq).invert(),
        parentModelQInv: rootInvQ.clone().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion())).invert(),
        parentScale: b.parent.getWorldScale(new THREE.Vector3()).x / rootScale,
      });
    }

    // Dedos: [hueso, ángulos por falange]
    this.fingers = [];
    for (const side of ['Left', 'Right']) {
      for (let f = 0; f <= 4; f++) {
        const curl = f === 0 ? FINGER_CURL.thumb
          : FINGER_CURL.index.map((v, i) => v + FINGER_CURL.step[i] * (f - 1));
        const names = [`Arm_${side}_Hand_Finger${f}`, `Arm_${side}_Hand_Finger${f}1`, `Arm_${side}_Hand_Finger${f}2`];
        names.forEach((n, i) => {
          // En T-pose los dedos curvan con -Z (mano izq., +X) y +Z (mano der., -X)
          const sign = side === 'Left' ? -1 : 1;
          const thumb = f === 0;
          if (this.bones[n]) this.fingers.push({ bone: this.bones[n], right: side === 'Right', thumb, phalanx: i, sign, angle: curl[i] * DEG * sign });
        });
      }
    }

    // Cadenas secundarias
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
    this.chains = [];
    for (const [type, names] of CHAINS) {
      const bones = names.map((n) => this.bones[n]).filter(Boolean);
      if (bones.length < 2) continue;
      root.worldToLocal(bones[0].getWorldPosition(tmp));
      root.worldToLocal(bones[bones.length - 1].getWorldPosition(tmp2));
      this.chains.push({
        bones, type, cfg: CHAIN_TYPES[type],
        length: Math.max(tmp.distanceTo(tmp2), 0.05),
        phase: Math.random() * 100,
        s: new THREE.Vector2(), v: new THREE.Vector2(),          // desplazamiento (x,z) y velocidad
        prevPos: null, prevVel: new THREE.Vector3(), tip: new THREE.Vector3(),
      });
    }

    this.colliders = [];

    // Interruptores públicos; los pesos se interpolan para transiciones suaves.
    this.enabled = { pose: true, breathing: true, sway: true, blink: true, gaze: true, secondary: true, prop: false };
    this.weights = { pose: 1, breathing: 1, sway: 1, blink: 1, gaze: 1, secondary: 1, prop: 0 };

    /** Objeto sujeto a la mano derecha (ver attachProp). */
    this.prop = null;
    this.propWave = { amp: HOLD.wave, hz: HOLD.waveHz };
    this.holdStyle = HOLD_STYLES.fist;
    this._noWave = false;

    /** Punto (coordenadas de mundo) al que mirar; null = al frente. */
    this.lookTarget = null;

    // Boca: objetivo (lo fija el lip-sync) y valor suavizado. Rango 0..1.
    this.mouthTarget = { open: 0, wide: 0, round: 0 };
    this.mouth = { open: 0, wide: 0, round: 0 };
    this.talkEnergy = 0;

    this.time = 0;
    this.headYaw = 0; this.headPitch = 0;
    this.eyeYaw = 0; this.eyePitch = 0;
    this.nextBlink = 1.5; this.blinkStart = -1; this.doubleBlink = false;
    this.microOffset = new THREE.Vector2(); this.nextMicro = 0.8;

    this._q = new THREE.Quaternion();
    this._pq = new THREE.Quaternion();
    this._rootInvQ = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();

    // Las esferas de colisión se midieron con los brazos relajados: fijarlas en esa pose
    this.update(0);
    this.initHairCollision();
    this.resetPose();
  }

  /** Boca objetivo {open, wide, round} en 0..1. immediate=true salta el suavizado. */
  setMouth(m, immediate = false) {
    Object.assign(this.mouthTarget, m);
    if (immediate) Object.assign(this.mouth, m);
  }

  // ---------- Primitivas ----------

  /** Rota alrededor de ejes del modelo (estado actual) por el pivote del hueso. */
  rotateModel(bone, x, y, z) {
    if (!x && !y && !z) return;
    bone.parent.updateWorldMatrix(true, false);
    const p = bone.parent.getWorldQuaternion(this._pq).premultiply(this._rootInvQ); // padre en espacio modelo
    this._q.setFromEuler(this._e.set(x, y, z, 'YXZ'));
    // local' = P⁻¹ · Q · P · local
    bone.quaternion.premultiply(p.clone().invert().multiply(this._q).multiply(p));
  }

  /** Rota alrededor de un eje arbitrario en espacio del modelo. */
  rotateModelAxis(bone, axis, angle) {
    if (!angle) return;
    bone.parent.updateWorldMatrix(true, false);
    const p = bone.parent.getWorldQuaternion(this._pq).premultiply(this._rootInvQ);
    this._q.setFromAxisAngle(axis, angle);
    bone.quaternion.premultiply(p.clone().invert().multiply(this._q).multiply(p));
  }

  /** Rota alrededor de los ejes que el hueso tenía en reposo (siguen a sus padres). */
  rotateRest(bone, x, y, z) {
    if (!x && !y && !z) return;
    const r = this.rest.get(bone);
    this._q.setFromEuler(this._e.set(x, y, z, 'YXZ'));
    // local · R⁻¹ · Q · R
    bone.quaternion.multiply(r.modelQInv.clone().multiply(this._q).multiply(r.modelQ));
  }

  /** Desplaza en ejes de reposo (metros del modelo). */
  translateRest(bone, x, y, z) {
    if (!x && !y && !z) return;
    const r = this.rest.get(bone);
    bone.position.add(this._v.set(x, y, z).applyQuaternion(r.parentModelQInv).divideScalar(r.parentScale));
  }

  resetPose() {
    for (const [b, r] of this.rest) { b.quaternion.copy(r.q); b.position.copy(r.p); }
  }

  // ---------- Frame ----------

  update(dt) {
    dt = Math.min(dt, 0.1); // evitar saltos al volver de una pestaña en segundo plano
    this.time += dt;
    const t = this.time;
    for (const k in this.weights) this.weights[k] = damp(this.weights[k], this.enabled[k] ? 1 : 0, 4, dt);
    const w = this.weights, B = this.bones;

    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(this._rootInvQ).invert();
    this.resetPose();

    // --- Tronco: balanceo desde Spine (las piernas no se mueven) + respiración ---
    const swayZ = Math.sin(t * 2 * Math.PI / 7.3) * 0.9 * DEG * w.sway;
    const swayY = Math.sin(t * 2 * Math.PI / 11.1 + 1.3) * 1.6 * DEG * w.sway;
    this.rotateModel(B['Bip01-Spine'], 0, swayY, swayZ);
    // La falda cuelga de Bip01, no de la columna: hacer que acompañe a la cintura.
    this.rotateModel(B['Skirt_Root'], 0, swayY, swayZ);

    const breath = (Math.sin(t * 2 * Math.PI / 4.0) + 1) / 2; // 0..1, ~15 resp/min
    const bw = w.breathing;
    this.rotateModel(B['Bip01-Spine1'], -1.0 * DEG * breath * bw, 0, -swayZ * 0.5);
    this.rotateModel(B['Bip01-Spine2'], -0.8 * DEG * breath * bw, 0, 0);

    // --- Brazos (pose relajada) + vaivén ligado a la respiración ---
    const armIdle = (breath - 0.5) * 1.5 * DEG * bw;
    const down = POSE.upperArmDown * DEG * w.pose;
    const fwd = -POSE.upperArmFwd * DEG * w.pose;
    const bend = -POSE.forearmBend * DEG * w.pose;
    this.rotateModel(B['Arm_Left_UpperArm'], fwd, 0, -down - armIdle);
    this.rotateModel(B['Arm_Left_Forearm'], bend, 0, 0);

    // Brazo derecho: mezcla entre pose relajada y sostener el objeto
    const ws = w.prop, lerp = THREE.MathUtils.lerp;
    const wave = this._noWave ? 0
      : (Math.sin(t * 2 * Math.PI * this.propWave.hz) + 0.25 * Math.sin(t * 2 * Math.PI * this.propWave.hz * 2.3 + 1)) * this.propWave.amp * DEG;
    const bob = this._noWave ? 0 : Math.sin(t * 2 * Math.PI * this.propWave.hz * 2) * 1.2 * DEG;
    const hs = this.holdStyle;
    this.rotateModel(B['Arm_Right_UpperArm'],
      lerp(fwd, -hs.upperArmFwd * DEG, ws) + bob * ws, 0,
      lerp(down + armIdle, hs.upperArmDown * DEG + armIdle * 0.3, ws));
    this.rotateModel(B['Arm_Right_Forearm'], lerp(bend, -hs.forearmBend * DEG, ws), 0, 0);
    // Giro del antebrazo sobre su propio eje (p. ej. palma hacia arriba)
    if (hs.twist) {
      const fa = B['Arm_Right_Forearm'], hand = B['Arm_Right_Hand'];
      fa.updateWorldMatrix(true, true);
      const a = this.root.worldToLocal(fa.getWorldPosition(this._v));
      const b = this.root.worldToLocal(hand.getWorldPosition(this._v2)).sub(a).normalize();
      this.rotateModelAxis(fa, b, hs.twist * DEG * ws);
    }
    // Enderezar la muñeca: llevar los dedos hacia la vertical (fracción wristUp)
    if (hs.wristUp) {
      const hand = B['Arm_Right_Hand'];
      hand.updateWorldMatrix(true, true);
      const a = this.root.worldToLocal(hand.getWorldPosition(this._v));
      const dir = this.root.worldToLocal(B['Arm_Right_Hand_Finger2'].getWorldPosition(this._v2)).sub(a).normalize();
      const axis = new THREE.Vector3(0, 1, 0).cross(dir).negate().normalize(); // dir × Y
      const ang = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1)) * hs.wristUp * ws;
      if (axis.lengthSq() > 1e-6) this.rotateModelAxis(hand, axis, ang);
    }
    // Con el antebrazo hacia delante, girar la muñeca sobre Z inclina el objeto a los lados
    this.rotateModel(B['Arm_Right_Hand'], 0, 0, wave * ws);

    // --- Dedos: relajados, o en puño en la mano que sostiene el objeto ---
    const curlK = w.pose * (1 + (breath - 0.5) * 0.08 * bw);
    for (const f of this.fingers) {
      if (!f.right) { this.rotateRest(f.bone, 0, 0, f.angle * curlK); continue; }
      if (f.thumb) this.rotateRest(f.bone, hs.thumbX[f.phalanx] * DEG * ws, 0, f.angle * curlK * (1 - ws));
      else this.rotateRest(f.bone, 0, 0, lerp(f.angle * curlK, hs.finger[f.phalanx] * DEG * f.sign, ws));
    }

    // --- Boca: ataque rápido, relajación más lenta ---
    for (const k of ['open', 'wide', 'round']) {
      const target = this.mouthTarget[k];
      this.mouth[k] = damp(this.mouth[k], target, target > this.mouth[k] ? 30 : 14, dt);
    }
    this.talkEnergy = damp(this.talkEnergy, this.mouthTarget.open, 3, dt);

    // --- Mirada: ojos rápidos, cabeza lenta ---
    this.updateMicroSaccades(dt);
    let yaw = 0, pitch = 0;
    if (this.lookTarget) {
      const head = this.root.worldToLocal(B['Bip01-Head'].getWorldPosition(this._v));
      const d = this.root.worldToLocal(this._v2.copy(this.lookTarget)).sub(head);
      yaw = Math.atan2(d.x, d.z);
      pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      // Objetivo detrás: volver al frente en lugar de retorcer el cuello
      if (Math.abs(yaw) > 110 * DEG) { yaw = 0; pitch = 0; }
    }
    yaw = (yaw + this.microOffset.x) * w.gaze;
    pitch = (pitch + this.microOffset.y) * w.gaze;

    this.eyeYaw = damp(this.eyeYaw, yaw, 18, dt);
    this.eyePitch = damp(this.eyePitch, pitch, 18, dt);
    this.headYaw = damp(this.headYaw, clamp(yaw, -GAZE.headYaw * DEG, GAZE.headYaw * DEG), 3.5, dt);
    this.headPitch = damp(this.headPitch, clamp(pitch, -GAZE.headPitch * DEG, GAZE.headPitch * DEG), 3.5, dt);

    // Al hablar: pequeños asentimientos que acompañan la energía de la voz
    const nod = this.talkEnergy * (Math.sin(t * 5.3) * 1.2 + Math.sin(t * 8.9) * 0.6) * DEG;

    const ns = GAZE.neckShare;
    // El cuello compensa el balanceo para que la cabeza se mantenga estable
    this.rotateModel(B['Bip01-Neck'], -this.headPitch * ns, this.headYaw * ns - swayY * 0.6, -swayZ * 0.4);
    this.rotateModel(B['Bip01-Head'], -this.headPitch * (1 - ns) + nod, this.headYaw * (1 - ns), 0);

    // --- Ojos (relativos a la cabeza) ---
    const ey = clamp(this.eyeYaw - this.headYaw, -GAZE.eyeYaw * DEG, GAZE.eyeYaw * DEG);
    const ep = clamp(this.eyePitch - this.headPitch, -GAZE.eyePitch * DEG, GAZE.eyePitch * DEG);
    this.rotateRest(B['Face_Eye_Left'], -ep, ey, 0);
    this.rotateRest(B['Face_Eye_Right'], -ep, ey, 0);

    // --- Párpados: parpadeo + acompañan un poco la mirada vertical ---
    const lid = this.updateBlink() * w.blink;
    const lidFollow = clamp(-ep, -8 * DEG, 8 * DEG) * 0.6;
    this.rotateRest(B['Face_UpperLids'], BLINK.upperLid * DEG * lid + lidFollow, 0, 0);
    this.rotateRest(B['Face_LowerLids'], BLINK.lowerLid * DEG * lid, 0, 0);

    // --- Boca ---
    const m = this.mouth;
    this.rotateRest(B['Face_Jaw'], (MOUTH.jawOpen * m.open + MOUTH.jawRound * m.round * (1 - m.open)) * DEG, 0, 0);
    const cw = MOUTH.cornerWide, cr = MOUTH.cornerRound;
    const cx = cw[0] * m.wide + cr[0] * m.round, cy = cw[1] * m.wide + cr[1] * m.round, cz = cw[2] * m.wide + cr[2] * m.round;
    this.translateRest(B['Face_Lip_Corner_Left'], cx, cy, cz);
    this.translateRest(B['Face_Lip_Corner_Right'], -cx, cy, cz);
    const uo = MOUTH.upperOpen, ur = MOUTH.upperRound;
    this.translateRest(B['Face_Lip_Upper'], uo[0] * m.open + ur[0] * m.round, uo[1] * m.open + ur[1] * m.round, uo[2] * m.open + ur[2] * m.round);

    // --- Movimiento secundario ---
    this.updateSecondary(dt, w.secondary);
    this.collideHair();

    // --- Objeto en la mano: aparece/desaparece encogiéndose hacia el puño ---
    if (this.prop) {
      const k = THREE.MathUtils.smoothstep(ws, 0.3, 1);
      this.prop.visible = k > 0.01 && !this.propHidden;
      this.prop.scale.copy(this.propBaseScale).multiplyScalar(Math.max(k, 1e-3));
    }
  }

  /**
   * Coloca un objeto (origen = punto de agarre, +Y arriba, +Z al frente) en el
   * puño derecho. Con show=true el brazo sube y el objeto crece desde el puño;
   * con show=false queda guardado hasta `showProp(true)`.
   * @param {THREE.Object3D} obj
   * @param {{show?: boolean, wave?: number, waveHz?: number, hold?: 'fist'|'palm', holdOverrides?: object}} [opts]
   */
  attachProp(obj, { show = true, wave = HOLD.wave, waveHz = HOLD.waveHz, hold = 'fist', holdOverrides = {} } = {}) {
    const B = this.bones;
    this.propWave = { amp: wave, hz: waveHz };
    const base = HOLD_STYLES[hold] || HOLD_STYLES.fist;
    this.holdStyle = { ...base, ...holdOverrides, grip: { ...base.grip, ...(holdOverrides.grip || {}) } };
    // Evaluar la pose de agarre completa y sin vaivén para fijar la posición relativa a la mano
    const prevEnabled = this.enabled.prop, prevWeight = this.weights.prop;
    this.enabled.prop = true;
    this.weights.prop = 1;
    this._noWave = true;
    this.update(0);
    this._noWave = false;
    this.root.updateMatrixWorld(true);

    // Punto de agarre: entre la muñeca y la base del dedo corazón, más desplazamientos
    const g = this.holdStyle.grip;
    const wrist = this.root.worldToLocal(B['Arm_Right_Hand'].getWorldPosition(new THREE.Vector3()));
    const mid = this.root.worldToLocal(B['Arm_Right_Hand_Finger2'].getWorldPosition(new THREE.Vector3()));
    const grip = wrist.clone().lerp(mid, g.along);
    const orient = new THREE.Quaternion();
    if (g.alignToPalm) {
      // Ejes de la palma: "arriba" = muñeca→dedo corazón, normal = hacia donde mira la palma
      const P = (n) => this.root.worldToLocal(B[n].getWorldPosition(new THREE.Vector3()));
      const up = P('Arm_Right_Hand_Finger22').sub(wrist).normalize();
      const across = P('Arm_Right_Hand_Finger1').sub(P('Arm_Right_Hand_Finger4'));
      const normal = new THREE.Vector3().crossVectors(across, up).normalize();
      if (normal.z < 0) normal.negate(); // que mire hacia el frente (la cámara)
      const right = new THREE.Vector3().crossVectors(up, normal).normalize();
      up.crossVectors(normal, right);
      orient.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
      grip.addScaledVector(up, g.up).addScaledVector(normal, g.fwd).addScaledVector(right, g.inward);
    } else {
      grip.y += g.up;
      grip.x += g.inward;
      grip.z += g.fwd;
    }

    if (this.prop) this.prop.removeFromParent();
    this.root.add(obj);
    obj.position.copy(grip);
    obj.quaternion.copy(orient);
    obj.updateMatrixWorld(true);
    B['Arm_Right_Hand'].attach(obj); // conserva la transformación de mundo
    this.prop = obj;
    this.propBaseScale = obj.scale.clone();
    this.propHidden = false;

    this.enabled.prop = show || prevEnabled;
    this.weights.prop = show ? 0 : prevWeight; // entrada suave
    this.update(0);
  }

  /** Levanta (true) o baja (false) el objeto de la mano. */
  showProp(on) { this.enabled.prop = on; }

  /** true cuando el brazo ha terminado de subir. */
  get propReady() { return this.enabled.prop && this.weights.prop > 0.97; }

  /** Oculta el objeto sin bajar el brazo (p. ej. mientras está "fuera" en la interfaz). */
  setPropHidden(h) { this.propHidden = h; }

  updateSecondary(dt, weight) {
    if (dt <= 0) return;
    this.root.updateMatrixWorld(true);
    const t = this.time;

    // 1) Posición "rígida" de la punta de cada cadena (antes de aplicar sus muelles)
    for (const c of this.chains) {
      this.root.worldToLocal(c.bones[c.bones.length - 1].getWorldPosition(c.tip));
    }

    // 2) Integrar muelles (subpasos para estabilidad) y aplicar rotaciones
    for (const c of this.chains) {
      const { cfg } = c;
      if (!c.prevPos) { c.prevPos = c.tip.clone(); continue; }
      const vel = this._v.subVectors(c.tip, c.prevPos).divideScalar(dt);
      const acc = this._v2.subVectors(vel, c.prevVel).divideScalar(dt);
      c.prevPos.copy(c.tip);
      c.prevVel.copy(vel);
      // Limitar picos (p. ej. al alternar interruptores)
      acc.clampLength(0, 20);

      const om = 2 * Math.PI * cfg.freq, k = om * om, cd = 2 * cfg.zeta * om;
      const ph = c.phase + t;
      const windX = cfg.wind * (Math.sin(ph * 0.7) * 0.6 + Math.sin(ph * 1.9) * 0.3);
      const windZ = cfg.wind * (Math.sin(ph * 0.53 + 2) * 0.5 + Math.sin(ph * 1.3) * 0.3) - cfg.wind * 0.3;
      const fx = -acc.x * cfg.gain + windX, fz = -acc.z * cfg.gain + windZ;

      const steps = Math.ceil(dt / (1 / 120));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        c.v.x += (fx - k * c.s.x - cd * c.v.x) * h;
        c.v.y += (fz - k * c.s.y - cd * c.v.y) * h;
        c.s.x += c.v.x * h;
        c.s.y += c.v.y * h;
      }

      // Desplazamiento de la punta -> ángulo total, repartido a lo largo de la cadena.
      // Cadena colgando (-Y): +Z se consigue rotando -X; +X rotando +Z.
      const max = cfg.max * DEG;
      const ax = clamp(-c.s.y / c.length, -max, max) * weight;
      const az = clamp(c.s.x / c.length, -max, max) * weight;
      const n = c.bones.length;
      for (const b of c.bones) this.rotateModel(b, ax / n, 0, az / n);
    }
  }

  /** Prepara las esferas de colisión y elige vértices de muestra de cada mechón. */
  initHairCollision() {
    const root = this.root;
    root.updateMatrixWorld(true);
    this.colliders = [];
    for (const k of HAIR_COLLIDERS) {
      const bone = this.bones[k.bone];
      if (!bone) continue;
      const local = bone.worldToLocal(root.localToWorld(new THREE.Vector3(...k.c)));
      this.colliders.push({ bone, local, r: k.r, center: new THREE.Vector3() });
    }

    // La malla del pelo se separa bastante de sus huesos: se usan vértices reales
    // de los dos tercios inferiores de cada mechón, repartidos (muestreo del punto más lejano).
    const meshes = [];
    root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    this.hairMeshes = new Set();
    const v = new THREE.Vector3(), p0 = new THREE.Vector3();
    for (const c of this.chains) {
      if (c.type !== 'hair') continue;
      root.worldToLocal(c.bones[0].getWorldPosition(p0));
      const cand = [];
      for (const m of meshes) {
        const inChain = m.skeleton.bones.map((b) => c.bones.includes(b));
        if (!inChain.some(Boolean)) continue;
        m.skeleton.update();
        const sk = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
        for (let i = 0; i < sk.count; i++) {
          let best = 0, bi = -1;
          for (let k = 0; k < 4; k++) {
            const w = sw.getComponent(i, k);
            if (w > best) { best = w; bi = sk.getComponent(i, k); }
          }
          if (bi < 0 || !inChain[bi]) continue;
          root.worldToLocal(m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld));
          cand.push({ mesh: m, i, p: v.clone(), d: v.distanceTo(p0) });
        }
      }
      if (!cand.length) continue;
      const maxD = Math.max(...cand.map((s) => s.d));
      const pool = cand.filter((s) => s.d > maxD * 0.3);
      const picked = [pool.reduce((a, b) => (b.d > a.d ? b : a))];
      while (picked.length < Math.min(HAIR_COLLISION.samples, pool.length)) {
        let far = null, farD = -1;
        for (const s of pool) {
          const d = Math.min(...picked.map((p) => p.p.distanceToSquared(s.p)));
          if (d > farD) { farD = d; far = s; }
        }
        picked.push(far);
      }
      c.samples = picked.map(({ mesh, i }) => ({ mesh, i }));
      for (const s of c.samples) this.hairMeshes.add(s.mesh);
    }
    this._colN = new THREE.Vector3(); this._colQ = new THREE.Vector3();
    this._colP = new THREE.Vector3(); this._colA = new THREE.Vector3();
  }

  /** Saca los mechones que hayan entrado en hombros o espalda girando su raíz. */
  collideHair() {
    if (!this.colliders?.length) return;
    const root = this.root, v = this._v, n = this._colN, q = this._colQ, p0 = this._colP, axis = this._colA;
    const { margin, iterations, maxAngle } = HAIR_COLLISION;
    for (let it = 0; it < iterations; it++) {
      root.updateMatrixWorld(true);
      for (const m of this.hairMeshes) m.skeleton.update();
      for (const col of this.colliders) root.worldToLocal(col.bone.localToWorld(col.center.copy(col.local)));
      for (const c of this.chains) {
        if (!c.samples) continue;
        let worst = 0;
        for (const s of c.samples) {
          root.worldToLocal(s.mesh.getVertexPosition(s.i, v).applyMatrix4(s.mesh.matrixWorld));
          for (const col of this.colliders) {
            const d = v.distanceTo(col.center);
            const pen = col.r + margin - d;
            if (pen > worst && d > 1e-6) { worst = pen; q.copy(v); n.subVectors(v, col.center).divideScalar(d); }
          }
        }
        if (worst <= 0) continue;
        // Girar la raíz: un ángulo α desplaza q a lo largo de n en α·|palanca × n|
        root.worldToLocal(c.bones[0].getWorldPosition(p0));
        axis.subVectors(q, p0).cross(n);
        const L = axis.length();
        if (L < 1e-5) continue;
        axis.divideScalar(L);
        this.rotateModelAxis(c.bones[0], axis, Math.min(worst / L, maxAngle * DEG));
      }
    }
  }

  /** Cierre de párpado 0..1. */
  updateBlink() {
    const t = this.time;
    if (this.blinkStart < 0 && t >= this.nextBlink) this.blinkStart = t;
    if (this.blinkStart < 0) return 0;
    const k = (t - this.blinkStart) / BLINK.duration;
    if (k >= 1) {
      this.blinkStart = -1;
      if (!this.doubleBlink && Math.random() < 0.15) { this.doubleBlink = true; this.nextBlink = t + 0.12; }
      else { this.doubleBlink = false; this.nextBlink = t + 2 + Math.random() * 4; }
      return 0;
    }
    // Cierre rápido, apertura algo más lenta
    return k < 0.4 ? Math.sin((k / 0.4) * Math.PI / 2) : Math.cos(((k - 0.4) / 0.6) * Math.PI / 2);
  }

  updateMicroSaccades(dt) {
    this.nextMicro -= dt;
    if (this.nextMicro <= 0) {
      this.microOffset.set((Math.random() - 0.5) * 3 * DEG, (Math.random() - 0.5) * 2 * DEG);
      this.nextMicro = 0.6 + Math.random() * 1.8;
    }
  }
}
