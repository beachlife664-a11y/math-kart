import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const SHOWROOM_ORIGIN = new THREE.Vector3(0, 90, 0);

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function box(parent: THREE.Object3D, material: THREE.Material, size: [number, number, number], position: [number, number, number], radius = 0.04): THREE.Mesh {
  return mesh(parent, new RoundedBoxGeometry(...size, 3, radius), material, ...position);
}

function makeSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff0cf';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f2554d';
  context.fillRect(0, 0, 34, canvas.height);
  context.fillStyle = '#123c49';
  context.font = '900 108px Trebuchet MS, sans-serif';
  context.fillText('MATH KART', 74, 126);
  context.fillStyle = '#168f91';
  context.font = '700 37px Trebuchet MS, sans-serif';
  context.fillText('TOY GARAGE  /  INSPECTION BAY 07', 80, 196);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addTireStack(parent: THREE.Group, material: THREE.Material, rim: THREE.Material, x: number, z: number): void {
  for (let level = 0; level < 3; level += 1) {
    const tire = mesh(parent, new THREE.TorusGeometry(0.34, 0.13, 10, 24), material, x, 0.18 + level * 0.23, z);
    tire.rotation.x = Math.PI / 2;
    const hub = mesh(parent, new THREE.CylinderGeometry(0.17, 0.17, 0.07, 16), rim, x, 0.18 + level * 0.23, z);
    hub.rotation.x = Math.PI / 2;
  }
}

