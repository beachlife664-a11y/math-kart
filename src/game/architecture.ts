import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldMaterials } from './materials';

function box(width: number, height: number, depth: number, material: THREE.Material, radius = 0): THREE.Mesh {
  const geometry = radius > 0 ? new RoundedBoxGeometry(width, height, depth, 1, radius) : new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const delta = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

function seatInstances(materials: WorldMaterials): THREE.Group {
  const group = new THREE.Group();
  const rows = 5;
  const columns = 7;
  const count = rows * columns;
  const seats = new THREE.InstancedMesh(new RoundedBoxGeometry(0.43, 0.12, 0.4, 1, 0.035), materials.cream, count);
  const backs = new THREE.InstancedMesh(new RoundedBoxGeometry(0.43, 0.36, 0.1, 1, 0.035), materials.coral, count);
  const torsos = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.12, 0.23, 2, 6), materials.teal, count);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.105, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe6b78e, roughness: 0.86 }), count);
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = -4.15 + column * 0.57;
      const y = 0.66 + row * 0.37;
      const z = -2.05 + row * 0.66;
      matrix.makeTranslation(x, y, z);
      seats.setMatrixAt(index, matrix);
      seats.setColorAt(index, new THREE.Color((row + column) % 3 === 0 ? 0x48b8b0 : 0xffedcf));
      matrix.makeTranslation(x, y + 0.24, z - 0.17);
      backs.setMatrixAt(index, matrix);
      backs.setColorAt(index, new THREE.Color((row + column) % 4 === 0 ? 0xffedcf : 0xf2554d));
      if ((row * columns + column) % 3 !== 0) {
        matrix.makeTranslation(x, y + 0.36, z + 0.02);
        torsos.setMatrixAt(index, matrix);
        matrix.makeTranslation(x, y + 0.68, z + 0.02);
        heads.setMatrixAt(index, matrix);
      } else {
        matrix.makeScale(0, 0, 0);
        torsos.setMatrixAt(index, matrix);
        heads.setMatrixAt(index, matrix);
      }
      index += 1;
    }
  }
  group.add(seats, backs, torsos, heads);
  return group;
}

function mergeStaticByMaterial(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  const originals: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material)) return;
    const relative = new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    const transformed = object.geometry.clone().applyMatrix4(relative);
    const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
    if (geometry !== transformed) transformed.dispose();
    const key = object.material.uuid;
    const bucket = buckets.get(key) || { material: object.material, geometries: [] };
    bucket.geometries.push(geometry);
    buckets.set(key, bucket);
    originals.push(object);
  });
  for (const object of originals) object.removeFromParent();
  for (const { material, geometries } of buckets.values()) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    geometries.forEach((item) => item.dispose());
  }
}

