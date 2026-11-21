import type { KartSpec, PowerUpKind, TrackSectionId } from './types';

export const KART_SPECS: KartSpec[] = [
  {
    id: 'comet', name: '彗星号', englishName: 'COMET GP', color: '#f2554d', accent: '#fff0cf',
    description: '开轮方程式 · 低趴长鼻与高下压力尾翼',
    rig: { modelSize: { x: 1.66, y: 1.08, z: 2.5 }, wheelRadius: 0.32, wheelWidth: 0.28, wheelX: 0.83, wheelY: 0.32, frontZ: 0.82, rearZ: -0.78, driverPosition: [0, 0.59, -0.15], driverScale: 0.72, armsPosition: [0, 0.43, 0.16] },
  },
  {
    id: 'reef', name: '浪花号', englishName: 'REEF BUGGY', color: '#16b8b0', accent: '#fff0cf',
    description: '管架沙滩车 · 高坐姿与长行程悬挂',
    rig: { modelSize: { x: 1.62, y: 1.48, z: 2.3 }, wheelRadius: 0.38, wheelWidth: 0.3, wheelX: 0.79, wheelY: 0.38, frontZ: 0.73, rearZ: -0.72, driverPosition: [0, 0.87, -0.05], driverScale: 0.75, armsPosition: [0, 0.42, 0.17] },
  },
  {
    id: 'bolt', name: '闪电号', englishName: 'BOLT SPYDER', color: '#f4bd32', accent: '#253744',
    description: '楔形敞篷跑车 · 低宽车身与双座座舱',
    rig: { modelSize: { x: 1.76, y: 1.0, z: 2.45 }, wheelRadius: 0.31, wheelWidth: 0.28, wheelX: 0.8, wheelY: 0.31, frontZ: 0.79, rearZ: -0.77, driverPosition: [-0.22, 0.42, 0.08], driverScale: 0.6, armsPosition: [0, 0.43, 0.18] },
  },
  {
    id: 'sprout', name: '嫩芽号', englishName: 'SPROUT BUBBLE', color: '#68b94e', accent: '#fff0cf',
    description: '圆泡微型车 · 直立车身与高视野座舱',
    rig: { modelSize: { x: 1.46, y: 1.45, z: 2.08 }, wheelRadius: 0.3, wheelWidth: 0.24, wheelX: 0.69, wheelY: 0.3, frontZ: 0.64, rearZ: -0.63, driverPosition: [0.22, 0.68, 0.16], driverScale: 0.6, armsPosition: [0, 0.43, 0.16] },
  },
  {
    id: 'nova', name: '星辉号', englishName: 'NOVA STREAM', color: '#7c6de0', accent: '#fff0cf',
    description: '水滴流线跑车 · 弧形车身与尾鳍',
    rig: { modelSize: { x: 1.58, y: 1.06, z: 2.55 }, wheelRadius: 0.31, wheelWidth: 0.25, wheelX: 0.73, wheelY: 0.31, frontZ: 0.83, rearZ: -0.79, driverPosition: [0, 0.6, -0.1], driverScale: 0.69, armsPosition: [0, 0.43, 0.17] },
  },
  {
    id: 'titan', name: '巨石号', englishName: 'TITAN MINI', color: '#ef6a3c', accent: '#183c56',
    description: '迷你怪兽卡车 · 超大轮胎与抬高车身',
    rig: { modelSize: { x: 1.88, y: 1.62, z: 2.36 }, wheelRadius: 0.44, wheelWidth: 0.34, wheelX: 0.91, wheelY: 0.44, frontZ: 0.74, rearZ: -0.73, driverPosition: [0, 0.82, 0.08], driverScale: 0.74, armsPosition: [0, 0.42, 0.18] },
  },
  {
    id: 'mochi', name: '麻薯号', englishName: 'MOCHI CLASSIC', color: '#ef9a96', accent: '#fff0cf',
    description: '复古圆顶敞篷车 · 短轴距与圆形保险杠',
    rig: { modelSize: { x: 1.46, y: 1.4, z: 2.08 }, wheelRadius: 0.29, wheelWidth: 0.23, wheelX: 0.69, wheelY: 0.29, frontZ: 0.63, rearZ: -0.62, driverPosition: [0.22, 0.58, 0.18], driverScale: 0.62, armsPosition: [0, 0.43, 0.16] },
  },
];

export const TOTAL_LAPS = 2;
export const ROAD_WIDTH = 12;
export const FIXED_DT = 1 / 60;
export const MAX_SPEED = 21;
export const QUESTION_INTERVAL = 9.5;
export const LANE_CANDIDATES = [-3.6, -1.8, 0, 1.8, 3.6];
export const SECTION_NAMES: Record<TrackSectionId, string> = {
  seaside: '海滨发车区', harbor: '彩色港口', cliff: '山崖盘山道', cave: '水晶洞穴', bridge: '跨海大桥',
};
export const POWER_UP_LABELS: Record<Exclude<PowerUpKind, null>, string> = {
  nitro: '氮气加速', shield: '流星护盾', overdrive: '超级涡轮',
};
