import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { WorldMaterials } from './materials';
import { TRACK_OBSTACLES, Track } from './track';

function yawFor(track: Track, distance: number): number {
  const tangent = track.getFrame(distance).tangent;
  return Math.atan2(tangent.x, tangent.z);
}

function compose(position: THREE.Vector3, yaw: number, scale = new THREE.Vector3(1, 1, 1)): THREE.Matrix4 {
  return new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), scale);
}

function curbGeometryForQuality(mobile: boolean): THREE.BufferGeometry {
  if (mobile) return new THREE.BoxGeometry(0.5, 0.16, 1.52);
  const shape = new THREE.Shape();
  const x = -0.25;
  const y = -0.08;
  const w = 0.5;
  const h = 0.16;
  const r = 0.035;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1.52, steps: 1, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -0.76);
  return geometry;
}

function arrowGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.05);
  shape.lineTo(0.58, 0.25);
  shape.lineTo(0.2, 0.25);
  shape.lineTo(0.2, -0.85);
  shape.lineTo(-0.2, -0.85);
  shape.lineTo(-0.2, 0.25);
  shape.lineTo(-0.58, 0.25);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function grateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#263c42';
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = '#91a3a2';
  context.lineWidth = 5;
  context.strokeRect(4, 4, 120, 120);
  for (let x = 13; x < 120; x += 14) {
    context.fillStyle = '#101f24';
    context.fillRect(x, 10, 7, 108);
    context.fillStyle = 'rgba(255,255,255,.24)';
    context.fillRect(x + 7, 10, 2, 108);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addRoadSurface(group: THREE.Group, track: Track, materials: WorldMaterials, mobile: boolean): void {
  const segments = mobile ? 440 : 720;
  const cross = [-6.4, -5.95, -3.2, 0, 3.2, 5.95, 6.4];
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  for (let i = 0; i <= segments; i += 1) {
    const distance = (i / segments) * track.length;
    const frame = track.getFrame(distance);
    const section = track.getSection(distance).id;
    color.set(section === 'cave' ? 0xb5c5ca : section === 'harbor' ? 0xeee7dc : section === 'bridge' ? 0xdce9ee : 0xe5e9e8);
    for (let j = 0; j < cross.length; j += 1) {
      const lane = cross[j];
      const position = frame.position.clone().addScaledVector(frame.normal, lane);
      const crown = 0.055 * (1 - (lane / 6.4) ** 2);
      const bank = THREE.MathUtils.clamp(track.getCurvature(distance) * lane * 0.07, -0.045, 0.045);
      position.y += crown + bank;
      positions.push(position.x, position.y, position.z);
      uvs.push(j / (cross.length - 1) * 1.4, distance / 4.8);
      colors.push(color.r, color.g, color.b);
      if (i < segments && j < cross.length - 1) {
        const a = i * cross.length + j;
        const b = a + cross.length;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const road = new THREE.Mesh(geometry, materials.road);
  road.name = 'v4-crowned-asphalt-with-metric-uv';
  road.receiveShadow = true;
  group.add(road);
}

function addCurbsAndMarkings(group: THREE.Group, track: Track, materials: WorldMaterials, mobile: boolean): void {
  const curbCount = Math.floor(track.length / 1.6);
  const curbGeometry = curbGeometryForQuality(mobile);
  const curbs = new THREE.InstancedMesh(curbGeometry, materials.curb, curbCount * 2);
  const dashCount = Math.floor(track.length / 6.4);
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.105, 0.022, 1.65), materials.cream, dashCount * 4);
  const reflectorCount = Math.floor(track.length / 6.8);
  const reflectors = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.065, 0.28), materials.reflector, reflectorCount * 2);
  const seams = new THREE.InstancedMesh(new THREE.BoxGeometry(11.7, 0.012, 0.055), materials.railDark, Math.floor(track.length / 29));
  let seamIndex = 0;
  for (let i = 0; i < curbCount; i += 1) {
    const distance = (i / curbCount) * track.length;
    const frame = track.getFrame(distance);
    const yaw = yawFor(track, distance);
    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const side = sideIndex === 0 ? -1 : 1;
      const position = frame.position.clone().addScaledVector(frame.normal, side * 6.55);
      position.y += 0.07;
      const index = i * 2 + sideIndex;
      curbs.setMatrixAt(index, compose(position, yaw));
      curbs.setColorAt(index, new THREE.Color((i + sideIndex) % 2 === 0 ? 0xffedcf : 0xf2554d));
    }
  }
  let dashIndex = 0;
  for (let i = 0; i < dashCount; i += 1) {
    const distance = (i / dashCount) * track.length;
    const frame = track.getFrame(distance);
    const yaw = yawFor(track, distance);
    for (const lane of [-2.7, -0.9, 0.9, 2.7]) {
      const position = frame.position.clone().addScaledVector(frame.normal, lane);
      position.y += 0.072;
      dashes.setMatrixAt(dashIndex, compose(position, yaw));
      dashIndex += 1;
    }
  }
  for (let i = 0; i < reflectorCount; i += 1) {
    const distance = (i / reflectorCount) * track.length;
    const frame = track.getFrame(distance);
    const yaw = yawFor(track, distance);
    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const position = frame.position.clone().addScaledVector(frame.normal, (sideIndex === 0 ? -1 : 1) * 6.02);
      position.y += 0.095;
      reflectors.setMatrixAt(i * 2 + sideIndex, compose(position, yaw));
    }
  }
  for (let i = 0; i < seams.count; i += 1) {
    const distance = (i / seams.count) * track.length + 9;
    const frame = track.getFrame(distance);
    frame.position.y += 0.068;
    seams.setMatrixAt(seamIndex, compose(frame.position, yawFor(track, distance)));
    seamIndex += 1;
  }
  group.add(curbs, dashes, reflectors, seams);

  const arrowMaterial = new THREE.MeshStandardMaterial({ color: 0xf4bd32, emissive: 0xf4bd32, emissiveIntensity: 0.18, roughness: 0.66, side: THREE.DoubleSide });
  const arrows = new THREE.InstancedMesh(arrowGeometry(), arrowMaterial, 16);
  for (let i = 0; i < arrows.count; i += 1) {
    const progress = i < 6 ? 0.19 + i * 0.022 : 0.79 + (i - 6) * 0.018;
    const frame = track.getFrame(progress * track.length, i % 2 ? 1.8 : -1.8);
    frame.position.y += 0.08;
    arrows.setMatrixAt(i, compose(frame.position, yawFor(track, progress * track.length), new THREE.Vector3(0.75, 0.75, 0.75)));
  }
  group.add(arrows);

  const grateMaterial = new THREE.MeshStandardMaterial({ map: grateTexture(), roughness: 0.54, metalness: 0.62 });
  const grates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 0.035, 0.85), grateMaterial, 28);
  for (let i = 0; i < grates.count; i += 1) {
    const progress = 0.025 + i * 0.0115;
    const frame = track.getFrame(progress * track.length, i % 2 ? 5.7 : -5.7);
    frame.position.y += 0.065;
    grates.setMatrixAt(i, compose(frame.position, yawFor(track, progress * track.length)));
  }
  group.add(grates);
}