export function createGrandstand(materials: WorldMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = 'v4-grandstand-pit-architecture';
  const slab = box(10.4, 0.34, 6.6, materials.concrete, 0.08);
  slab.position.y = 0.17;
  root.add(slab);
  for (let row = 0; row < 5; row += 1) {
    const tier = box(4.5, 0.26 + row * 0.37, 0.67, materials.concrete);
    tier.position.set(-2.42, (0.26 + row * 0.37) / 2 + 0.32, -2.05 + row * 0.66);
    root.add(tier);
  }
  root.add(seatInstances(materials));

  for (let step = 0; step < 11; step += 1) {
    const stair = box(0.66, 0.14 + step * 0.17, 0.39, materials.concrete);
    stair.position.set(0.05, (0.14 + step * 0.17) / 2 + 0.33, -2.18 + step * 0.36);
    root.add(stair);
  }
  const railMaterial = materials.railDark;
  for (const x of [-4.75, -0.18]) {
    for (let post = 0; post < 6; post += 1) {
      const pole = box(0.07, 1.02, 0.07, railMaterial);
      pole.position.set(x, 1.1 + post * 0.33, -2.25 + post * 0.62);
      root.add(pole);
    }
    root.add(cylinderBetween(new THREE.Vector3(x, 1.55, -2.3), new THREE.Vector3(x, 3.45, 1.05), 0.04, railMaterial));
  }

  const roof = box(5.65, 0.16, 4.7, materials.cream, 0.04);
  roof.position.set(-2.38, 4.15, -0.55);
  roof.rotation.x = -0.075;
  root.add(roof);
  for (const x of [-4.75, -0.05]) {
    for (const z of [-2.35, 1.2]) {
      const support = box(0.12, 3.75, 0.12, materials.railDark);
      support.position.set(x, 2.12, z);
      root.add(support);
      root.add(cylinderBetween(new THREE.Vector3(x, 3.15, z), new THREE.Vector3(x + (x < -2 ? 0.7 : -0.7), 4.1, z), 0.045, materials.rail));
    }
  }
  for (let rib = 0; rib < 7; rib += 1) {
    const beam = box(0.06, 0.08, 4.75, materials.rail);
    beam.position.set(-4.85 + rib * 0.82, 4.04, -0.55);
    beam.rotation.x = -0.075;
    root.add(beam);
  }

  const garageBack = box(4.1, 2.8, 0.18, materials.cream);
  garageBack.position.set(2.55, 1.72, -2.35);
  root.add(garageBack);
  const garageSide = box(0.18, 2.8, 4.5, materials.cream);
  garageSide.position.set(4.55, 1.72, -0.15);
  root.add(garageSide);
  const garageRoof = box(4.5, 0.22, 4.95, materials.coral, 0.045);
  garageRoof.position.set(2.5, 3.18, -0.1);
  root.add(garageRoof);
  for (const x of [0.52, 2.5, 4.48]) {
    const column = box(0.18, 2.8, 0.18, materials.railDark);
    column.position.set(x, 1.72, 1.95);
    root.add(column);
  }
  const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(1.72, 0.095, 0.08), materials.teal, 24);
  const matrix = new THREE.Matrix4();
  for (let door = 0; door < 2; door += 1) {
    for (let slat = 0; slat < 12; slat += 1) {
      matrix.makeTranslation(1.5 + door * 2, 0.62 + slat * 0.18, 1.96);
      slats.setMatrixAt(door * 12 + slat, matrix);
    }
  }
  root.add(slats);
  for (let cabinet = 0; cabinet < 3; cabinet += 1) {
    const tool = box(0.42, 0.82, 0.34, cabinet % 2 ? materials.coral : materials.teal, 0.035);
    tool.position.set(0.95 + cabinet * 1.25, 0.77, 1.45);
    root.add(tool);
    for (let drawer = 0; drawer < 4; drawer += 1) {
      const line = box(0.3, 0.025, 0.02, materials.rail);
      line.position.set(tool.position.x, 0.52 + drawer * 0.15, 1.63);
      root.add(line);
    }
  }
  const awning = box(4.65, 0.09, 1.15, materials.cream);
  awning.position.set(2.5, 2.82, 2.35);
  awning.rotation.x = -0.16;
  root.add(awning);

  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.4, 8), materials.railDark);
  flagPole.position.set(-4.7, 5.3, -2.25);
  root.add(flagPole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.62, 5, 2), materials.coral);
  flag.position.set(-4.12, 6.12, -2.25);
  root.add(flag);
  mergeStaticByMaterial(root);
  return root;
}

export function createPitRow(materials: WorldMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = 'v4-pit-row';
  const base = box(9.5, 0.28, 4.4, materials.concrete, 0.06);
  base.position.y = 0.14;
  root.add(base);
  const back = box(9.2, 2.6, 0.2, materials.cream);
  back.position.set(0, 1.55, -1.85);
  root.add(back);
  const roof = box(9.8, 0.2, 4.7, materials.teal, 0.05);
  roof.position.set(0, 3.02, 0);
  root.add(roof);
  const doors = new THREE.InstancedMesh(new THREE.BoxGeometry(1.76, 0.085, 0.07), materials.railDark, 48);
  const matrix = new THREE.Matrix4();
  for (let bay = 0; bay < 4; bay += 1) {
    const x = -3.45 + bay * 2.3;
    for (const side of [-1.02, 1.02]) {
      const column = box(0.14, 2.6, 0.16, materials.railDark);
      column.position.set(x + side, 1.55, 1.85);
      root.add(column);
    }
    for (let slat = 0; slat < 12; slat += 1) {
      matrix.makeTranslation(x, 0.54 + slat * 0.18, 1.86);
      doors.setMatrixAt(bay * 12 + slat, matrix);
      doors.setColorAt(bay * 12 + slat, new THREE.Color(bay % 2 ? 0x3b8d91 : 0xd26053));
    }
    const vent = box(1.25, 0.36, 0.12, materials.railDark);
    vent.position.set(x, 2.66, 1.84);
    root.add(vent);
    for (let fin = 0; fin < 6; fin += 1) {
      const slatVent = box(0.055, 0.29, 0.035, materials.rail);
      slatVent.position.set(x - 0.5 + fin * 0.2, 2.66, 1.92);
      root.add(slatVent);
    }
    const cabinet = box(0.46, 0.82, 0.38, bay % 2 ? materials.coral : materials.teal, 0.025);
    cabinet.position.set(x - 0.62, 0.68, 1.36);
    root.add(cabinet);
  }
  root.add(doors);
  const canopy = box(9.6, 0.08, 1.05, materials.cream);
  canopy.position.set(0, 2.55, 2.18);
  canopy.rotation.x = -0.14;
  root.add(canopy);
  mergeStaticByMaterial(root);
  return root;
}
