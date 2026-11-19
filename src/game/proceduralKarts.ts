import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDetailedDriver } from './driver';
import type { KartSpec } from './types';
import { KART_SPECS } from './config';

export interface WheelRig {
  pivot: THREE.Group;
  spinner: THREE.Group;
  front: boolean;
  baseY: number;
  radius: number;
}

export interface KartVisual {
  root: THREE.Group;
  chassis: THREE.Group;
  modelSlot: THREE.Group;
  wheels: WheelRig[];
  flames: THREE.Mesh[];
  shield: THREE.Mesh;
  contact: THREE.Mesh;
  driver: THREE.Group;
  driverArms: THREE.Group;
}

function part(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createTireGeometry(): THREE.BufferGeometry {
  const tire = new THREE.CylinderGeometry(0.34, 0.34, 0.29, 32, 4);
  const position = tire.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const radius = Math.hypot(x, z);
    if (radius < 0.3) continue;
    const theta = Math.atan2(z, x);
    const groove = Math.sin(theta * 28) > 0.32 ? 0.014 : 0;
    const factor = (radius - groove) / radius;
    position.setX(index, x * factor);
    position.setZ(index, z * factor);
  }
  tire.rotateZ(Math.PI / 2);
  tire.computeVertexNormals();
  const sidewalls = [-0.135, 0.135].map((x) => {
    const ring = new THREE.TorusGeometry(0.275, 0.064, 8, 32);
    ring.rotateY(Math.PI / 2);
    ring.translate(x, 0, 0);
    return ring;
  });
  return mergeGeometries([tire, ...sidewalls], false) || tire;
}

function createRimGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const hub = new THREE.CylinderGeometry(0.075, 0.075, 0.32, 16);
  hub.rotateZ(Math.PI / 2);
  pieces.push(hub);
  const ring = new THREE.TorusGeometry(0.165, 0.025, 7, 24);
  ring.rotateY(Math.PI / 2);
  pieces.push(ring);
  for (let spoke = 0; spoke < 7; spoke += 1) {
    const geometry = new THREE.BoxGeometry(0.3, 0.045, 0.145);
    geometry.translate(0, 0, 0.075);
    geometry.rotateX((spoke / 7) * Math.PI * 2);
    pieces.push(geometry);
  }
  return mergeGeometries(pieces, false) || hub;
}

let contactTexture: THREE.CanvasTexture | undefined;
const tireGeometry = createTireGeometry();
const rimGeometry = createRimGeometry();
const mobileTireGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.29, 16);
mobileTireGeometry.rotateZ(Math.PI / 2);
const mobileRimGeometry = new THREE.CylinderGeometry(0.175, 0.175, 0.305, 10);
mobileRimGeometry.rotateZ(Math.PI / 2);
const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x111416, roughness: 0.96 });
const mobileWheelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
const mobileWheelGeometries = new Map<string, THREE.BufferGeometry>();

function getMobileWheelGeometry(accentColor: string): THREE.BufferGeometry {
  const cached = mobileWheelGeometries.get(accentColor);
  if (cached) return cached;
  const tire = mobileTireGeometry.clone();
  const rim = mobileRimGeometry.clone();
  const paint = (geometry: THREE.BufferGeometry, color: THREE.Color) => {
    const values = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let index = 0; index < values.length; index += 3) color.toArray(values, index);
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  };
  paint(tire, new THREE.Color(0x111416));
  paint(rim, new THREE.Color(accentColor));
  const merged = mergeGeometries([tire, rim], false) || tire;
  mobileWheelGeometries.set(accentColor, merged);
  return merged;
}

function getContactTexture(): THREE.CanvasTexture {
  if (contactTexture) return contactTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(10,31,36,.48)');
  gradient.addColorStop(0.55, 'rgba(10,31,36,.25)');
  gradient.addColorStop(1, 'rgba(10,31,36,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  contactTexture = new THREE.CanvasTexture(canvas);
  return contactTexture;
}

function createWheelRig(root: THREE.Group, spec: KartSpec, accent: THREE.Material, mobile: boolean, accentColor: string): WheelRig[] {
  const wheels: WheelRig[] = [];
  const { wheelX, wheelY, frontZ, rearZ, wheelRadius, wheelWidth } = spec.rig;
  for (const x of [-wheelX, wheelX]) {
    for (const z of [rearZ, frontZ]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, wheelY, z);
      const spinner = new THREE.Group();
      spinner.scale.set(wheelWidth / 0.29, wheelRadius / 0.34, wheelRadius / 0.34);
      pivot.add(spinner);
      if (mobile) {
        const wheel = part(spinner, getMobileWheelGeometry(accentColor), mobileWheelMaterial, [0, 0, 0]);
        wheel.name = 'procedural-tire';
      } else {
        part(spinner, tireGeometry, tireMaterial, [0, 0, 0]).name = 'procedural-tire';
        part(spinner, rimGeometry, accent, [0, 0, 0]).name = 'procedural-rim';
      }
      root.add(pivot);
      wheels.push({ pivot, spinner, front: z > 0, baseY: pivot.position.y, radius: wheelRadius });
    }
  }
  return wheels;
}

export function attachStateVisuals(root: THREE.Group): { flames: THREE.Mesh[]; shield: THREE.Mesh; contact: THREE.Mesh } {
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(2.25, 3.05),
    new THREE.MeshBasicMaterial({ map: getContactTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.015;
  contact.renderOrder = 1;
  root.add(contact);

  const flames: THREE.Mesh[] = [];
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0x6ff7ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const x of [-0.34, 0.34]) {
    const flame = part(root, new THREE.ConeGeometry(0.14, 0.9, 10), flameMaterial, [x, 0.6, -1.55]);
    flame.receiveShadow = false;
    flame.rotation.x = -Math.PI / 2;
    flame.visible = false;
    flames.push(flame);
  }
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.45, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x7df9e5, transparent: true, opacity: 0.17, wireframe: true, depthWrite: false }),
  );
  shield.position.y = 0.65;
  shield.scale.set(0.85, 0.65, 1);
  shield.visible = false;
  root.add(shield);
  return { flames, shield, contact };
}

