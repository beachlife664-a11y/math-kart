import * as THREE from 'three';

const BASE = `${(import.meta.env.MIAODA_CLIENT_BASE_PATH || '').replace(/\/$/, '')}/`;

export interface TexturePair {
  color: THREE.Texture;
  normal: THREE.Texture;
}

export interface WorldMaterials {
  road: THREE.MeshStandardMaterial;
  terrain: THREE.MeshStandardMaterial;
  sand: THREE.MeshStandardMaterial;
  cave: THREE.MeshStandardMaterial;
  curb: THREE.MeshStandardMaterial;
  rail: THREE.MeshStandardMaterial;
  railDark: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  coral: THREE.MeshStandardMaterial;
  cream: THREE.MeshStandardMaterial;
  teal: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  reflector: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  flowers: THREE.MeshStandardMaterial;
}

function loadPair(name: string, mobile: boolean, repeatX = 1, repeatY = 1): TexturePair {
  const loader = new THREE.TextureLoader();
  const color = loader.load(`${BASE}textures/${name}-color.jpg`);
  color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = color.wrapT = THREE.RepeatWrapping;
  color.repeat.set(repeatX, repeatY);
  color.anisotropy = mobile ? 4 : 8;
  const normal = loader.load(`${BASE}textures/${name}-normal.jpg`);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(repeatX, repeatY);
  normal.anisotropy = mobile ? 2 : 4;
  return { color, normal };
}

export function createWorldMaterials(mobile: boolean): WorldMaterials {
  const asphalt = loadPair('asphalt', mobile);
  const grass = loadPair('grass', mobile);
  const rock = loadPair('rock', mobile, 1.4, 1.4);
  const sand = loadPair('sand', mobile, 3, 3);
  return {
    road: new THREE.MeshStandardMaterial({
      map: asphalt.color,
      normalMap: mobile ? null : asphalt.normal,
      normalScale: new THREE.Vector2(0.48, 0.48),
      color: 0xb9c2c5,
      vertexColors: true,
      roughness: 0.91,
      metalness: 0.025,
    }),
    terrain: new THREE.MeshStandardMaterial({
      map: grass.color,
      normalMap: mobile ? null : grass.normal,
      normalScale: new THREE.Vector2(0.52, 0.52),
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
    }),
    sand: new THREE.MeshStandardMaterial({
      map: sand.color,
      normalMap: mobile ? null : sand.normal,
      normalScale: new THREE.Vector2(0.42, 0.42),
      color: 0xf0dba8,
      roughness: 0.98,
    }),
    cave: new THREE.MeshStandardMaterial({
      map: rock.color,
      normalMap: mobile ? null : rock.normal,
      normalScale: new THREE.Vector2(0.72, 0.72),
      vertexColors: true,
      roughness: 0.94,
      side: THREE.DoubleSide,
    }),
    curb: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.63, metalness: 0.02 }),
    rail: new THREE.MeshStandardMaterial({ color: 0xf4e8c8, roughness: 0.58, metalness: 0.16 }),
    railDark: new THREE.MeshStandardMaterial({ color: 0x27757b, roughness: 0.58, metalness: 0.18 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb7b8a8, roughness: 0.94 }),
    coral: new THREE.MeshStandardMaterial({ color: 0xf2554d, roughness: 0.48, metalness: 0.08 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xfff0cf, roughness: 0.64 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x168f91, roughness: 0.48, metalness: 0.12 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1d2427, roughness: 0.94 }),
    reflector: new THREE.MeshStandardMaterial({ color: 0xfff2b4, emissive: 0xffc95c, emissiveIntensity: 0.52, roughness: 0.35 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x4d9362, roughness: 0.94, side: THREE.DoubleSide, vertexColors: true }),
    flowers: new THREE.MeshStandardMaterial({ color: 0xffb071, roughness: 0.72, side: THREE.DoubleSide, vertexColors: true }),
  };
}