function addGuardrails(group: THREE.Group, track: Track, materials: WorldMaterials, mobile: boolean): void {
  const ranges: [number, number][] = [[0.39, 0.57], [0.758, 0.978]];
  const placements: { distance: number; side: number }[] = [];
  for (const [start, end] of ranges) {
    const count = Math.floor((end - start) * track.length / 2.05);
    for (let i = 0; i <= count; i += 1) {
      const progress = start + (i / count) * (end - start);
      if (progress > 0.52 && progress < 0.58) continue;
      for (const side of [-1, 1]) placements.push({ distance: progress * track.length, side });
    }
  }
  const postGeometry = new THREE.BoxGeometry(0.2, 1.08, 0.22);
  const upperGeometry = mobile ? new THREE.BoxGeometry(0.18, 0.2, 2.13) : new RoundedBoxGeometry(0.18, 0.2, 2.13, 1, 0.05);
  const lowerGeometry = new THREE.BoxGeometry(0.12, 0.13, 2.13);
  const baseGeometry = new THREE.BoxGeometry(0.44, 0.12, 0.42);
  const capGeometry = new THREE.SphereGeometry(0.135, mobile ? 6 : 5, mobile ? 4 : 3);
  const posts = new THREE.InstancedMesh(postGeometry, materials.railDark, placements.length);
  const upper = new THREE.InstancedMesh(upperGeometry, materials.rail, placements.length);
  const lower = new THREE.InstancedMesh(lowerGeometry, materials.railDark, placements.length);
  const bases = new THREE.InstancedMesh(baseGeometry, materials.railDark, placements.length);
  const caps = new THREE.InstancedMesh(capGeometry, materials.rail, placements.length);
  const plates = new THREE.InstancedMesh(new RoundedBoxGeometry(0.055, 0.2, 0.3, 1, 0.018), materials.reflector, Math.ceil(placements.length / 4));
  let plateIndex = 0;
  placements.forEach(({ distance, side }, index) => {
    const frame = track.getFrame(distance);
    const yaw = yawFor(track, distance);
    const base = frame.position.clone().addScaledVector(frame.normal, side * 6.83);
    const post = base.clone(); post.y += 0.56;
    const top = base.clone(); top.y += 0.96;
    const bottom = base.clone(); bottom.y += 0.56;
    const footing = base.clone(); footing.y += 0.06;
    const cap = base.clone(); cap.y += 1.11;
    posts.setMatrixAt(index, compose(post, yaw));
    upper.setMatrixAt(index, compose(top, yaw));
    lower.setMatrixAt(index, compose(bottom, yaw));
    bases.setMatrixAt(index, compose(footing, yaw));
    caps.setMatrixAt(index, compose(cap, yaw));
    if (index % 4 === 0 && plateIndex < plates.count) {
      const plate = base.clone().addScaledVector(frame.normal, -side * 0.11); plate.y += 0.96;
      plates.setMatrixAt(plateIndex, compose(plate, yaw));
      plateIndex += 1;
    }
  });
  plates.count = plateIndex;
  group.add(posts, upper, lower, bases, caps, plates);
}

