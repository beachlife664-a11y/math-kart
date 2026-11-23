import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { EnvironmentAssetId, LoadedEnvironmentModel, LoadedLandmarkModel, LandmarkId } from './assets';
import { createGrandstand, createPitRow } from './architecture';
import { createWorldMaterials, type WorldMaterials } from './materials';
import { createNatureSystems, enableTerrainSplat, type NatureSystems } from './nature';
import { createRoadKit } from './roadKit';
import { SECTION_CHALLENGES, TRACK_OBSTACLES, Track } from './track';

function terrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 256, 256);
  let seed = 113;
  for (let i = 0; i < 2600; i += 1) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % 256;
    seed = (seed * 16807) % 2147483647;
    const y = seed % 256;
    context.fillStyle = i % 2 ? 'rgba(70,56,35,.07)' : 'rgba(255,255,255,.12)';
    context.fillRect(x, y, 1 + (i % 2), 1 + (i % 3 === 0 ? 1 : 0));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 36);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createWaterfallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 128, 0);
  gradient.addColorStop(0, 'rgba(160,238,244,0)');
  gradient.addColorStop(0.2, 'rgba(154,236,242,.48)');
  gradient.addColorStop(0.52, 'rgba(229,255,251,.74)');
  gradient.addColorStop(0.82, 'rgba(116,214,231,.42)');
  gradient.addColorStop(1, 'rgba(120,220,235,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 256);
  for (let line = 0; line < 19; line += 1) {
    const x = 7 + (line * 29) % 116;
    context.strokeStyle = line % 3 === 0 ? 'rgba(255,255,255,.65)' : 'rgba(205,250,250,.34)';
    context.lineWidth = line % 4 === 0 ? 2 : 1;
    context.beginPath();
    context.moveTo(x, -10);
    for (let y = 0; y <= 270; y += 16) context.lineTo(x + Math.sin(y * 0.055 + line) * 3.5, y);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1.6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMistTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(238,255,252,.78)');
  gradient.addColorStop(0.45, 'rgba(213,249,247,.38)');
  gradient.addColorStop(1, 'rgba(199,240,242,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function smoothstep(min: number, max: number, value: number): number {
  const x = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

function containerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 256, 128);
  for (let x = 4; x < 256; x += 12) {
    context.fillStyle = 'rgba(20,35,40,.17)';
    context.fillRect(x, 4, 3, 120);
    context.fillStyle = 'rgba(255,255,255,.24)';
    context.fillRect(x + 3, 4, 2, 120);
  }
  context.strokeStyle = 'rgba(20,35,40,.32)';
  context.lineWidth = 3;
  context.strokeRect(3, 3, 250, 122);
  context.fillStyle = 'rgba(255,244,214,.72)';
  context.fillRect(154, 46, 66, 25);
  context.fillStyle = 'rgba(30,50,54,.38)';
  for (let i = 0; i < 5; i += 1) context.fillRect(160, 51 + i * 4, 48 - i * 5, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function textTexture(text: string, background: string, foreground: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = background;
  context.fillRect(0, 0, 512, 128);
  context.fillStyle = foreground;
  context.font = '900 54px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 256, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position?: THREE.Vector3): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  if (position) result.position.copy(position);
  result.receiveShadow = true;
  return result;
}

interface CameraObstacle {
  box: THREE.Box3;
  matrix: THREE.Matrix4;
  inverse: THREE.Matrix4;
}

interface CameraFadeModel {
  boxes: THREE.Box3[];
  materials: THREE.Material[];
  opacity: number;
  fadeDistance?: number;
  fadeOpacity?: number;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly track = new Track();
  private readonly animated: THREE.Object3D[] = [];
  private readonly landmarkSlots = new Map<string, THREE.Group>();
  private readonly environmentTransforms: Record<EnvironmentAssetId, THREE.Matrix4[]> = { boat: [], palm: [], cliff: [], hill: [] };
  private readonly environmentFallbacks: Record<EnvironmentAssetId, THREE.Object3D[]> = { boat: [], palm: [], cliff: [], hill: [] };
  private readonly crystalMaterial = new THREE.MeshStandardMaterial({ color: 0x7df9ff, emissive: 0x28cfe8, emissiveIntensity: 1.25, roughness: 0.24 });
  private readonly mobile: boolean;
  private readonly cameraObstacles: CameraObstacle[] = [];
  readonly removedRoadBlockers: Array<{ asset: EnvironmentAssetId; index: number }> = [];
  private readonly cameraFadeModels: CameraFadeModel[] = [];
  private terrain?: THREE.Mesh;
  private terrainHeights?: Float32Array;
  private terrainDivisions = 0;
  private terrainExtent = 0;
  private readonly groundMeshes: THREE.Object3D[] = [];
  private readonly materials: WorldMaterials;
  private nature?: NatureSystems;
  private waterfallTexture?: THREE.CanvasTexture;

  constructor(renderer: THREE.WebGLRenderer, mobile: boolean, random: () => number) {
    this.mobile = mobile;
    this.materials = createWorldMaterials(mobile);
    enableTerrainSplat(this.materials.terrain, this.materials.cave.map as THREE.Texture, this.materials.sand.map as THREE.Texture);
    this.scene.background = new THREE.Color(0xa9e3ed);
    this.scene.fog = new THREE.Fog(0xa9e3ed, 100, 300);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.58;
    pmrem.dispose();
    this.addSky();
    this.addLighting();
    this.addTrack();
    this.nature = createNatureSystems(
      this.track,
      this.materials,
      mobile,
      random,
      (progress, lane, roadY) => this.terrainElevation(progress, lane, roadY),
    );
    this.scene.add(this.nature.root);
    this.addLandmarkSlots();
    this.addEnvironment(random);
  }

  private addSky(): void {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(440, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x58bfe4) },
          horizon: { value: new THREE.Color(0xe8fbf3) },
          sun: { value: new THREE.Color(0xfff1b5) },
        },
        vertexShader: 'varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w;}',
        fragmentShader: `
          varying vec3 vDir;
          uniform vec3 top;
          uniform vec3 horizon;
          uniform vec3 sun;
          void main() {
            float h = clamp(vDir.y * .5 + .5, 0., 1.);
            vec3 c = mix(horizon, top, pow(h, .72));
            vec3 direction = normalize(vDir);
            vec3 sunDirection = normalize(vec3(.45, .32, .5));
            float d = max(0., dot(direction, sunDirection));
            c += sun * (pow(d, 850.) * 1.15 + pow(d, 18.) * .11);
            float cirrus = sin(direction.x * 58. + direction.z * 31.) * sin(direction.z * 73. - direction.x * 17.);
            cirrus = smoothstep(.62, .94, cirrus) * smoothstep(.1, .42, direction.y) * (1. - smoothstep(.58, .85, direction.y));
            c = mix(c, vec3(.94, .98, 1.), cirrus * .16);
            float horizonHaze = pow(1. - abs(direction.y), 9.);
            c = mix(c, horizon, horizonHaze * .24);
            gl_FragColor = vec4(c, 1.);
          }
        `,
      }),
    );
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  private addLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xe5fbff, 0x426b64, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1d2, 1.85);
    sun.position.set(-45, 80, 35);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8eeeff, 0.65);
    rim.position.set(35, 28, -45);
    this.scene.add(rim);
  }

  private addTrack(): void {
    const sand = mesh(new THREE.CircleGeometry(102, 96), this.materials.sand, new THREE.Vector3(18, -2.55, 4));
    sand.rotation.x = -Math.PI / 2;
    this.scene.add(sand);
    this.addContinuousTerrain();
    this.scene.add(createRoadKit(this.track, this.materials, this.mobile));
    this.addStartArch();
    this.addSectionGates();
  }

  private terrainElevation(progress: number, lane: number, roadY: number): number {
    const distance = Math.abs(lane);
    const shoulder = smoothstep(6.4, 18, distance);
    const noise = Math.sin(progress * 173 + lane * 0.37) * 0.24 + Math.sin(progress * 71 - lane * 0.21) * 0.18;
    let height = roadY - 0.2;
    if (progress < 0.18) {
      height = THREE.MathUtils.lerp(roadY - 0.2, -2.25 + noise, shoulder);
    } else if (progress < 0.38) {
      const quay = roadY - 0.35 - smoothstep(9, 20, distance) * 0.65;
      const natural = lane > 0 ? quay : THREE.MathUtils.lerp(roadY - 0.2, -2.25 + noise, shoulder);
      height = THREE.MathUtils.lerp(natural, -3.2, smoothstep(20, 30, distance));
    } else if (progress < 0.58) {
      const inland = Math.min(9, Math.max(0, distance - 6.4) * 0.5) * smoothstep(0.37, 0.44, progress);
      const seaward = Math.min(roadY + 2.4, Math.max(0, distance - 6.4) * 0.62) * smoothstep(0.37, 0.43, progress);
      height = roadY - 0.2 + shoulder * (lane < 0 ? inland : -seaward) + noise * shoulder;
    } else if (progress < 0.76) {
      height = roadY - 0.2 + shoulder * (6.5 + Math.sin(progress * 41) * 2 + noise);
    } else {
      height = THREE.MathUtils.lerp(roadY - 0.2, -3.25, smoothstep(6.4, 14, distance));
    }
    const bridgeBlend = smoothstep(0.752, 0.782, progress) * (1 - smoothstep(0.982, 0.998, progress));
    return THREE.MathUtils.lerp(height, -5.4, bridgeBlend);
  }

  private addContinuousTerrain(): void {
    const divisions = this.mobile ? 84 : 120;
    const extent = 152;
    const stride = divisions + 1;
    const heights = new Float32Array(stride * stride);
    const samples = Array.from({ length: 481 }, (_, index) => ({
      progress: index / 480,
      frame: this.track.getFrame((index / 480) * this.track.length),
    }));
    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const surfaces: number[] = [];
    const indices: number[] = [];
    const color = new THREE.Color();
    for (let iz = 0; iz <= divisions; iz += 1) {
      const z = -extent + (iz / divisions) * extent * 2;
      for (let ix = 0; ix <= divisions; ix += 1) {
        const x = -extent + (ix / divisions) * extent * 2;
        let nearest = samples[0];
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const sample of samples) {
          const dx = x - sample.frame.position.x;
          const dz = z - sample.frame.position.z;
          const distanceSquared = dx * dx + dz * dz;
          if (distanceSquared < bestDistance) {
            bestDistance = distanceSquared;
            nearest = sample;
          }
        }
        const dx = x - nearest.frame.position.x;
        const dz = z - nearest.frame.position.z;
        const lane = dx * nearest.frame.normal.x + dz * nearest.frame.normal.z;
        const distance = Math.sqrt(bestDistance);
        const coast = smoothstep(30, 52, distance);
        const naturalHeight = this.terrainElevation(nearest.progress, lane, nearest.frame.position.y);
        const height = THREE.MathUtils.lerp(naturalHeight, -4.4, coast);
        heights[iz * stride + ix] = height;
        positions.push(x, height, z);
        const progress = nearest.progress;
        const cliffUv = progress >= 0.38 && progress < 0.58 && distance > 8;
        uvs.push(cliffUv ? (x + z) / 18 : x / 7, cliffUv ? height / 11 + z / 55 : z / 7);
        let surface = 0;
        if (progress >= 0.75 && progress < 0.995) {
          color.set(0xeee3c7);
          surface = 1;
        } else if (progress >= 0.58) {
          color.set(distance < 9 ? 0x9ca9aa : 0xb7c0b5);
          surface = 2;
        } else if (progress >= 0.38) {
          color.set(distance > 9 ? 0xb9bcb2 : 0xc6d4ae);
          surface = smoothstep(7.5, 11, distance) * 2;
        } else if (progress >= 0.18) {
          color.set(distance < 20 && lane > 0 ? 0xeee2c9 : distance > 19 ? 0xf0deb6 : 0xc4d8b0);
          surface = lane > 0 ? 1 : smoothstep(18, 31, distance);
        } else {
          color.set(distance > 18 ? 0xf0deb6 : 0xc3dbae);
          surface = smoothstep(16, 29, distance);
        }
        surfaces.push(surface);
        color.multiplyScalar(0.98 + Math.sin(x * 0.31 + z * 0.17) * 0.025);
        colors.push(color.r, color.g, color.b);
        if (iz < divisions && ix < divisions) {
          const a = iz * stride + ix;
          const b = a + stride;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    this.terrainHeights = heights;
    this.terrainDivisions = divisions;
    this.terrainExtent = extent;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('surface', new THREE.Float32BufferAttribute(surfaces, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const terrain = mesh(geometry, this.materials.terrain);
    terrain.name = 'single-valued-island-heightfield';
    this.terrain = terrain;
    this.scene.add(terrain);
    this.groundMeshes.push(terrain);
  }

  private groundHeightAt(x: number, z: number, fallback: number): number {
    if (!this.terrain) return fallback;
    const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObjects(this.groundMeshes, false)[0];
    return hit ? hit.point.y : fallback;
  }

  private cameraTerrainHeight(x: number, z: number, fallback: number): number {
    const heights = this.terrainHeights;
    if (!heights || this.terrainDivisions <= 0 || this.terrainExtent <= 0) return fallback;
    const gx = ((x + this.terrainExtent) / (this.terrainExtent * 2)) * this.terrainDivisions;
    const gz = ((z + this.terrainExtent) / (this.terrainExtent * 2)) * this.terrainDivisions;
    if (gx < 0 || gz < 0 || gx > this.terrainDivisions || gz > this.terrainDivisions) return fallback;
    const x0 = Math.min(this.terrainDivisions - 1, Math.floor(gx));
    const z0 = Math.min(this.terrainDivisions - 1, Math.floor(gz));
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const tx = gx - x0;
    const tz = gz - z0;
    const stride = this.terrainDivisions + 1;
    const a = THREE.MathUtils.lerp(heights[z0 * stride + x0], heights[z0 * stride + x1], tx);
    const b = THREE.MathUtils.lerp(heights[z1 * stride + x0], heights[z1 * stride + x1], tx);
    return THREE.MathUtils.lerp(a, b, tz);
  }

  private addStartArch(): void {
    const group = this.groupAt(0.005, 0);
    const ivory = new THREE.MeshStandardMaterial({ color: 0xfff0cf, roughness: 0.55 });
    const coral = new THREE.MeshStandardMaterial({ color: 0xf2554d, roughness: 0.48 });
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 5.8, 12), ivory, 2);
    const coralParts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), coral, 3);
    const archMatrix = new THREE.Matrix4();
    [-6.4, 6.4].forEach((x, index) => {
      archMatrix.makeTranslation(x, 2.9, 0); posts.setMatrixAt(index, archMatrix);
      archMatrix.compose(new THREE.Vector3(x, 5.9, 0), new THREE.Quaternion(), new THREE.Vector3(0.68, 0.68, 0.68)); coralParts.setMatrixAt(index, archMatrix);
    });
    archMatrix.compose(new THREE.Vector3(0, 5.35, 0), new THREE.Quaternion(), new THREE.Vector3(13.3, 0.3, 0.35));
    coralParts.setMatrixAt(2, archMatrix);
    group.add(posts, coralParts);
    const banner = mesh(new THREE.PlaneGeometry(7.2, 1.8), new THREE.MeshBasicMaterial({ map: textTexture('MATH KART', '#f2554d', '#fff4d6'), side: THREE.DoubleSide }), new THREE.Vector3(0, 4.55, 0.02));
    banner.rotation.y = Math.PI;
    group.add(banner);
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.1 }), 3);
    for (let i = 0; i < 3; i += 1) {
      archMatrix.makeTranslation((i - 1) * 0.7, 5.75, 0);
      lights.setMatrixAt(i, archMatrix);
      lights.setColorAt(i, new THREE.Color([0xf2554d, 0xf4bd32, 0x68d97c][i]));
    }
    group.add(lights);
    group.updateMatrixWorld(true);
    this.cameraFadeModels.push({
      boxes: [new THREE.Box3().setFromObject(banner)],
      materials: [banner.material as THREE.Material, ivory, coral, lights.material as THREE.Material],
      opacity: 1,
      fadeDistance: 11,
      fadeOpacity: 0,
    });
    const grid = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.025, 0.8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 11);
    const gridMatrix = new THREE.Matrix4();
    for (let i = -5; i <= 5; i += 1) {
      gridMatrix.makeTranslation(i, 0.03, 0);
      grid.setMatrixAt(i + 5, gridMatrix);
      grid.setColorAt(i + 5, new THREE.Color(i % 2 === 0 ? 0xffffff : 0x172b36));
    }
    group.add(grid);
  }

  private addSectionGates(): void {
    const gates: [number, string, string][] = [[0.18, '彩色港口', '#f4bd32'], [0.38, '山崖盘山道', '#68b94e'], [0.76, '跨海大桥', '#f2554d']];
    for (const [progress, label, color] of gates) {
      const group = this.groupAt(progress, 0);
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const structure = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 3);
      const gateMatrix = new THREE.Matrix4();
      const gateTransforms = [
        { position: new THREE.Vector3(-5.8, 2.3, 0), scale: new THREE.Vector3(0.18, 4.6, 0.18) },
        { position: new THREE.Vector3(5.8, 2.3, 0), scale: new THREE.Vector3(0.18, 4.6, 0.18) },
        { position: new THREE.Vector3(0, 4.55, 0), scale: new THREE.Vector3(11.8, 0.2, 0.25) },
      ];
      gateTransforms.forEach((transform, index) => {
        gateMatrix.compose(transform.position, new THREE.Quaternion(), transform.scale);
        structure.setMatrixAt(index, gateMatrix);
      });
      group.add(structure);
      const sign = mesh(new THREE.PlaneGeometry(3.8, 0.95), new THREE.MeshBasicMaterial({ map: textTexture(label, color, '#102b38'), side: THREE.DoubleSide }), new THREE.Vector3(0, 4.05, 0.03));
      sign.rotation.y = Math.PI;
      group.add(sign);
    }
    for (const challenge of SECTION_CHALLENGES) {
      const group = this.groupAt(challenge.at - 0.012, -5.25);
      const material = new THREE.MeshStandardMaterial({ color: 0xf4bd32, emissive: 0xf4bd32, emissiveIntensity: 0.45 });
      group.add(mesh(new THREE.OctahedronGeometry(0.42), material, new THREE.Vector3(0, 2.2, 0)));
      group.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.1, 7), material, new THREE.Vector3(0, 1.05, 0)));
    }
  }

  private addObstacles(): void {
    const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.85, 10), new THREE.MeshStandardMaterial({ color: 0xff7a3d, roughness: 0.65 }), TRACK_OBSTACLES.length * 3);
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.16, 0.18), new THREE.MeshStandardMaterial({ color: 0xfff0cf, roughness: 0.65 }), TRACK_OBSTACLES.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    TRACK_OBSTACLES.forEach((obstacle, index) => {
      const frame = this.track.getFrame(obstacle.at * this.track.length, obstacle.lane);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(frame.tangent.x, frame.tangent.z));
      for (let i = 0; i < 3; i += 1) {
        const position = frame.position.clone().addScaledVector(frame.normal, (i - 1) * 0.55);
        position.y += 0.43;
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        cones.setMatrixAt(index * 3 + i, matrix);
      }
      const barPosition = frame.position.clone();
      barPosition.y += 0.72;
      matrix.compose(barPosition, quaternion, new THREE.Vector3(1, 1, 1));
      bars.setMatrixAt(index, matrix);
    });
    this.scene.add(cones, bars);
  }

  private addEnvironment(random: () => number): void {
    this.addSeaside(random);
    this.addHarbor();
    this.addCliffs(random);
    this.addCave();
    this.addBridge();
    this.addDistantWorld(random);
  }

  private addSeaside(random: () => number): void {
    const palmCount = this.mobile ? 2 : 8;
    const palmGroup = new THREE.Group();
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.25, 3.2, 7), new THREE.MeshStandardMaterial({ color: 0x916743, roughness: 1 }), palmCount);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.55, 1), new THREE.MeshStandardMaterial({ color: 0x2f9c68, roughness: 0.95, flatShading: true }), palmCount);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < palmCount; index += 1) {
      const progress = 0.012 + (index / palmCount) * 0.35 + random() * 0.004;
      const side = index % 2 ? 1 : -1;
      const lane = side * (9.2 + random() * 7.5);
      const frame = this.track.getFrame(progress * this.track.length, lane);
      const position = frame.position.clone();
      position.y = this.terrainElevation(progress, lane, frame.position.y);
      const scale = 0.78 + random() * 0.45;
      const yaw = random() * Math.PI * 2;
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      matrix.compose(position, quaternion, new THREE.Vector3(scale, scale, scale));
      this.environmentTransforms.palm.push(matrix.clone());
      matrix.compose(new THREE.Vector3(position.x, position.y + 1.6 * scale, position.z), quaternion, new THREE.Vector3(scale, scale, scale));
      trunks.setMatrixAt(index, matrix);
      matrix.compose(new THREE.Vector3(position.x, position.y + 3.45 * scale, position.z), quaternion, new THREE.Vector3(scale * 1.25, scale * 0.42, scale * 1.25));
      crowns.setMatrixAt(index, matrix);
    }
    palmGroup.add(trunks, crowns);
    this.scene.add(palmGroup);
    this.environmentFallbacks.palm.push(palmGroup);

    const grandstand = createGrandstand(this.materials);
    const standFrame = this.track.getFrame(0.025 * this.track.length, -10.8);
    grandstand.position.copy(standFrame.position);
    grandstand.position.y = this.groundHeightAt(standFrame.position.x, standFrame.position.z, standFrame.position.y - 0.2);
    grandstand.rotation.y = Math.atan2(standFrame.tangent.x, standFrame.tangent.z) + Math.PI;
    this.scene.add(grandstand);

    const pitRow = createPitRow(this.materials);
    const pitFrame = this.track.getFrame(0.116 * this.track.length, -12.2);
    pitRow.position.copy(pitFrame.position);
    pitRow.position.y = this.groundHeightAt(pitFrame.position.x, pitFrame.position.z, pitFrame.position.y - 0.2);
    pitRow.rotation.y = Math.atan2(pitFrame.tangent.x, pitFrame.tangent.z) + Math.PI;
    this.scene.add(pitRow);
  }

  private addHarborFoundations(): void {
    const foundation = this.groupAt(0.255, 17);
    const concrete = new THREE.MeshStandardMaterial({ color: 0xbcb7a5, roughness: 0.94 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x567276, roughness: 0.7, metalness: 0.18 });
    const foundationSlab = mesh(new THREE.BoxGeometry(19, 0.7, 16), concrete, new THREE.Vector3(0, -0.4, 0));
    foundation.add(foundationSlab);
    this.groundMeshes.push(foundationSlab);
    foundation.add(mesh(new THREE.BoxGeometry(19.4, 0.22, 16.4), edge, new THREE.Vector3(0, -0.78, 0)));
    const localBottom = -foundation.position.y - 2.85;
    const localTop = -0.78;
    const pileHeight = Math.max(1, localTop - localBottom);
    const piles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.36, 1, 10), edge, 12);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (const x of [-8, 0, 8]) {
      for (const z of [-6.8, -2.3, 2.3, 6.8]) {
        matrix.compose(new THREE.Vector3(x, localBottom + pileHeight / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, pileHeight, 1));
        piles.setMatrixAt(index, matrix);
        index += 1;
      }
    }
    foundation.add(piles);
    const dockSegments = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.42, 4.4), concrete, 12);
    const bollards = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.18, 0.55, 10), edge, 12);
    for (let i = 0; i < 12; i += 1) {
      const progress = 0.195 + i * 0.014;
      const frame = this.track.getFrame(progress * this.track.length, 11.2);
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(frame.tangent.x, frame.tangent.z));
      const dockPosition = frame.position.clone();
      dockPosition.y -= 0.48;
      matrix.compose(dockPosition, quaternion, new THREE.Vector3(1, 1, 1));
      dockSegments.setMatrixAt(i, matrix);
      const bollardPosition = frame.position.clone().addScaledVector(frame.normal, 1.15);
      bollardPosition.y += 0.05;
      matrix.compose(bollardPosition, quaternion, new THREE.Vector3(1, 1, 1));
      bollards.setMatrixAt(i, matrix);
    }
    this.scene.add(dockSegments, bollards);
    this.groundMeshes.push(dockSegments);
    this.scene.updateMatrixWorld(true);
  }

  private addHarbor(): void {
    this.addHarborFoundations();
    const clusterCount = this.mobile ? 6 : 10;
    const baseContainerCount = clusterCount * 2;
    const containerCount = baseContainerCount + Math.ceil(clusterCount / 3);
    const containers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 1.25, 1.15), new THREE.MeshStandardMaterial({ map: containerTexture(), roughness: 0.72, metalness: 0.12 }), containerCount);
    containers.name = 'grounded-harbor-containers';
    const footings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xaeb8ae, roughness: 0.94 }), baseContainerCount);
    footings.name = 'container-level-foundations';
    const matrix = new THREE.Matrix4();
    let containerIndex = 0;
    let footingIndex = 0;
    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
      const side = cluster % 2 ? 1 : -1;
      const lane = side * (9.4 + (cluster % 3) * 0.85);
      const clusterProgress = 0.075 + (cluster / Math.max(1, clusterCount - 1)) * 0.185;
      for (let slot = 0; slot < 2; slot += 1) {
        const progress = clusterProgress + slot * 0.0042;
        const frame = this.track.getFrame(progress * this.track.length, lane);
        const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(frame.tangent.x, frame.tangent.z));
        const samples = [[0, 0], [1.22, 0.55], [1.22, -0.55], [-1.22, 0.55], [-1.22, -0.55]].map(([along, across]) => {
          const point = frame.position.clone().addScaledVector(frame.tangent, along).addScaledVector(frame.normal, across);
          return this.groundHeightAt(point.x, point.z, frame.position.y);
        });
        const supportTop = Math.max(...samples) + 0.04;
        const supportBottom = Math.min(supportTop - 0.18, Math.min(...samples) - 0.08);
        const footingPosition = frame.position.clone();
        footingPosition.y = (supportTop + supportBottom) / 2;
        matrix.compose(footingPosition, quaternion, new THREE.Vector3(2.68, supportTop - supportBottom, 1.32));
        footings.setMatrixAt(footingIndex, matrix);
        footingIndex += 1;
        const position = frame.position.clone();
        position.y = supportTop + 0.625;
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        containers.setMatrixAt(containerIndex, matrix);
        containers.setColorAt(containerIndex, new THREE.Color([0xf2554d, 0xf4bd32, 0x16b8b0, 0x517ac7, 0xfff0cf][containerIndex % 5]));
        containerIndex += 1;
        if (slot === 0 && cluster % 3 === 0) {
          position.y = supportTop + 1.25 + 0.625;
          matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
          containers.setMatrixAt(containerIndex, matrix);
          containers.setColorAt(containerIndex, new THREE.Color([0x16b8b0, 0x517ac7, 0xf4bd32, 0xf2554d][cluster % 4]));
          containerIndex += 1;
        }
      }
    }
    containers.computeBoundingSphere();
    footings.computeBoundingSphere();
    this.scene.add(footings, containers);
    const craneConfigs = (this.mobile ? [[0.22, 14]] : [[0.22, 14], [0.32, -14]]) as [number, number][];
    for (const [progress, lane] of craneConfigs) {
      const crane = this.groupAt(progress, lane);
      const yellow = new THREE.MeshStandardMaterial({ color: 0xf4bd32, roughness: 0.55, metalness: 0.25 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x274853, roughness: 0.65 });
      crane.position.y = this.groundHeightAt(crane.position.x, crane.position.z, crane.position.y) - 0.02;
      crane.add(mesh(new THREE.BoxGeometry(1.35, 0.24, 1.35), dark, new THREE.Vector3(0, -0.12, 0)));
      crane.add(mesh(new THREE.BoxGeometry(0.65, 8, 0.65), yellow, new THREE.Vector3(0, 4, 0)));
      crane.add(mesh(new THREE.BoxGeometry(8, 0.5, 0.55), yellow, new THREE.Vector3(2.8, 7.8, 0)));
      crane.add(mesh(new THREE.BoxGeometry(0.08, 4, 0.08), dark, new THREE.Vector3(5.8, 5.6, 0)));
      crane.add(mesh(new THREE.BoxGeometry(1.2, 0.6, 1), dark, new THREE.Vector3(5.8, 3.5, 0)));
    }
    const boatConfigs = [[0.21, -23]] as [number, number][];
    for (const [progress, lane] of boatConfigs) {
      const boat = this.groupAt(progress, lane);
      boat.position.y = -2.55;
      this.environmentTransforms.boat.push(new THREE.Matrix4().compose(boat.position, boat.quaternion, new THREE.Vector3(1, 1, 1)));
      const hull = mesh(new THREE.CapsuleGeometry(0.8, 3.4, 4, 10), new THREE.MeshStandardMaterial({ color: 0xfff0cf, roughness: 0.65 }), new THREE.Vector3(0, 0.3, 0));
      hull.rotation.x = Math.PI / 2;
      boat.add(hull);
      boat.add(mesh(new THREE.CylinderGeometry(0.045, 0.06, 4.5, 7), new THREE.MeshStandardMaterial({ color: 0x805c42 }), new THREE.Vector3(0, 2.5, 0)));
      const sail = mesh(new THREE.PlaneGeometry(2.6, 2.8), new THREE.MeshStandardMaterial({ color: 0xf2554d, side: THREE.DoubleSide }), new THREE.Vector3(0.7, 2.8, 0));
      boat.add(sail);
      this.environmentFallbacks.boat.push(boat);
    }
  }

  private addCliffs(random: () => number): void {
    const count = this.mobile ? 24 : 28;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) {
      const progress = 0.375 + (i / count) * 0.19;
      const side = i % 2 ? 1 : -1;
      // 坡崖模型带随机朝向，按最大旋转半径留足道路与赛车余量，避免视觉模型侵入路肩。
      const frame = this.track.getFrame(progress * this.track.length, side * (25 + random() * 4));
      const scale = new THREE.Vector3(0.65 + random() * 0.45, 0.65 + random() * 0.65, 0.65 + random() * 0.45);
      const position = frame.position.clone();
      position.y = this.groundHeightAt(position.x, position.z, position.y) - 0.12;
      matrix.compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2), scale);
      this.environmentTransforms.hill.push(matrix.clone());
    }
    const anchorCount = 1;
    for (let i = 0; i < anchorCount; i += 1) {
      const progress = 0.46;
      const lane = -(this.mobile ? 20 : 23) - (i % 3) * 1.4;
      const frame = this.track.getFrame(progress * this.track.length, lane);
      const position = frame.position.clone();
      position.y = this.groundHeightAt(position.x, position.z, this.terrainElevation(progress, lane, frame.position.y)) - 0.35;
      const yaw = Math.atan2(frame.tangent.x, frame.tangent.z) + (i % 2 ? 0.16 : -0.12);
      const scale = 0.85 + (i % 4) * 0.1;
      matrix.compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(scale, scale, scale));
      this.environmentTransforms.cliff.push(matrix.clone());
    }
    const coastalCount = this.mobile ? 10 : 14;
    for (let index = 0; index < coastalCount; index += 1) {
      const progress = 0.382 + random() * 0.19;
      const lane = 15 + random() * 9;
      const frame = this.track.getFrame(progress * this.track.length, lane);
      const position = frame.position.clone();
      const size = 0.22 + random() * 0.2;
      const scale = new THREE.Vector3(size * (0.9 + random() * 0.3), size * (0.65 + random() * 0.35), size * (0.9 + random() * 0.3));
      position.y = this.groundHeightAt(position.x, position.z, position.y) - 0.08;
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2);
      matrix.compose(position, quaternion, scale);
      this.environmentTransforms.hill.push(matrix.clone());
    }
    const waterfall = this.groupAt(0.485, 26);
    waterfall.name = 'cliff-waterfall';
    waterfall.position.y -= 4;
    this.waterfallTexture = createWaterfallTexture();
    const water = mesh(new THREE.PlaneGeometry(4, 12, 4, 18), new THREE.MeshBasicMaterial({ map: this.waterfallTexture, transparent: true, opacity: 0.84, side: THREE.DoubleSide, depthWrite: false }), new THREE.Vector3(0, 0, 0));
    waterfall.add(water);
    const mistTexture = createMistTexture();
    for (let index = 0; index < 3; index += 1) {
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture, transparent: true, opacity: 0.62 - index * 0.12, depthWrite: false }));
      mist.position.set((index - 1) * 1.35, -5.7 + index * 0.28, 0.25 + index * 0.3);
      mist.scale.set(5.2 - index * 0.7, 2.1 + index * 0.4, 1);
      waterfall.add(mist);
    }
  }

  private addCaveTunnel(): void {
    const segments = 110;
    const crossSegments = 18;
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const color = new THREE.Color();
    for (let i = 0; i <= segments; i += 1) {
      const local = i / segments;
      const progress = 0.58 + local * 0.18;
      const frame = this.track.getFrame(progress * this.track.length);
      for (let j = 0; j <= crossSegments; j += 1) {
        const angle = (j / crossSegments) * Math.PI;
        const lateral = Math.cos(angle) * 11.5;
        const height = Math.sin(angle) * 9.5 + 0.05;
        const strata = Math.sin(progress * 280 + angle * 4) * 0.18;
        const position = frame.position.clone().addScaledVector(frame.normal, lateral);
        position.y += height + strata;
        positions.push(position.x, position.y, position.z);
        uvs.push(j / crossSegments, local * 3);
        color.set(j % 4 === 0 ? 0x9aa5a0 : 0x7f9395).multiplyScalar(0.92 + Math.sin(progress * 99 + angle * 3) * 0.06);
        colors.push(color.r, color.g, color.b);
        if (i < segments && j < crossSegments) {
          const a = i * (crossSegments + 1) + j;
          const b = a + crossSegments + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.scene.add(mesh(geometry, this.materials.cave));
    const timber = new THREE.MeshStandardMaterial({ color: 0x74533d, roughness: 0.88 });
    const supports = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), timber, 36);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let i = 0; i < 12; i += 1) {
      const progress = 0.585 + i * 0.0145;
      const frame = this.track.getFrame(progress * this.track.length);
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(frame.tangent.x, frame.tangent.z));
      for (const side of [-1, 1]) {
        const position = frame.position.clone().addScaledVector(frame.normal, side * 9.6);
        position.y += 4.25;
        matrix.compose(position, quaternion, new THREE.Vector3(0.28, 8.5, 0.34));
        supports.setMatrixAt(index, matrix);
        index += 1;
      }
      const top = frame.position.clone();
      top.y += 8.65;
      matrix.compose(top, quaternion, new THREE.Vector3(19.6, 0.28, 0.34));
      supports.setMatrixAt(index, matrix);
      index += 1;
    }
    this.scene.add(supports);
  }

  private addCave(): void {
    this.addCaveTunnel();

    const matrix = new THREE.Matrix4();
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.07, 0.18), new THREE.MeshStandardMaterial({ color: 0x805c42, roughness: 1 }), 34);
    for (let i = 0; i < sleepers.count; i += 1) {
      const frame = this.track.getFrame((0.585 + i / sleepers.count * 0.17) * this.track.length, 4.9);
      const position = frame.position.clone();
      position.y += 0.08;
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(frame.tangent.x, frame.tangent.z));
      matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
      sleepers.setMatrixAt(i, matrix);
    }
    this.scene.add(sleepers);
    for (const lane of [4.55, 5.25]) {
      const points = Array.from({ length: 32 }, (_, i) => {
        const frame = this.track.getFrame((0.585 + i / 31 * 0.17) * this.track.length, lane);
        frame.position.y += 0.16;
        return frame.position;
      });
      this.scene.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.035, 6, false), new THREE.MeshStandardMaterial({ color: 0xb8c4bd, metalness: 0.8, roughness: 0.35 })));
    }
  }

  private addBridge(): void {
    const cableAnchors: [number, number][] = [[0.76, 3.2], [0.835, 21.5], [0.9, 4], [0.965, 21.5], [1, 3.2]];
    const cableOffset = (progress: number): number => {
      for (let index = 0; index < cableAnchors.length - 1; index += 1) {
        const [start, startHeight] = cableAnchors[index];
        const [end, endHeight] = cableAnchors[index + 1];
        if (progress < start || progress > end) continue;
        const local = (progress - start) / (end - start);
        return THREE.MathUtils.lerp(startHeight, endHeight, local) - Math.sin(local * Math.PI) * 0.65;
      }
      return 3.2;
    };
    const cableMaterial = new THREE.MeshStandardMaterial({ color: 0xf4e4bd, metalness: 0.45, roughness: 0.42 });
    for (const side of [-1, 1]) {
      const points = Array.from({ length: 97 }, (_, i) => {
        const progress = 0.76 + (i / 96) * 0.24;
        const frame = this.track.getFrame(progress * this.track.length, side * 6.65);
        frame.position.y += cableOffset(progress);
        return frame.position;
      });
      this.scene.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.08), 128, 0.07, 7, false), cableMaterial));
    }
    const suspenders = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.032, 0.032, 1, 6), new THREE.MeshStandardMaterial({ color: 0xe8f0e7, metalness: 0.55, roughness: 0.4 }), 48);
    const piers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.55, 1, 8), new THREE.MeshStandardMaterial({ color: 0xd7d9c9, roughness: 0.8 }), 16);
    const towerSupports = new THREE.InstancedMesh(new THREE.BoxGeometry(3.3, 1, 4.1), new THREE.MeshStandardMaterial({ color: 0xc4c9bd, roughness: 0.86 }), 8);
    towerSupports.name = 'bridge-tower-caissons-and-footings';
    const chevrons = new THREE.InstancedMesh(new THREE.BoxGeometry(4.8, 0.035, 0.32), new THREE.MeshStandardMaterial({ color: 0xf4bd32, emissive: 0xf4bd32, emissiveIntensity: 0.35 }), 6);
    const matrix = new THREE.Matrix4();
    const seabed = -5.55;
    let suspenderIndex = 0;
    for (let i = 0; i < 24; i += 1) {
      const local = i / 23;
      const progress = 0.77 + local * 0.22;
      for (const side of [-1, 1]) {
        const frame = this.track.getFrame(progress * this.track.length, side * 6.65);
        const bottom = frame.position.y + 0.12;
        const top = frame.position.y + cableOffset(progress);
        const height = Math.max(0.1, top - bottom);
        const position = frame.position.clone();
        position.y = bottom + height / 2;
        matrix.compose(position, new THREE.Quaternion(), new THREE.Vector3(1, height, 1));
        suspenders.setMatrixAt(suspenderIndex, matrix);
        suspenderIndex += 1;
      }
    }
    for (let i = 0; i < piers.count; i += 1) {
      const frame = this.track.getFrame((0.775 + (i / piers.count) * 0.21) * this.track.length, i % 2 ? 4.3 : -4.3);
      const top = frame.position.y - 0.1;
      const height = Math.max(0.5, top - seabed);
      const position = frame.position.clone();
      position.y = seabed + height / 2;
      matrix.compose(position, new THREE.Quaternion(), new THREE.Vector3(1, height, 1));
      piers.setMatrixAt(i, matrix);
    }
    let supportIndex = 0;
    for (const progress of [0.835, 0.965]) {
      for (const lane of [-6.55, 6.55]) {
        const frame = this.track.getFrame(progress * this.track.length, lane);
        const top = frame.position.y - 0.03;
        const height = Math.max(0.5, top - seabed);
        const position = frame.position.clone();
        position.y = seabed + height / 2;
        matrix.compose(position, new THREE.Quaternion(), new THREE.Vector3(1, height, 1));
        towerSupports.setMatrixAt(supportIndex, matrix);
        const footing = frame.position.clone();
        footing.y = seabed + 0.18;
        matrix.compose(footing, new THREE.Quaternion(), new THREE.Vector3(1.28, 0.36, 1.24));
        towerSupports.setMatrixAt(supportIndex + 4, matrix);
        supportIndex += 1;
      }
    }
    for (let i = 0; i < chevrons.count; i += 1) {
      const frame = this.track.getFrame((0.858 + i * 0.005) * this.track.length);
      const position = frame.position.clone();
      position.y += 0.04;
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(frame.tangent.x, frame.tangent.z));
      matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
      chevrons.setMatrixAt(i, matrix);
    }
    suspenders.computeBoundingSphere();
    piers.computeBoundingSphere();
    towerSupports.computeBoundingSphere();
    this.scene.add(suspenders, piers, towerSupports, chevrons);
  }

  private addDistantWorld(random: () => number): void {
    const hillCount = this.mobile ? 10 : 12;
    const hillMatrix = new THREE.Matrix4();
    const shallowMatrix = new THREE.Matrix4();
    const shallowGeometry = new THREE.CircleGeometry(1, 40);
    shallowGeometry.rotateX(-Math.PI / 2);
    const shallows = new THREE.InstancedMesh(shallowGeometry, new THREE.MeshBasicMaterial({ color: 0xa5e4cf, transparent: true, opacity: 0.34, depthWrite: false }), hillCount);
    shallows.name = 'toy-island-shallows';
    for (let i = 0; i < hillCount; i += 1) {
      const angle = (i / hillCount) * Math.PI * 2;
      const radius = 140 + random() * 35;
      const position = new THREE.Vector3(Math.cos(angle) * radius, -4.9, Math.sin(angle) * radius);
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2);
      const scale = 1.4 + random() * 0.8;
      hillMatrix.compose(position, rotation, new THREE.Vector3(scale * (0.92 + random() * 0.16), scale * (0.82 + random() * 0.3), scale));
      this.environmentTransforms.hill.push(hillMatrix.clone());
      shallowMatrix.compose(new THREE.Vector3(position.x, -2.76, position.z), new THREE.Quaternion(), new THREE.Vector3(9.5 * scale, 1, 9.5 * scale));
      shallows.setMatrixAt(i, shallowMatrix);
    }
    shallows.computeBoundingSphere();
    this.scene.add(shallows);
    if (!this.mobile) {
      for (let i = 0; i < 5; i += 1) {
        const balloon = new THREE.Group();
        const envelope = mesh(new THREE.SphereGeometry(1.6, 16, 12), new THREE.MeshStandardMaterial({ color: [0xf2554d, 0xf4bd32, 0x16b8b0, 0x7c6de0, 0x68b94e][i], roughness: 0.7 }));
        envelope.scale.y = 1.25;
        balloon.add(envelope, mesh(new THREE.BoxGeometry(0.65, 0.5, 0.65), new THREE.MeshStandardMaterial({ color: 0x9a6941, roughness: 1 }), new THREE.Vector3(0, -2.6, 0)));
        const angle = i * 1.27;
        balloon.position.set(Math.cos(angle) * 105, 24 + i * 3, Math.sin(angle) * 100);
        balloon.userData.baseY = balloon.position.y;
        balloon.userData.phase = i;
        this.animated.push(balloon);
        this.scene.add(balloon);
      }
    }
  }

  private addLandmarkSlots(): void {
    const lighthouseBase = this.groupAt(0.095, 18);
    lighthouseBase.add(mesh(new THREE.CylinderGeometry(5.2, 5.8, 2.8, 48), new THREE.MeshStandardMaterial({ color: 0x89968c, roughness: 0.94, map: terrainTexture() }), new THREE.Vector3(0, -1.45, 0)));
    lighthouseBase.add(mesh(new THREE.CylinderGeometry(5.45, 5.45, 0.22, 48), new THREE.MeshStandardMaterial({ color: 0x536d70, roughness: 0.7 }), new THREE.Vector3(0, -0.12, 0)));
    const lighthouseTrim = mesh(new THREE.TorusGeometry(5.45, 0.1, 8, 64), new THREE.MeshStandardMaterial({ color: 0xf2554d, roughness: 0.48 }), new THREE.Vector3(0, 0.02, 0));
    lighthouseTrim.rotation.x = Math.PI / 2;
    lighthouseBase.add(lighthouseTrim);
    this.createLandmarkSlot('lighthouse', 0.095, 18, 13);
    this.createLandmarkSlot('harbor', 0.255, 17, 11);
    const quay = this.groupAt(0.255, 17);
    const quaySlab = mesh(new THREE.BoxGeometry(20, 0.7, 15), new THREE.MeshStandardMaterial({ color: 0x8d9b94, roughness: 0.9 }), new THREE.Vector3(0, -0.7, 0));
    quay.add(quaySlab);
    this.groundMeshes.push(quaySlab);
    this.scene.updateMatrixWorld(true);
    this.createLandmarkSlot('cave', 0.6, 0, 10);
    this.createLandmarkSlot('bridge', 0.835, 0, 14);
    this.createLandmarkSlot('bridge-end', 0.965, 0, 14);
  }

  private createLandmarkSlot(id: string, progress: number, lane: number, height: number): void {
    const group = this.groupAt(progress, lane);
    if (id === 'harbor') group.position.y -= 0.35;
    if (id === 'cave') group.position.y -= 0.85;
    group.name = `landmark-${id}`;
    const kind = id.startsWith('bridge') ? 'bridge' : id;
    group.add(this.createFallbackLandmark(kind, height));
    this.landmarkSlots.set(id, group);
    this.scene.add(group);
  }

  private createFallbackLandmark(id: string, height: number): THREE.Group {
    const group = new THREE.Group();
    const cream = new THREE.MeshStandardMaterial({ color: 0xfff0cf, roughness: 0.65 });
    const coral = new THREE.MeshStandardMaterial({ color: 0xf2554d, roughness: 0.55 });
    const teal = new THREE.MeshStandardMaterial({ color: 0x2e6670, roughness: 0.85 });
    if (id === 'lighthouse') {
      group.add(mesh(new THREE.CylinderGeometry(1.2, 1.8, height * 0.72, 16), cream, new THREE.Vector3(0, height * 0.36, 0)));
      group.add(mesh(new THREE.CylinderGeometry(1.45, 1.45, 1.1, 12), coral, new THREE.Vector3(0, height * 0.68, 0)));
      group.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x8eeeff, emissive: 0xffe5a0, emissiveIntensity: 0.8 }), new THREE.Vector3(0, height * 0.8, 0)));
      group.add(mesh(new THREE.ConeGeometry(1.5, 1.4, 12), teal, new THREE.Vector3(0, height * 0.94, 0)));
    } else if (id === 'harbor') {
      group.add(mesh(new THREE.BoxGeometry(8, height * 0.45, 5), cream, new THREE.Vector3(0, height * 0.225, 0)));
      group.add(mesh(new THREE.BoxGeometry(4.2, height * 0.4, 3.8), coral, new THREE.Vector3(0, height * 0.62, 0)));
      group.add(mesh(new THREE.ConeGeometry(3.4, 2, 4), teal, new THREE.Vector3(0, height * 0.9, 0)));
    } else {
      for (const x of [-6.4, 6.4]) group.add(mesh(new THREE.BoxGeometry(1.1, height * 0.78, 1.6), id === 'cave' ? teal : cream, new THREE.Vector3(x, height * 0.39, 0)));
      group.add(mesh(new THREE.BoxGeometry(14, 1.2, 1.6), id === 'cave' ? teal : coral, new THREE.Vector3(0, height * 0.78, 0)));
      if (id === 'cave') {
        for (const x of [-5.5, 5.5]) group.add(mesh(new THREE.OctahedronGeometry(1.1), this.crystalMaterial, new THREE.Vector3(x, 1.4, 0)));
      }
    }
    return group;
  }

  private addCameraObstacle(box: THREE.Box3, matrix = new THREE.Matrix4()): void {
    this.cameraObstacles.push({ box: box.clone().expandByScalar(0.45), matrix: matrix.clone(), inverse: matrix.clone().invert() });
  }

  private addPortalCameraObstacles(box: THREE.Box3, matrix: THREE.Matrix4): THREE.Box3[] {
    const size = box.getSize(new THREE.Vector3());
    const left = box.clone();
    left.max.x = box.min.x + size.x * 0.3;
    const right = box.clone();
    right.min.x = box.max.x - size.x * 0.3;
    const top = box.clone();
    top.min.y = box.min.y + size.y * 0.58;
    this.addCameraObstacle(left, matrix);
    this.addCameraObstacle(right, matrix);
    this.addCameraObstacle(top, matrix);
    return [left, right, top];
  }

  private installCameraModel(slot: THREE.Group, portal: boolean): void {
    slot.updateMatrixWorld(true);
    const slotInverse = slot.matrixWorld.clone().invert();
    const fadeBoxes: THREE.Box3[] = [];
    slot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.computeBoundingBox();
      if (!object.geometry.boundingBox) return;
      const relative = new THREE.Matrix4().multiplyMatrices(slotInverse, object.matrixWorld);
      const box = object.geometry.boundingBox.clone().applyMatrix4(relative);
      if (portal) {
        const portalBoxes = this.addPortalCameraObstacles(box, slot.matrixWorld);
        for (const portalBox of portalBoxes) fadeBoxes.push(portalBox.applyMatrix4(slot.matrixWorld));
      } else this.addCameraObstacle(box, slot.matrixWorld);
    });
    if (!portal || !fadeBoxes.length || this.mobile) return;
    const materials = new Set<THREE.Material>();
    slot.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const cloneMaterial = (material: THREE.Material): THREE.Material => {
        const clone = material.clone();
        clone.forceSinglePass = true;
        materials.add(clone);
        return clone;
      };
      object.material = Array.isArray(object.material) ? object.material.map(cloneMaterial) : cloneMaterial(object.material);
    });
    this.cameraFadeModels.push({ boxes: fadeBoxes, materials: [...materials], opacity: 1 });
  }

  updateCameraFade(cameraPosition: THREE.Vector3, delta: number): void {
    for (const model of this.cameraFadeModels) {
      const close = model.boxes.some((box) => box.distanceToPoint(cameraPosition) < (model.fadeDistance ?? 2.8));
      model.opacity = THREE.MathUtils.damp(model.opacity, close ? (model.fadeOpacity ?? 0.14) : 1, 12, delta);
      const transparent = model.opacity < 0.985;
      for (const material of model.materials) {
        material.opacity = model.opacity;
        material.depthWrite = !transparent;
        if (material.transparent !== transparent) {
          material.transparent = transparent;
          material.needsUpdate = true;
        }
      }
    }
  }

  constrainCamera(target: THREE.Vector3, desired: THREE.Vector3): THREE.Vector3 {
    const direction = desired.clone().sub(target);
    const distance = direction.length();
    if (distance < 0.001) return desired;
    direction.divideScalar(distance);
    const ray = new THREE.Ray(target, direction);
    let nearest = distance;
    for (const obstacle of this.cameraObstacles) {
      const localRay = ray.clone().applyMatrix4(obstacle.inverse);
      const hit = localRay.intersectBox(obstacle.box, new THREE.Vector3());
      if (!hit) continue;
      const worldDistance = hit.applyMatrix4(obstacle.matrix).distanceTo(target);
      if (worldDistance > 0.25 && worldDistance < nearest) nearest = worldDistance;
    }
    const sample = new THREE.Vector3();
    for (let index = 2; index <= 14; index += 1) {
      const along = (distance * index) / 14;
      if (along >= nearest) break;
      sample.copy(target).addScaledVector(direction, along);
      const terrainHeight = this.cameraTerrainHeight(sample.x, sample.z, -100);
      if (sample.y < terrainHeight + 1.2) {
        nearest = Math.max(0.35, along - 0.9);
        break;
      }
    }
    if (nearest < distance) {
      desired.copy(target).addScaledVector(direction, Math.max(0.35, nearest - 0.65));
      desired.y = Math.max(desired.y, target.y + 1.1);
    }
    const terrainFloor = this.cameraTerrainHeight(desired.x, desired.z, target.y - 1.1);
    desired.y = Math.max(desired.y, terrainFloor + 1.4);
    return desired;
  }

  installEnvironment(models: LoadedEnvironmentModel[]): void {
    for (const model of models) {
      const transforms = this.environmentTransforms[model.id];
      if (!transforms.length) continue;
      for (const fallback of this.environmentFallbacks[model.id]) fallback.visible = false;
      model.root.updateMatrixWorld(true);
      const sources: THREE.Mesh[] = [];
      model.root.traverse((object) => { if (object instanceof THREE.Mesh) sources.push(object); });
      for (const source of sources) {
        source.geometry.computeBoundingBox();
        const roadFrames = Array.from({ length: 385 }, (_, index) => this.track.getFrame((index / 384) * this.track.length).position);
        const candidates = transforms.map((transform, index) => ({ transform, index })).filter(({ transform, index }) => {
          if ((model.id !== 'cliff' && model.id !== 'hill') || !source.geometry.boundingBox) return true;
          const matrix = transform.clone().multiply(source.matrixWorld);
          const box = source.geometry.boundingBox.clone().applyMatrix4(matrix);
          const intrudes = roadFrames.some((position) => {
            if (box.min.y > position.y + 4.5 || box.max.y < position.y - 0.75) return false;
            const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
            const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
            return (closestX - position.x) ** 2 + (closestZ - position.z) ** 2 < 9 ** 2;
          });
          if (intrudes) this.removedRoadBlockers.push({ asset: model.id, index });
          return !intrudes;
        });
        if (!candidates.length) continue;
        const instances = new THREE.InstancedMesh(source.geometry, source.material, candidates.length);
        instances.name = `hyper3d-instanced-${model.id}`;
        candidates.forEach(({ transform }, index) => {
          const matrix = transform.clone().multiply(source.matrixWorld);
          instances.setMatrixAt(index, matrix);
          if ((model.id === 'cliff' || model.id === 'hill') && source.geometry.boundingBox) {
            this.addCameraObstacle(source.geometry.boundingBox.clone().applyMatrix4(matrix));
          }
        });
        instances.instanceMatrix.needsUpdate = true;
        instances.receiveShadow = true;
        instances.castShadow = false;
        instances.computeBoundingSphere();
        this.scene.add(instances);
      }
    }
  }

  installLandmarks(models: LoadedLandmarkModel[]): LandmarkId[] {
    const installed: LandmarkId[] = [];
    for (const model of models) {
      const slot = this.landmarkSlots.get(model.id);
      if (!slot) continue;
      slot.clear();
      slot.add(model.root);
      this.installCameraModel(slot, model.id === 'cave' || model.id === 'bridge');
      if (model.id === 'bridge') {
        const end = this.landmarkSlots.get('bridge-end');
        if (end) {
          end.clear();
          end.add(model.root.clone(true));
          this.installCameraModel(end, true);
        }
      }
      installed.push(model.id);
    }
    return installed;
  }

  private groupAt(progress: number, lane: number): THREE.Group {
    const frame = this.track.getFrame(progress * this.track.length, lane);
    const group = new THREE.Group();
    group.position.copy(frame.position);
    group.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
    this.scene.add(group);
    return group;
  }

  update(elapsed: number): void {
    for (const object of this.animated) {
      object.position.y = object.userData.baseY + Math.sin(elapsed * 0.55 + object.userData.phase) * 0.8;
      object.rotation.y = elapsed * 0.04 + object.userData.phase;
    }
    this.crystalMaterial.emissiveIntensity = 1.2 + Math.sin(elapsed * 2.2) * 0.25;
    this.nature?.update(elapsed);
    if (this.waterfallTexture) this.waterfallTexture.offset.y = -elapsed * 0.52;
  }
}
