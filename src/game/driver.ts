import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { KartSpec } from './types';

function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function limb(parent: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, mobile: boolean): THREE.Mesh {
  const delta = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, delta.length() - radius * 2), 3, mobile ? 5 : 8), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  parent.add(mesh);
  return mesh;
}

function mergeStatic(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  const originals: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const transformed = object.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
    if (geometry !== transformed) transformed.dispose();
    const bucket = buckets.get(object.material.uuid) || { material: object.material, geometries: [] };
    bucket.geometries.push(geometry);
    buckets.set(object.material.uuid, bucket);
    originals.push(object);
  });
  originals.forEach((mesh) => mesh.removeFromParent());
  for (const { material, geometries } of buckets.values()) {
    const geometry = mergeGeometries(geometries, false);
    if (geometry) root.add(new THREE.Mesh(geometry, material));
    geometries.forEach((item) => item.dispose());
  }
}

export function createDetailedDriver(chassis: THREE.Group, spec: KartSpec, mobile = false): { driver: THREE.Group; arms: THREE.Group } {
  const rounded = (width: number, height: number, depth: number, segments: number, radius: number): THREE.BufferGeometry => (
    mobile ? new THREE.BoxGeometry(width, height, depth) : new RoundedBoxGeometry(width, height, depth, segments, radius)
  );
  const driver = new THREE.Group();
  driver.name = `v6-${spec.id}-driver`;
  driver.position.set(...spec.rig.driverPosition);
  driver.scale.setScalar(spec.rig.driverScale);
  chassis.add(driver);
  const body = new THREE.Group();
  driver.add(body);

  const suit = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.74 });
  const suitDark = mobile ? suit : new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.color).multiplyScalar(0.43), roughness: 0.82 });
  const accent = new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.56 });
  const helmetColor = new THREE.Color(spec.color).lerp(new THREE.Color(0xfff5df), 0.58);
  const helmet = new THREE.MeshPhysicalMaterial({ color: helmetColor, roughness: 0.22, clearcoat: 0.92, clearcoatRoughness: 0.14 });
  const visor = new THREE.MeshPhysicalMaterial({ color: 0x153c50, roughness: 0.08, metalness: 0.32, clearcoat: 1, transparent: true, opacity: 0.94 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x17252c, roughness: 0.9 });
  const metal = mobile ? rubber : new THREE.MeshStandardMaterial({ color: 0xbac9cb, roughness: 0.28, metalness: 0.78 });
  const stitching = mobile ? accent : new THREE.MeshStandardMaterial({ color: 0xf7e9cf, roughness: 0.8 });

  const pelvis = add(body, rounded(0.33, 0.19, 0.28, 2, 0.06), suitDark, [0, 0.07, 0.015]);
  pelvis.rotation.x = -0.08;
  const torso = add(body, rounded(0.39, 0.43, 0.28, 3, 0.085), suit, [0, 0.3, 0]);
  torso.rotation.x = -0.075;
  const jacketPanel = add(body, rounded(0.22, 0.29, 0.025, 2, 0.018), suitDark, [0, 0.31, 0.151]);
  jacketPanel.rotation.x = -0.075;
  const belt = add(body, rounded(0.36, 0.065, 0.3, 1, 0.02), rubber, [0, 0.12, 0.015]);
  belt.rotation.x = -0.08;
  add(body, rounded(0.075, 0.055, 0.025, 1, 0.01), metal, [0, 0.12, 0.175]);
  for (const side of [-1, 1]) {
    const strap = add(body, new THREE.BoxGeometry(0.047, 0.36, 0.024), accent, [side * 0.105, 0.33, 0.164]);
    strap.rotation.z = side * 0.28;
    strap.rotation.x = -0.075;
    const shoulder = add(body, new THREE.SphereGeometry(0.115, 12, 8), suit, [side * 0.225, 0.44, 0]);
    shoulder.scale.set(1.1, 0.8, 1);
    const thighStart = new THREE.Vector3(side * 0.115, 0.065, 0.04);
    const knee = new THREE.Vector3(side * 0.145, -0.075, 0.34);
    const ankle = new THREE.Vector3(side * 0.14, -0.25, 0.51);
    limb(body, thighStart, knee, 0.085, suit, mobile);
    add(body, new THREE.SphereGeometry(0.09, 10, 7), suitDark, [knee.x, knee.y, knee.z]);
    limb(body, knee, ankle, 0.068, suitDark, mobile);
    const boot = add(body, rounded(0.16, 0.13, 0.28, 2, 0.04), rubber, [side * 0.14, -0.27, 0.57]);
    boot.rotation.x = 0.18;
    add(body, new THREE.BoxGeometry(0.12, 0.018, 0.19), stitching, [side * 0.14, -0.2, 0.58]);
  }
  const collar = add(body, new THREE.TorusGeometry(0.115, 0.032, 8, 20), suitDark, [0, 0.52, 0]);
  collar.rotation.x = Math.PI / 2;

  const helmetShell = add(body, new THREE.SphereGeometry(0.25, mobile ? 18 : 28, mobile ? 12 : 18), helmet, [0, 0.72, 0.015]);
  helmetShell.scale.set(1, 1.04, 0.98);
  const visorMesh = add(body, new THREE.SphereGeometry(0.256, mobile ? 20 : 28, mobile ? 10 : 14, Math.PI * 0.22, Math.PI * 0.56, Math.PI * 0.34, Math.PI * 0.25), visor, [0, 0.72, 0.015]);
  visorMesh.scale.set(1, 1.04, 0.98);
  const chin = add(body, rounded(0.33, 0.145, 0.2, 3, 0.05), helmet, [0, 0.58, 0.13]);
  chin.rotation.x = -0.09;
  add(body, rounded(0.19, 0.035, 0.022, 1, 0.008), rubber, [0, 0.585, 0.236]);
  const stripeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.79, 0.225),
    new THREE.Vector3(0, 0.955, 0.06),
    new THREE.Vector3(0, 0.92, -0.15),
    new THREE.Vector3(0, 0.76, -0.23),
  ]);
  add(body, new THREE.TubeGeometry(stripeCurve, 20, 0.027, 7, false), accent, [0, 0, 0]);
  for (const side of [-1, 1]) {
    const pod = add(body, new THREE.CylinderGeometry(0.055, 0.055, 0.025, 12), accent, [side * 0.245, 0.69, 0.005]);
    pod.rotation.z = Math.PI / 2;
    const screw = add(body, new THREE.CylinderGeometry(0.015, 0.015, 0.029, 8), metal, [side * 0.253, 0.69, 0.005]);
    screw.rotation.z = Math.PI / 2;
  }
  for (let vent = -1; vent <= 1; vent += 1) add(body, new THREE.BoxGeometry(0.035, 0.07, 0.018), rubber, [vent * 0.055, 0.72, -0.237]);
  const rearStripe = add(body, rounded(0.075, 0.24, 0.025, 2, 0.012), accent, [0, 0.78, -0.235]);
  rearStripe.rotation.x = -0.18;
  mergeStatic(body);

  const arms = new THREE.Group();
  arms.position.set(...spec.rig.armsPosition);
  driver.add(arms);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * 0.22, 0.01, 0);
    const elbow = new THREE.Vector3(side * 0.255, -0.1, 0.19);
    const wrist = new THREE.Vector3(side * 0.13, -0.18, 0.35);
    limb(arms, shoulder, elbow, 0.065, suit, mobile);
    add(arms, new THREE.SphereGeometry(0.07, 10, 7), suitDark, [elbow.x, elbow.y, elbow.z]);
    limb(arms, elbow, wrist, 0.055, suitDark, mobile);
    const glove = add(arms, rounded(0.115, 0.09, 0.13, 2, 0.028), rubber, [wrist.x, wrist.y, wrist.z]);
    glove.rotation.y = side * 0.2;
    add(arms, new THREE.BoxGeometry(0.075, 0.018, 0.07), accent, [wrist.x, wrist.y + 0.05, wrist.z]);
  }
  mergeStatic(arms);
  const steering = new THREE.Group();
  steering.name = 'driver-steering-wheel';
  const wheel = add(steering, new THREE.TorusGeometry(0.18, 0.024, 8, 24), rubber, [0, -0.19, 0.35]);
  wheel.rotation.x = -0.62;
  for (let spoke = 0; spoke < 3; spoke += 1) {
    const bar = add(steering, new THREE.BoxGeometry(0.028, 0.15, 0.018), metal, [0, -0.19, 0.35]);
    bar.rotation.z = (spoke / 3) * Math.PI * 2;
    bar.rotation.x = -0.62;
  }
  add(steering, new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), accent, [0, -0.19, 0.35]).rotation.x = Math.PI / 2 - 0.62;
  mergeStatic(steering);
  arms.add(steering);
  return { driver, arms };
}
