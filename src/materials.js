import * as THREE from 'three';
import {
  makeDressFabric,
  makeApronFabric,
  makeStockingTexture,
  makeIrisTexture,
} from './textures.js';

/**
 * Paleta y materiales de Alice. Piel de porcelana, terciopelo azul noche,
 * algodón crudo para el delantal, cuero negro y plata para la Vorpal.
 */
export function createMaterials() {
  const dressMap = makeDressFabric();
  const apronMap = makeApronFabric();
  const stockingMap = makeStockingTexture();
  const irisMap = makeIrisTexture();

  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xf0d6cb,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.55,
    sheen: 0.25,
    sheenColor: new THREE.Color(0xffc9bd),
    sheenRoughness: 0.8,
    envMapIntensity: 0.55,
  });

  const skinWarm = new THREE.MeshPhysicalMaterial({
    color: 0xe7c1b8,
    roughness: 0.55,
    clearcoat: 0.1,
    envMapIntensity: 0.5,
  });

  const lip = new THREE.MeshPhysicalMaterial({
    color: 0xa64f58,
    roughness: 0.3,
    clearcoat: 0.9,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.8,
  });

  const lipDark = new THREE.MeshBasicMaterial({ color: 0x5e2830 });

  const hair = new THREE.MeshPhysicalMaterial({
    color: 0x0d0d14,
    roughness: 0.34,
    metalness: 0.05,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    sheen: 1,
    sheenColor: new THREE.Color(0x5a6b9c),
    sheenRoughness: 0.35,
    envMapIntensity: 1.1,
  });

  const hairLock = hair.clone();
  hairLock.vertexColors = true;
  hairLock.side = THREE.DoubleSide;

  const brow = new THREE.MeshStandardMaterial({
    color: 0x241a1c,
    roughness: 0.8,
  });

  const dress = new THREE.MeshPhysicalMaterial({
    map: dressMap,
    color: 0x9aa6d8,
    roughness: 0.46,
    metalness: 0.08,
    sheen: 0.9,
    sheenColor: new THREE.Color(0x7f9cff),
    sheenRoughness: 0.45,
    clearcoat: 0.15,
    clearcoatRoughness: 0.6,
    side: THREE.DoubleSide,
    envMapIntensity: 0.9,
  });

  const dressDark = new THREE.MeshPhysicalMaterial({
    color: 0x141b33,
    roughness: 0.5,
    metalness: 0.05,
    sheen: 0.8,
    sheenColor: new THREE.Color(0x4f6bb5),
    sheenRoughness: 0.5,
    side: THREE.DoubleSide,
  });

  const apron = new THREE.MeshPhysicalMaterial({
    map: apronMap,
    color: 0xf1ede3,
    roughness: 0.72,
    sheen: 0.5,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.7,
    side: THREE.DoubleSide,
    envMapIntensity: 0.8,
  });

  const lace = new THREE.MeshPhysicalMaterial({
    color: 0xf3efe6,
    roughness: 0.65,
    sheen: 0.7,
    sheenColor: new THREE.Color(0xfff7e8),
    side: THREE.DoubleSide,
  });

  const stocking = new THREE.MeshPhysicalMaterial({
    map: stockingMap,
    color: 0xffffff,
    roughness: 0.78,
    sheen: 0.4,
    sheenColor: new THREE.Color(0x8899bb),
    side: THREE.DoubleSide,
  });

  const leather = new THREE.MeshPhysicalMaterial({
    color: 0x0b0a10,
    roughness: 0.33,
    metalness: 0.08,
    clearcoat: 0.75,
    clearcoatRoughness: 0.25,
    envMapIntensity: 1.2,
  });

  const leatherSoft = new THREE.MeshPhysicalMaterial({
    color: 0x120f18,
    roughness: 0.55,
    clearcoat: 0.3,
    envMapIntensity: 0.7,
  });

  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xdce4ec,
    metalness: 1,
    roughness: 0.2,
    envMapIntensity: 1.6,
    clearcoat: 0.4,
  });

  const metalDark = new THREE.MeshStandardMaterial({
    color: 0x6d7783,
    metalness: 1,
    roughness: 0.38,
  });

  const gold = new THREE.MeshPhysicalMaterial({
    color: 0xc7a568,
    metalness: 1,
    roughness: 0.3,
    envMapIntensity: 1.3,
  });

  const satin = new THREE.MeshPhysicalMaterial({
    color: 0x07070c,
    roughness: 0.32,
    sheen: 1,
    sheenColor: new THREE.Color(0x495a8c),
    sheenRoughness: 0.3,
    clearcoat: 0.4,
  });

  const eyeWhite = new THREE.MeshPhysicalMaterial({
    color: 0xf2ece4,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1,
  });

  const iris = new THREE.MeshPhysicalMaterial({
    map: irisMap,
    color: 0xffffff,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.2,
  });

  const lash = new THREE.MeshStandardMaterial({
    color: 0x0a080b,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });

  const nail = new THREE.MeshPhysicalMaterial({
    color: 0xd9b3ad,
    roughness: 0.25,
    clearcoat: 1,
    transparent: true,
    opacity: 0.85,
  });

  const bladeGlow = new THREE.MeshStandardMaterial({
    color: 0x6fd7ff,
    emissive: new THREE.Color(0x3fb6ff),
    emissiveIntensity: 2.4,
    metalness: 0.4,
    roughness: 0.3,
    transparent: true,
    opacity: 0.85,
  });

  const magic = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.35, 0.9, 1.6),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return {
    skin, skinWarm, lip, lipDark, hair, hairLock, brow,
    dress, dressDark, apron, lace, stocking,
    leather, leatherSoft, metal, metalDark, gold, satin,
    eyeWhite, iris, lash, nail, bladeGlow, magic,
    maps: { dressMap, apronMap, stockingMap, irisMap },
  };
}