export function createProceduralKart(spec: KartSpec, mobile = false): KartVisual {
  const root = new THREE.Group();
  root.name = `${spec.id}-kart`;
  const chassis = new THREE.Group();
  root.add(chassis);
  const modelSlot = new THREE.Group();
  chassis.add(modelSlot);
  const body = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: 0.32, clearcoat: 0.85, clearcoatRoughness: 0.18 });
  const accent = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.48 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15232d, roughness: 0.74 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc5d3d4, roughness: 0.3, metalness: 0.78 });
  const light = new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffd76a, emissiveIntensity: 0.8 });

  part(modelSlot, new RoundedBoxGeometry(1.36, 0.34, 1.82, 4, 0.12), body, [0, 0.53, 0]);
  const nose = part(modelSlot, new RoundedBoxGeometry(0.92, 0.27, 0.76, 4, 0.1), accent, [0, 0.58, 0.94]);
  nose.rotation.x = -0.08;
  part(modelSlot, new RoundedBoxGeometry(0.77, 0.46, 0.7, 4, 0.12), dark, [0, 0.85, -0.16]);
  part(modelSlot, new RoundedBoxGeometry(0.58, 0.12, 0.42, 3, 0.05), body, [0, 1.05, -0.26]);
  part(modelSlot, new RoundedBoxGeometry(0.35, 0.32, 0.55, 3, 0.05), metal, [0, 0.69, -0.91]);
  for (const x of [-0.77, 0.77]) {
    for (const z of [-0.69, 0.72]) {
      const strut = part(modelSlot, new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), metal, [x * 0.72, 0.48, z]);
      strut.rotation.z = Math.PI / 2;
    }
  }
  for (const x of [-0.36, 0.36]) part(modelSlot, new THREE.SphereGeometry(0.1, 12, 8), light, [x, 0.66, 1.32]);

  if (spec.id === 'comet') {
    for (const x of [-0.37, 0.37]) {
      const rocket = part(modelSlot, new THREE.CylinderGeometry(0.14, 0.19, 0.6, 16), metal, [x, 0.72, -1.12]);
      rocket.rotation.x = Math.PI / 2;
    }
    part(modelSlot, new RoundedBoxGeometry(1.32, 0.1, 0.35, 3, 0.04), body, [0, 1.18, -0.9]);
    for (const x of [-0.45, 0.45]) part(modelSlot, new THREE.BoxGeometry(0.06, 0.42, 0.08), metal, [x, 0.96, -0.9]);
  } else if (spec.id === 'reef') {
    const canopy = part(modelSlot, new THREE.SphereGeometry(0.48, 20, 12), new THREE.MeshPhysicalMaterial({ color: 0x8ee8e0, transparent: true, opacity: 0.42, roughness: 0.12, depthWrite: false }), [0, 0.99, -0.05]);
    canopy.scale.set(0.86, 0.65, 1.05);
    for (const x of [-0.7, 0.7]) {
      const pod = part(modelSlot, new THREE.CapsuleGeometry(0.18, 0.8, 4, 12), accent, [x, 0.57, 0]);
      pod.rotation.x = Math.PI / 2;
    }
  } else if (spec.id === 'bolt') {
    for (let i = -2; i <= 2; i += 1) part(modelSlot, new THREE.BoxGeometry(0.055, 0.24, 0.035), metal, [i * 0.12, 0.57, 1.34]);
    part(modelSlot, new RoundedBoxGeometry(1.18, 0.09, 0.3, 3, 0.03), accent, [0, 1.12, -0.85]);
  } else if (spec.id === 'sprout') {
    for (const x of [-0.68, 0.68]) {
      const leaf = part(modelSlot, new THREE.SphereGeometry(0.35, 14, 8), accent, [x, 0.66, -0.15]);
      leaf.scale.set(0.35, 0.55, 1.5);
      leaf.rotation.y = x > 0 ? 0.35 : -0.35;
    }
    const leaf = part(modelSlot, new THREE.SphereGeometry(0.28, 14, 8), body, [0, 1.28, -0.32]);
    leaf.scale.set(0.35, 0.8, 1.1);
    leaf.rotation.z = -0.55;
  } else {
    for (const x of [-0.77, 0.77]) {
      const wing = part(modelSlot, new THREE.BoxGeometry(0.5, 0.08, 1.25), accent, [x, 0.64, -0.2]);
      wing.rotation.y = x > 0 ? -0.25 : 0.25;
      wing.rotation.z = x > 0 ? -0.16 : 0.16;
    }
    const halo = part(modelSlot, new THREE.TorusGeometry(0.46, 0.045, 8, 28), light, [0, 1.16, -0.32]);
    halo.rotation.x = Math.PI / 2;
  }

  const badgeIndex = KART_SPECS.findIndex((item) => item.id === spec.id) + 1;
  const badge = part(modelSlot, new THREE.CircleGeometry(0.17, 20), dark, [0, 0.76, 1.34]);
  badge.userData.number = badgeIndex;
  const { driver, arms } = createDetailedDriver(chassis, spec, mobile);
  const wheels = createWheelRig(root, spec, accent, mobile, spec.accent);
  const { flames, shield, contact } = attachStateVisuals(root);
  return { root, chassis, modelSlot, wheels, flames, shield, contact, driver, driverArms: arms };
}
