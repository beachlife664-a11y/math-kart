import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldMaterials } from './materials';
import { Track } from './track';

export interface NatureSystems {
  root: THREE.Group;
  ocean: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  grassMaterial: THREE.MeshStandardMaterial;
  update: (elapsed: number) => void;
}

function smoothstep(min: number, max: number, value: number): number {
  const x = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

export function enableTerrainSplat(material: THREE.MeshStandardMaterial, rockMap: THREE.Texture, sandMap: THREE.Texture): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTerrainRock = { value: rockMap };
    shader.uniforms.uTerrainSand = { value: sandMap };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float surface;\nvarying float vTerrainSurface;',
    ).replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvTerrainSurface = surface;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform sampler2D uTerrainRock;\nuniform sampler2D uTerrainSand;\nvarying float vTerrainSurface;',
    ).replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 grassSample = texture2D(map, vMapUv);
        vec4 sandSample = texture2D(uTerrainSand, vMapUv * 0.72);
        vec4 rockSample = texture2D(uTerrainRock, vMapUv * 1.25);
        vec4 terrainSample = vTerrainSurface < 1.0
          ? mix(grassSample, sandSample, clamp(vTerrainSurface, 0.0, 1.0))
          : mix(sandSample, rockSample, clamp(vTerrainSurface - 1.0, 0.0, 1.0));
        diffuseColor *= terrainSample;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => 'math-kart-v4-terrain-splat';
}

function createOcean(mobile: boolean): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x087f9d) },
      uShallow: { value: new THREE.Color(0x42c8c4) },
      uSky: { value: new THREE.Color(0xb8edf0) },
      uFog: { value: new THREE.Color(0xa9e3ed) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      varying float vDepth;
      void main() {
        vec3 p = position;
        float a = sin(p.x * 0.105 + uTime * 0.72) * 0.075;
        float b = sin(p.y * 0.16 - uTime * 0.94) * 0.048;
        float c = sin((p.x + p.y) * 0.047 + uTime * 0.43) * 0.105;
        p.z += a + b + c;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vWave = a + b + c;
        vec4 mv = viewMatrix * world;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform vec3 uFog;
      varying vec3 vWorld;
      varying float vWave;
      varying float vDepth;
      void main() {
        vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (normal.y < 0.0) normal *= -1.0;
        normal.x += sin(vWorld.x * 0.73 + uTime * 1.2) * 0.055;
        normal.z += cos(vWorld.z * 0.67 - uTime) * 0.055;
        normal = normalize(normal);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
        float ripples = sin(vWorld.x * 0.34 + vWorld.z * 0.25 + uTime) * 0.5 + 0.5;
        vec3 color = mix(uDeep, uShallow, 0.33 + ripples * 0.12 + vWave * 0.7);
        color = mix(color, uSky, fresnel * 0.58);
        vec3 sunDir = normalize(vec3(-0.45, 0.8, 0.35));
        float sparkle = pow(max(dot(reflect(-sunDir, normal), viewDir), 0.0), 115.0);
        color += vec3(1.0, 0.91, 0.69) * sparkle * 1.35;
        float coast = length(vWorld.xz - vec2(18.0, 4.0));
        float foamWave = sin(coast * 1.42 - uTime * 1.55 + sin(vWorld.x * 0.32) * 0.8) * 0.5 + 0.5;
        float foam = smoothstep(0.68, 0.94, foamWave) * smoothstep(88.0, 94.0, coast) * (1.0 - smoothstep(96.0, 103.0, coast));
        color = mix(color, vec3(0.89, 1.0, 0.96), foam * 0.72);
        float fogFactor = smoothstep(115.0, 320.0, vDepth);
        color = mix(color, uFog, fogFactor);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, mobile ? 56 : 64, mobile ? 56 : 64), material);
  ocean.name = 'v4-dynamic-coastal-water';
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -2.85;
  return ocean;
}

function cloudMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 1, metalness: 0, flatShading: false });
}

function createClouds(mobile: boolean, random: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'v4-continuous-volumetric-clouds';
  const count = mobile ? 5 : 10;
  for (let index = 0; index < count; index += 1) {
    const resolution = mobile ? 12 : 26;
    const cloud = new MarchingCubes(resolution, cloudMaterial(), false, false);
    cloud.isolation = 72;
    const balls = mobile ? 8 : 12;
    for (let ball = 0; ball < balls; ball += 1) {
      const angle = (ball / balls) * Math.PI * 2;
      const layer = ball % 3;
      const x = 0.5 + Math.cos(angle) * (layer === 0 ? 0.19 : 0.13) + (random() - 0.5) * 0.05;
      const y = 0.44 + (layer === 2 ? 0.14 : 0) + random() * 0.08;
      const z = 0.5 + Math.sin(angle) * 0.12 + (random() - 0.5) * 0.04;
      cloud.addBall(x, y, z, 0.19 + random() * 0.08, 11);
    }
    cloud.addBall(0.5, 0.42, 0.5, 0.3, 12);
    cloud.update();
    const angle = (index / count) * Math.PI * 2 + 0.18;
    const radius = 120 + (index % 3) * 28;
    cloud.position.set(Math.cos(angle) * radius, 29 + (index % 4) * 8, Math.sin(angle) * radius);
    const scale = 12 + random() * 9;
    cloud.scale.set(scale * 1.55, scale * 0.72, scale);
    cloud.rotation.y = random() * Math.PI;
    cloud.userData.baseX = cloud.position.x;
    cloud.userData.phase = index * 0.7;
    group.add(cloud);
  }
  return group;
}

