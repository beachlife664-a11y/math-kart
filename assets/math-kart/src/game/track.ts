import * as THREE from 'three';
import { ROAD_WIDTH, SECTION_NAMES } from './config';
import type { TrackSectionId } from './types';

export interface TrackFrame {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface TrackSection {
  id: TrackSectionId;
  name: string;
  start: number;
  end: number;
}

export interface SectionChallenge {
  id: TrackSectionId;
  at: number;
  title: string;
  rewardLabel: string;
}

export const TRACK_SECTIONS: TrackSection[] = [
  { id: 'seaside', name: SECTION_NAMES.seaside, start: 0, end: 0.18 },
  { id: 'harbor', name: SECTION_NAMES.harbor, start: 0.18, end: 0.38 },
  { id: 'cliff', name: SECTION_NAMES.cliff, start: 0.38, end: 0.58 },
  { id: 'cave', name: SECTION_NAMES.cave, start: 0.58, end: 0.76 },
  { id: 'bridge', name: SECTION_NAMES.bridge, start: 0.76, end: 1 },
];

export const SECTION_CHALLENGES: SectionChallenge[] = [
  { id: 'harbor', at: 0.245, title: '港口奖励题', rewardLabel: '开启港口加速线' },
  { id: 'cliff', at: 0.46, title: '发夹弯奖励题', rewardLabel: '解锁内侧漂移捷径' },
  { id: 'cave', at: 0.655, title: '水晶奖励题', rewardLabel: '开启水晶高速线' },
  { id: 'bridge', at: 0.825, title: '跳台奖励题', rewardLabel: '武装落地冲刺' },
];

export const TRACK_OBSTACLES = [
  { at: 0.29, lane: 0 }, { at: 0.335, lane: -1.8 }, { at: 0.515, lane: 1.8 },
  { at: 0.69, lane: 0 }, { at: 0.795, lane: -1.8 },
];

const CONTROL_POINTS: [number, number, number][] = [
  [0, 0, 70], [25, 0, 69], [50, 0, 64], [72, 0.5, 53],
  [88, 1, 38], [94, 1.5, 18], [86, 2, -1], [67, 2.5, -8], [52, 3, 1],
  [38, 5, -16], [40, 9, -38], [60, 13, -50], [52, 17, -66], [28, 18, -72],
  [5, 16, -64], [-8, 13, -48], [0, 11, -32], [-18, 9, -24], [-36, 8, -35],
  [-55, 6, -48], [-72, 4, -40], [-84, 3, -22], [-88, 2, 0],
  [-84, 2, 22], [-70, 4, 43], [-50, 5, 58], [-26, 2, 67],
];

export class Track {
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  readonly width = ROAD_WIDTH;
  readonly mapPoints: { x: number; y: number }[];

  constructor() {
    this.curve = new THREE.CatmullRomCurve3(
      CONTROL_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'catmullrom', 0.3,
    );
    this.length = this.curve.getLength();
    const bounds = new THREE.Box3().setFromPoints(this.curve.getPoints(160));
    const size = bounds.getSize(new THREE.Vector3());
    this.mapPoints = this.curve.getPoints(140).map((point) => ({
      x: 8 + ((point.x - bounds.min.x) / size.x) * 84,
      y: 8 + ((point.z - bounds.min.z) / size.z) * 84,
    }));
  }

  wrap(distance: number): number {
    return ((distance % this.length) + this.length) % this.length;
  }

  progress(distance: number): number {
    return this.wrap(distance) / this.length;
  }

  getFrame(distance: number, lane = 0): TrackFrame {
    const t = this.progress(distance);
    const position = this.curve.getPointAt(t);
    const tangent = this.curve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    position.addScaledVector(normal, lane);
    return { position, tangent, normal };
  }

  getCurvature(distance: number): number {
    const a = this.getFrame(distance).tangent;
    const b = this.getFrame(distance + 4).tangent;
    const cross = a.x * b.z - a.z * b.x;
    return THREE.MathUtils.clamp(cross / 4, -0.35, 0.35);
  }

  getSection(distance: number): TrackSection {
    const progress = this.progress(distance);
    return TRACK_SECTIONS.find((section) => progress >= section.start && progress < section.end) ?? TRACK_SECTIONS[0];
  }

  getSectionProgress(distance: number): number {
    const section = this.getSection(distance);
    return THREE.MathUtils.clamp((this.progress(distance) - section.start) / (section.end - section.start), 0, 1);
  }

  isJumpGate(distance: number): boolean {
    const progress = this.progress(distance);
    return progress >= 0.885 && progress < 0.895;
  }
}