function addTireBarriers(group: THREE.Group, track: Track, materials: WorldMaterials, mobile: boolean): void {
  const tireGeometry = new THREE.TorusGeometry(0.235, 0.088, mobile ? 5 : 6, mobile ? 12 : 16);
  tireGeometry.rotateX(Math.PI / 2);
  const tires = new THREE.InstancedMesh(tireGeometry, materials.rubber, TRACK_OBSTACLES.length * 12);
  const straps = new THREE.InstancedMesh(new RoundedBoxGeometry(0.055, 0.83, 0.08, 1, 0.015), materials.teal, TRACK_OBSTACLES.length * 2);
  const boards = new THREE.InstancedMesh(new RoundedBoxGeometry(1.55, 0.18, 0.09, 1, 0.025), materials.cream, TRACK_OBSTACLES.length);
  const stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.23, 0.185, 0.012), materials.coral, TRACK_OBSTACLES.length * 5);
  TRACK_OBSTACLES.forEach((obstacle, obstacleIndex) => {
    const distance = obstacle.at * track.length;
    const frame = track.getFrame(distance, obstacle.lane);
    const yaw = yawFor(track, distance);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const local = new THREE.Vector3((column - 1.5) * 0.39, 0.18 + row * 0.24, 0).applyQuaternion(rotation).add(frame.position);
        tires.setMatrixAt(obstacleIndex * 12 + row * 4 + column, compose(local, yaw));
      }
    }
    for (let i = 0; i < 2; i += 1) {
      const local = new THREE.Vector3(i === 0 ? -0.43 : 0.43, 0.43, 0.105).applyQuaternion(rotation).add(frame.position);
      straps.setMatrixAt(obstacleIndex * 2 + i, compose(local, yaw));
    }
    const board = frame.position.clone(); board.y += 0.18;
    board.addScaledVector(frame.normal, -0.18);
    boards.setMatrixAt(obstacleIndex, compose(board, yaw));
    for (let i = 0; i < 5; i += 1) {
      const stripe = new THREE.Vector3((i - 2) * 0.29, 0.18, -0.232).applyQuaternion(rotation).add(frame.position);
      stripes.setMatrixAt(obstacleIndex * 5 + i, compose(stripe, yaw));
    }
  });
  group.add(tires, straps, boards, stripes);
}

export function createRoadKit(track: Track, materials: WorldMaterials, mobile: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'v4-authored-road-kit';
  addRoadSurface(group, track, materials, mobile);
  addCurbsAndMarkings(group, track, materials, mobile);
  addGuardrails(group, track, materials, mobile);
  addTireBarriers(group, track, materials, mobile);
  return group;
}