function pushTriangle(positions: number[], colors: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color): void {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < 3; i += 1) colors.push(color.r, color.g, color.b);
}

function grassClumpGeometry(random: () => number, mobile: boolean): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const base = new THREE.Color(0x2f704b);
  const tip = new THREE.Color(0x83b96b);
  const bladeCount = mobile ? 10 : 6;
  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = (blade / bladeCount) * Math.PI * 2 + random() * 0.5;
    const root = new THREE.Vector3((random() - 0.5) * 0.24, 0, (random() - 0.5) * 0.24);
    const height = 0.38 + random() * 0.42;
    const width = 0.025 + random() * 0.027;
    const side = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const bend = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle)).multiplyScalar(0.09 + random() * 0.13);
    const left = root.clone().addScaledVector(side, -width);
    const right = root.clone().addScaledVector(side, width);
    const middle = root.clone().add(new THREE.Vector3(0, height * 0.58, 0)).addScaledVector(bend, 0.32);
    const top = root.clone().add(new THREE.Vector3(0, height, 0)).add(bend);
    const middleLeft = middle.clone().addScaledVector(side, -width * 0.55);
    const middleRight = middle.clone().addScaledVector(side, width * 0.55);
    pushTriangle(positions, colors, left, right, middleLeft, base);
    pushTriangle(positions, colors, right, middleRight, middleLeft, base);
    pushTriangle(positions, colors, middleLeft, middleRight, top, tip);
  }
  for (let leaf = 0; leaf < 6; leaf += 1) {
    const angle = (leaf / 6) * Math.PI * 2 + 0.25;
    const root = new THREE.Vector3(0, 0.08 + leaf * 0.018, 0);
    const direction = new THREE.Vector3(Math.cos(angle), 0.35, Math.sin(angle));
    const center = root.clone().addScaledVector(direction, 0.22);
    const end = root.clone().addScaledVector(direction, 0.44);
    const side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(0.075);
    pushTriangle(positions, colors, root, center.clone().add(side), end, new THREE.Color(0x4b8c5c));
    pushTriangle(positions, colors, root, end, center.clone().sub(side), new THREE.Color(0x4b8c5c));
  }
  for (let flower = 0; flower < 3; flower += 1) {
    const center = new THREE.Vector3((random() - 0.5) * 0.28, 0.46 + random() * 0.22, (random() - 0.5) * 0.28);
    const petalColor = new THREE.Color(flower % 2 ? 0xffd9ad : 0xff8d72);
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = (petal / 5) * Math.PI * 2;
      const next = angle + 0.72;
      const a = center.clone().add(new THREE.Vector3(Math.cos(angle) * 0.075, 0, Math.sin(angle) * 0.075));
      const b = center.clone().add(new THREE.Vector3(Math.cos(next) * 0.075, 0, Math.sin(next) * 0.075));
      pushTriangle(positions, colors, center, a, b, petalColor);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createVegetation(
  track: Track,
  materials: WorldMaterials,
  mobile: boolean,
  random: () => number,
  heightAt: (progress: number, lane: number, roadY: number) => number,
): { group: THREE.Group; material: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  group.name = 'v4-instanced-blades-leaves-flowers';
  const material = materials.grass.clone();
  const time = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGrassTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         float windPhase = instanceMatrix[3].x * 0.17 + instanceMatrix[3].z * 0.13;
         transformed.x += sin(uGrassTime * 1.35 + windPhase) * position.y * position.y * 0.055;
         transformed.z += cos(uGrassTime * 1.08 + windPhase) * position.y * position.y * 0.035;
       #endif`,
    );
  };
  material.customProgramCacheKey = () => 'math-kart-v4-grass-wind';
  material.userData.time = time;
  const count = mobile ? 190 : 620;
  const grass = new THREE.InstancedMesh(grassClumpGeometry(random, mobile), material, count);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < count; index += 1) {
    const progress = random() * 0.585;
    const side = index % 2 ? 1 : -1;
    const lane = side * (7.25 + random() * (index % 5 === 0 ? 15 : 8));
    const frame = track.getFrame(progress * track.length, lane);
    frame.position.y = heightAt(progress, lane, frame.position.y) + 0.025;
    const scale = 0.65 + random() * 1.1;
    matrix.compose(
      frame.position,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2),
      new THREE.Vector3(scale * (0.85 + random() * 0.3), scale, scale),
    );
    grass.setMatrixAt(index, matrix);
  }
  grass.computeBoundingSphere();
  group.add(grass);
  return { group, material };
}

