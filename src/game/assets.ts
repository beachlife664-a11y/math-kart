import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { KartId } from './types';
import { KART_SPECS } from './config';

function createGLTFLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

interface KartModelConfig {
  url: string;
  mobileUrl?: string;
  rotationY?: number;
  integratedSteeringWheel?: boolean;
}

interface ModelManifest {
  models: Partial<Record<KartId, KartModelConfig>>;
}

export interface LoadedKartModel {
  id: KartId;
  root: THREE.Group;
  triangles: number;
  meshes: number;
  size: { x: number; y: number; z: number };
  integratedSteeringWheel: boolean;
}

export async function loadHyperKarts(base: string, mobile = false): Promise<LoadedKartModel[]> {
  const response = await fetch(`${base}models/manifest.json`);
  if (!response.ok) return [];
  const manifest = await response.json() as ModelManifest;
  const loader = createGLTFLoader();
  const entries = Object.entries(manifest.models) as [KartId, KartModelConfig][];
  const jobs = entries.map(async ([id, config]) => {
    const url = mobile ? config.mobileUrl ?? config.url : config.url;
    const gltf = await loader.loadAsync(`${base}${url.replace(/^\//, '')}`);
    const wrapper = new THREE.Group();
    wrapper.name = `hyper3d-${id}`;
    const model = gltf.scene;
    const initialBounds = new THREE.Box3().setFromObject(model);
    const size = initialBounds.getSize(new THREE.Vector3());
    if (size.x > size.z * 1.15) model.rotation.y = Math.PI / 2;
    if (config.rotationY !== undefined) model.rotation.y = config.rotationY;
    model.updateMatrixWorld(true);
    const rotatedBounds = new THREE.Box3().setFromObject(model);
    const rotatedSize = rotatedBounds.getSize(new THREE.Vector3());
    const targetSize = KART_SPECS.find((spec) => spec.id === id)!.rig.modelSize;
    model.scale.set(targetSize.x / rotatedSize.x, targetSize.y / rotatedSize.y, targetSize.z / rotatedSize.z);
    model.updateMatrixWorld(true);
    const scaledBounds = new THREE.Box3().setFromObject(model);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= scaledBounds.min.y;
    let triangles = 0;
    let meshes = 0;
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes += 1;
      object.castShadow = false;
      object.receiveShadow = true;
      const geometry = object.geometry;
      triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    });
    wrapper.add(model);
    const normalizedSize = new THREE.Box3().setFromObject(wrapper).getSize(new THREE.Vector3());
    return { id, root: wrapper, triangles: Math.round(triangles), meshes, size: { x: normalizedSize.x, y: normalizedSize.y, z: normalizedSize.z }, integratedSteeringWheel: config.integratedSteeringWheel === true };
  });
  const results = await Promise.allSettled(jobs);
  return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
}

function configureMobileEnvironmentMaterial(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  material.normalMap = null;
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.aoMap = null;
  material.roughness = 0.82;
  material.metalness = 0.06;
  material.needsUpdate = true;
}

export type LandmarkId = 'harbor' | 'lighthouse' | 'cave' | 'bridge';

export interface LoadedLandmarkModel {
  id: LandmarkId;
  root: THREE.Group;
  triangles: number;
  meshes: number;
  size: { x: number; y: number; z: number };
}

interface LandmarkManifest {
  models: Partial<Record<LandmarkId, { url: string; targetHeight: number; maxWidth?: number; rotationY?: number; widthScale?: number; depthScale?: number }>>;
}