export function createShowroomStage(mobile: boolean): THREE.Group {
  const root = new THREE.Group();
  root.name = 'menu-toy-garage';
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff0cf, roughness: 0.66 });
  const coral = new THREE.MeshStandardMaterial({ color: 0xf2554d, roughness: 0.52 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x174857, roughness: 0.68, metalness: 0.08 });
  const deep = new THREE.MeshStandardMaterial({ color: 0x0d2d3a, roughness: 0.78 });
  const aqua = new THREE.MeshStandardMaterial({ color: 0x68e5d1, emissive: 0x24a99e, emissiveIntensity: 0.34, roughness: 0.38 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf4bd32, emissive: 0xb87710, emissiveIntensity: 0.2, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9fb8b9, roughness: 0.35, metalness: 0.62 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x142128, roughness: 0.95 });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x709397, roughness: 0.88 });

  mesh(root, new THREE.CylinderGeometry(5.25, 5.45, 0.24, mobile ? 48 : 72), floorMaterial, 0, -0.2, 0);
  mesh(root, new THREE.CylinderGeometry(2.02, 2.12, 0.18, mobile ? 48 : 72), deep, 0, -0.025, 0);
  mesh(root, new THREE.CylinderGeometry(1.82, 1.86, 0.09, mobile ? 48 : 72), teal, 0, 0.085, 0);
  const outerRing = mesh(root, new THREE.TorusGeometry(1.91, 0.045, 8, mobile ? 48 : 80), aqua, 0, 0.11, 0);
  outerRing.rotation.x = Math.PI / 2;
  const innerRing = mesh(root, new THREE.TorusGeometry(1.53, 0.018, 6, mobile ? 40 : 64), cream, 0, 0.136, 0);
  innerRing.rotation.x = Math.PI / 2;

  const boltGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.025, 8);
  const bolts = new THREE.InstancedMesh(boltGeometry, metal, 20);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 20; index += 1) {
    const angle = index / 20 * Math.PI * 2;
    matrix.makeTranslation(Math.cos(angle) * 1.7, 0.145, Math.sin(angle) * 1.7);
    bolts.setMatrixAt(index, matrix);
  }
  root.add(bolts);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 4; index += 1) {
      const stripe = box(root, index % 2 ? cream : yellow, [0.18, 0.025, 0.7], [side * 2.45, -0.065, -1.05 + index * 0.72], 0.01);
      stripe.rotation.y = side * 0.12;
    }
  }

  const backdrop = new THREE.Group();
  backdrop.name = 'showroom-backdrop';
  root.add(backdrop);
  box(backdrop, teal, [7.7, 3.65, 0.24], [0, 1.68, -3.65], 0.12);
  box(backdrop, deep, [7.15, 0.82, 0.15], [0, 0.43, -3.47], 0.04);
  for (const x of [-3.65, 3.65]) {
    box(backdrop, cream, [0.28, 3.95, 0.35], [x, 1.82, -3.35], 0.07);
    box(backdrop, coral, [0.4, 0.18, 0.48], [x, 0.08, -3.32], 0.04);
  }
  box(backdrop, cream, [7.8, 0.28, 0.5], [0, 3.68, -3.35], 0.08);
  box(backdrop, coral, [7.3, 0.12, 0.18], [0, 3.42, -3.12], 0.03);
  const sign = mesh(backdrop, new THREE.PlaneGeometry(4.75, 1.18), new THREE.MeshBasicMaterial({ map: makeSignTexture(), toneMapped: false }), 0, 2.62, -3.49);
  sign.renderOrder = 2;

  for (const x of [-2.2, 2.2]) {
    box(backdrop, metal, [1.15, 0.09, 0.48], [x, 3.25, -2.75], 0.03);
    const lamp = box(backdrop, yellow, [0.96, 0.055, 0.36], [x, 3.19, -2.72], 0.02);
    lamp.material = yellow;
  }

  const cabinet = new THREE.Group();
  cabinet.position.set(2.45, 0, -2.85);
  backdrop.add(cabinet);
  box(cabinet, coral, [1.25, 0.86, 0.64], [0, 0.43, 0], 0.08);
  box(cabinet, deep, [1.36, 0.11, 0.72], [0, 0.91, 0], 0.035);
  for (let drawer = 0; drawer < 3; drawer += 1) {
    box(cabinet, cream, [1.02, 0.05, 0.035], [0, 0.25 + drawer * 0.24, 0.335], 0.01);
    box(cabinet, metal, [0.34, 0.035, 0.045], [0, 0.34 + drawer * 0.24, 0.36], 0.01);
  }
  addTireStack(backdrop, rubber, metal, -2.65, -2.8);
  box(backdrop, cream, [1.35, 0.12, 0.52], [-2.1, 1.22, -3.22], 0.03);
  for (let index = 0; index < 4; index += 1) {
    const can = mesh(backdrop, new THREE.CylinderGeometry(0.1, 0.11, 0.36 + index % 2 * 0.12, 12), index % 2 ? aqua : coral, -2.55 + index * 0.31, 1.46, -3.18);
    can.rotation.z = (index - 1.5) * 0.025;
  }

  box(backdrop, deep, [1.25, 0.78, 0.08], [1.03, 1.55, -3.42], 0.04);
  for (let index = 0; index < 4; index += 1) {
    const tool = box(backdrop, metal, [0.07, 0.42 - index * 0.045, 0.045], [0.62 + index * 0.27, 1.57, -3.34], 0.015);
    tool.rotation.z = (index - 1.5) * 0.12;
    mesh(backdrop, new THREE.TorusGeometry(0.075, 0.022, 6, 12), metal, 0.62 + index * 0.27, 1.8 - index * 0.02, -3.32);
  }

  if (!mobile) {
    for (const x of [-3.05, 3.05]) {
      const bollard = mesh(backdrop, new THREE.CylinderGeometry(0.09, 0.12, 0.74, 16), yellow, x, 0.33, -1.95);
      bollard.rotation.z = x * 0.01;
      mesh(backdrop, new THREE.TorusGeometry(0.12, 0.025, 6, 16), deep, x, 0.53, -1.95).rotation.x = Math.PI / 2;
    }
    const warm = new THREE.PointLight(0xffdca8, 18, 8, 2);
    warm.position.set(0, 3.1, 1.25);
    root.add(warm);
  }
  root.visible = false;
  return root;
}