export function distantRidgeGeometry(mobile = false): THREE.BufferGeometry {
  const rings = mobile ? 12 : 16;
  const sectors = mobile ? 48 : 64;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rock = new THREE.Color(0xd8cfae);
  const grass = new THREE.Color(0x79a879);
  const dark = new THREE.Color(0x789a8a);
  const peak = new THREE.Color(0xeee2bd);
  for (let ring = 0; ring <= rings; ring += 1) {
    const radius = ring / rings;
    for (let sector = 0; sector <= sectors; sector += 1) {
      const angle = (sector / sectors) * Math.PI * 2;
      const radial = radius * (1 + Math.sin(angle * 4) * 0.045);
      const px = Math.cos(angle) * radial;
      const pz = Math.sin(angle) * radial;
      const edge = 1 - smoothstep(0.8, 1, radius);
      const peakA = 0.7 * Math.exp(-((px + 0.2) ** 2 * 3.4 + (pz - 0.08) ** 2 * 3.1));
      const peakB = 0.52 * Math.exp(-((px - 0.29) ** 2 * 4.9 + (pz + 0.13) ** 2 * 4.4));
      const peakC = 0.38 * Math.exp(-((px + 0.02) ** 2 * 6.2 + (pz - 0.34) ** 2 * 5.5));
      const erosion = (Math.sin(angle * 13 + radius * 18) * 0.018 + Math.sin(angle * 5 - radius * 29) * 0.014) * radius * (1 - radius);
      const height = Math.max(0, Math.max(peakA, peakB, peakC) * edge + erosion);
      positions.push(px, height, pz);
      uvs.push(Math.cos(angle) * radial * 2 + 0.5, Math.sin(angle) * radial * 2 + 0.5);
      const color = height > 0.52 && radius < 0.66 ? peak : height > 0.32 && radius < 0.76 ? rock : height > 0.12 && radius < 0.84 ? grass : radius > 0.84 ? dark : rock;
      colors.push(color.r, color.g, color.b);
      if (ring < rings && sector < sectors) {
        const a = ring * (sectors + 1) + sector;
        const b = a + sectors + 1;
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
  return geometry;
}

export function coastalRockGeometry(detail = 2): THREE.BufferGeometry {
  const boulders: THREE.BufferGeometry[] = [];
  const transforms = [
    { offset: new THREE.Vector3(0, 0.9, 0), scale: new THREE.Vector3(1.15, 1.35, 0.95), yaw: 0.2 },
    { offset: new THREE.Vector3(0.9, 0.52, 0.32), scale: new THREE.Vector3(0.82, 0.88, 0.76), yaw: 1.7 },
    { offset: new THREE.Vector3(-0.72, 0.38, -0.42), scale: new THREE.Vector3(0.74, 0.7, 0.82), yaw: -0.8 },
  ];
  transforms.forEach((transform, boulderIndex) => {
    const geometry = new THREE.SphereGeometry(1, detail > 1 ? 16 : 12, detail > 1 ? 12 : 9);
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const strata = Math.sin(y * 15 + boulderIndex * 0.7) * 0.018;
      const fracture = Math.sin(x * 5.3 + z * 4.1 + boulderIndex) * 0.038 + Math.sin(z * 6.2 - y * 3.4) * 0.025;
      const radius = 1 + fracture + strata;
      positions.setXYZ(index, x * radius, Math.max(-0.72, y * radius), z * radius);
      const shade = 0.79 + (y + 1) * 0.08 + Math.sin(y * 13 + boulderIndex) * 0.025;
      colors.push(shade * 1.02, shade, shade * 0.88);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const matrix = new THREE.Matrix4().compose(
      transform.offset,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), transform.yaw),
      transform.scale,
    );
    geometry.applyMatrix4(matrix);
    boulders.push(geometry);
  });
  const merged = mergeGeometries(boulders, false)!;
  merged.computeVertexNormals();
  boulders.forEach((geometry) => geometry.dispose());
  return merged;
}

export function createNatureSystems(
  track: Track,
  materials: WorldMaterials,
  mobile: boolean,
  random: () => number,
  heightAt: (progress: number, lane: number, roadY: number) => number,
): NatureSystems {
  const ocean = createOcean(mobile);
  const clouds = createClouds(mobile, random);
  const vegetation = createVegetation(track, materials, mobile, random, heightAt);
  const group = new THREE.Group();
  group.add(ocean, clouds, vegetation.group);
  group.name = 'v4-nature-systems';
  return {
    root: group,
    ocean,
    grassMaterial: vegetation.material,
    update: (elapsed: number) => {
      ocean.material.uniforms.uTime.value = elapsed;
      vegetation.material.userData.time.value = elapsed;
      clouds.children.forEach((cloud, index) => {
        cloud.position.x = cloud.userData.baseX + Math.sin(elapsed * 0.025 + index) * 3;
      });
    },
  };
}