export async function loadHyperLandmarks(base: string, mobile = false): Promise<LoadedLandmarkModel[]> {
  const response = await fetch(`${base}models/landmarks${mobile ? '-mobile' : ''}.json`);
  if (!response.ok) return [];
  const manifest = await response.json() as LandmarkManifest;
  const loader = createGLTFLoader();
  const entries = Object.entries(manifest.models) as [LandmarkId, { url: string; targetHeight: number; maxWidth?: number; rotationY?: number; widthScale?: number; depthScale?: number }][];
  const jobs = entries.map(async ([id, config]) => {
    const gltf = await loader.loadAsync(`${base}${config.url.replace(/^\//, '')}`);
    const model = gltf.scene;
    if (config.rotationY !== undefined) model.rotation.y = config.rotationY;
    model.updateMatrixWorld(true);
    const initialBounds = new THREE.Box3().setFromObject(model);
    const initialSize = initialBounds.getSize(new THREE.Vector3());
    const scale = Math.min(config.targetHeight / initialSize.y, (config.maxWidth ?? 100) / Math.max(initialSize.x, initialSize.z));
    model.scale.setScalar(scale);
    model.scale.x *= config.widthScale ?? 1;
    model.scale.z *= config.depthScale ?? 1;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= bounds.min.y;
    let triangles = 0;
    let meshes = 0;
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes += 1;
      object.castShadow = false;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (id === 'cave') material.side = THREE.DoubleSide;
        if (mobile) configureMobileEnvironmentMaterial(material);
      }
      triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3;
    });
    const wrapper = new THREE.Group();
    wrapper.name = `hyper3d-landmark-${id}`;
    wrapper.add(model);
    const size = new THREE.Box3().setFromObject(wrapper).getSize(new THREE.Vector3());
    return { id, root: wrapper, triangles: Math.round(triangles), meshes, size: { x: size.x, y: size.y, z: size.z } };
  });
  const results = await Promise.allSettled(jobs);
  return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
}

export type EnvironmentAssetId = 'boat' | 'palm' | 'cliff' | 'hill';
export interface LoadedEnvironmentModel extends Omit<LoadedLandmarkModel, 'id'> {
  id: EnvironmentAssetId;
}
interface EnvironmentManifest {
  models: Partial<Record<EnvironmentAssetId, { url: string; targetHeight: number; maxWidth?: number; rotationY?: number }>>;
}

export async function loadHyperEnvironment(base: string, mobile = false): Promise<LoadedEnvironmentModel[]> {
  const response = await fetch(`${base}models/environment${mobile ? '-mobile' : ''}.json`);
  if (!response.ok) return [];
  const manifest = await response.json() as EnvironmentManifest;
  const loader = createGLTFLoader();
  const entries = Object.entries(manifest.models) as [EnvironmentAssetId, { url: string; targetHeight: number; maxWidth?: number; rotationY?: number }][];
  const jobs = entries.map(async ([id, config]) => {
    const gltf = await loader.loadAsync(`${base}${config.url.replace(/^\//, '')}`);
    const model = gltf.scene;
    if (config.rotationY !== undefined) model.rotation.y = config.rotationY;
    model.updateMatrixWorld(true);
    const initialBounds = new THREE.Box3().setFromObject(model);
    const initialSize = initialBounds.getSize(new THREE.Vector3());
    const scale = Math.min(config.targetHeight / initialSize.y, (config.maxWidth ?? 100) / Math.max(initialSize.x, initialSize.z));
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= bounds.min.y;
    let triangles = 0;
    let meshes = 0;
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes += 1;
      object.castShadow = false;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (id === 'cliff' || id === 'hill') {
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.roughness = 0.86;
            material.metalness = 0;
          }
        }
      }
      if (mobile) {
        for (const material of materials) configureMobileEnvironmentMaterial(material);
      }
      triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3;
    });
    const wrapper = new THREE.Group();
    wrapper.name = `hyper3d-environment-${id}`;
    wrapper.add(model);
    wrapper.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(wrapper).getSize(new THREE.Vector3());
    return { id, root: wrapper, triangles: Math.round(triangles), meshes, size: { x: size.x, y: size.y, z: size.z } };
  });
  const results = await Promise.allSettled(jobs);
  return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
}
