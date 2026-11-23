import * as THREE from 'three';
import { GameAudio } from './audio';
import { loadHyperEnvironment, loadHyperKarts, loadHyperLandmarks } from './assets';
import { FIXED_DT, KART_SPECS, TOTAL_LAPS } from './config';
import { TRACK_OBSTACLES } from './track';
import { createProceduralKart, type KartVisual } from './proceduralKarts';
import { RaceSimulation, type RaceEvent } from './raceSimulation';
import { createSeededRandom } from './random';
import type { GameSnapshot, KartId, PlayerIndex } from './types';
import { VfxSystem } from './vfx';
import { World } from './world';
import { createShowroomStage, SHOWROOM_ORIGIN } from './showroom';

const BASE = `${(import.meta.env.MIAODA_CLIENT_BASE_PATH || '').replace(/\/$/, '')}/`;

interface CameraFocus {
  distance: number;
  lane: number;
  airHeight: number;
  boost: number;
  overdrive: number;
}

export class GameEngine {
  readonly simulation: RaceSimulation;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly secondaryCamera: THREE.PerspectiveCamera;
  private splitView = false;
  private cameraModeTimer = 0;
  private cameraSeparation = 0;
  private readonly world: World;
  private readonly audio = new GameAudio();
  private readonly vfx: VfxSystem;
  private readonly visuals = new Map<KartId, KartVisual>();
  private readonly resizeObserver: ResizeObserver;
  private readonly mobile: boolean;
  private random = createSeededRandom(42);
  private animationFrame = 0;
  private previousTime = 0;
  private accumulator = 0;
  private snapshotTimer = 0;
  private elapsedVisual = 0;
  private frame = 0;
  private fps = 60;
  private screenshotPaused = false;
  private reducedMotion = false;
  private assetsReady: Promise<void>;
  private disposed = false;
  private markTimer = 0;
  private sparkTimer = 0;
  private readonly assetDiagnostics: Record<string, { triangles: number; meshes: number; size: { x: number; y: number; z: number } }> = {};
  private readonly showroomStage: THREE.Group;
  private showroomYaw = 0.68;
  private showroomElevation = 0.34;
  private showroomRadius = 3.6;
  private showroomLastInteraction = 0;
  private showroomPointerId: number | null = null;
  private showroomPointerX = 0;
  private showroomPointerY = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly onSnapshot: (snapshot: GameSnapshot) => void,
  ) {
    this.mobile = matchMedia('(pointer: coarse)').matches || container.clientWidth < 720;
    this.showroomStage = createShowroomStage(this.mobile);
    this.showroomStage.position.copy(SHOWROOM_ORIGIN);
    this.showroomRadius = this.mobile ? 6.4 : 4.5;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.35 : 1.75));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.setAttribute('aria-label', '算力狂飙三维自动竞速画面');
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(this.mobile ? 62 : 58, container.clientWidth / container.clientHeight, 0.1, 320);
    this.secondaryCamera = this.camera.clone();
    this.world = new World(this.renderer, this.mobile, createSeededRandom(84));
    this.world.scene.add(this.showroomStage);
    this.simulation = new RaceSimulation(this.world.track, this.random, (event, playerIndex) => this.handleEvent(event, playerIndex));
    this.vfx = new VfxSystem(this.world.scene, createSeededRandom(126), this.mobile);
    for (const spec of KART_SPECS) {
      const visual = createProceduralKart(spec, this.mobile);
      this.visuals.set(spec.id, visual);
      this.world.scene.add(visual.root);
    }
    this.assetsReady = this.loadAssets();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.addEventListener('pointerdown', this.onShowroomPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onShowroomPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.onShowroomPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onShowroomPointerUp);
    this.renderer.domElement.addEventListener('lostpointercapture', this.onShowroomPointerUp);
    this.renderer.domElement.addEventListener('wheel', this.onShowroomWheel, { passive: false });
    if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('qa')) this.installDiagnostics();
    this.updateTransforms(0);
    this.updateCamera(1);
    this.animationFrame = requestAnimationFrame(this.loop);
    this.audio.prepare(BASE);
  }

  private async loadAssets(): Promise<void> {
    try {
      const [models, landmarks, environment] = await Promise.all([loadHyperKarts(BASE, this.mobile), loadHyperLandmarks(BASE, this.mobile), loadHyperEnvironment(BASE, this.mobile)]);
      for (const model of models) {
        const visual = this.visuals.get(model.id);
        if (!visual) continue;
        visual.modelSlot.clear();
        visual.modelSlot.add(model.root);
        const steeringWheel = visual.driverArms.getObjectByName('driver-steering-wheel');
        if (steeringWheel) steeringWheel.visible = !model.integratedSteeringWheel;
        for (const wheel of visual.wheels) {
          wheel.pivot.visible = false;
        }
        visual.root.userData.hyperModel = true;
        visual.root.userData.assetSource = 'Hyper3D';
        visual.root.userData.triangles = model.triangles;
        this.assetDiagnostics[model.id] = { triangles: model.triangles, meshes: model.meshes, size: model.size };
        this.simulation.loadedModels.push(model.id);
      }
      const installed = this.world.installLandmarks(landmarks);
      for (const model of landmarks) this.assetDiagnostics[`landmark-${model.id}`] = { triangles: model.triangles, meshes: model.meshes, size: model.size };
      this.simulation.loadedLandmarks.push(...installed);
      this.world.installEnvironment(environment);
      for (const model of environment) this.assetDiagnostics[`environment-${model.id}`] = { triangles: model.triangles, meshes: model.meshes, size: model.size };
    } finally {
      this.emitSnapshot();
    }
  }

  async start(): Promise<void> {
    await this.audio.unlock();
    this.audio.play('click');
    this.audio.setScene('race');
    await this.audio.setPaused(false);
    this.splitView = false;
    this.cameraModeTimer = 0;
    this.cameraSeparation = 0;
    this.simulation.restart();
    this.emitSnapshot();
  }

  selectKart(id: KartId, playerIndex: PlayerIndex = 0): void {
    void this.audio.unlock().then(() => this.audio.play('click'));
    this.simulation.selectKart(id, playerIndex);
    this.resetShowroom(false);
    this.updateTransforms(0);
    this.emitSnapshot();
  }

  setPlayerCount(count: 1 | 2): void {
    void this.audio.unlock().then(() => this.audio.play('click'));
    this.splitView = false;
    this.cameraModeTimer = 0;
    this.cameraSeparation = 0;
    this.simulation.setPlayerCount(count);
    this.resetShowroom(false);
    this.updateTransforms(0);
    this.emitSnapshot();
  }

  resetShowroom(withSound = true): void {
    if (withSound) void this.audio.unlock().then(() => this.audio.play('click'));
    this.splitView = false;
    this.cameraModeTimer = 0;
    this.cameraSeparation = 0;
    this.showroomYaw = 0.68;
    this.showroomElevation = 0.34;
    this.showroomRadius = this.mobile ? 6.4 : 4.5;
    this.showroomLastInteraction = this.elapsedVisual;
    this.updateTransforms(0);
    this.updateCamera(1);
  }

  togglePause(): void {
    if (this.simulation.phase === 'menu' || this.simulation.phase === 'finished') return;
    const pausing = this.simulation.phase !== 'paused';
    this.simulation.togglePause();
    if (pausing) {
      this.audio.play('click');
      void this.audio.setPaused(true);
    } else {
      void this.audio.setPaused(false).then(() => this.audio.play('click'));
    }
    this.emitSnapshot();
  }

  inputDigit(playerIndex: PlayerIndex, digit: number): void {
    void this.audio.unlock();
    this.simulation.inputDigit(playerIndex, digit);
    this.emitSnapshot();
  }

  backspace(playerIndex: PlayerIndex): void {
    this.simulation.backspace(playerIndex);
    this.emitSnapshot();
  }

  clearInput(playerIndex: PlayerIndex): void {
    this.simulation.clearInput(playerIndex);
    this.emitSnapshot();
  }

  submitAnswer(playerIndex: PlayerIndex = 0): void {
    void this.audio.unlock();
    this.simulation.submitAnswer(playerIndex);
    this.emitSnapshot();
  }

  answer(value: number, playerIndex: PlayerIndex = 0): void {
    void this.audio.unlock();
    this.simulation.answer(value, playerIndex);
    this.emitSnapshot();
  }

  toggleMute(): void {
    void this.audio.unlock();
    this.simulation.muted = !this.simulation.muted;
    if (this.simulation.muted) this.audio.play('click');
    this.audio.setMuted(this.simulation.muted);
    if (!this.simulation.muted) void this.audio.unlock().then(() => this.audio.play('click'));
    this.emitSnapshot();
  }

  getSnapshot(): GameSnapshot {
    return {
      ...this.simulation.getSnapshot(),
      cameraMode: this.splitView ? 'split' : 'shared',
      cameraSeparation: this.cameraSeparation,
    };
  }

  private handleEvent(event: RaceEvent, playerIndex: PlayerIndex = 0): void {
    this.audio.play(event);
    if (event === 'correct' || event === 'boost' || event === 'impact' || event === 'finish' || event === 'land') {
      const player = this.simulation.getPlayerRacer(playerIndex);
      const frame = this.world.track.getFrame(player.distance, player.lane);
      frame.position.y += player.airHeight;
      const color = event === 'impact' ? '#f2554d' : event === 'finish' ? '#f4bd32' : '#7df9e5';
      if (!this.reducedMotion) this.vfx.burst(frame.position, color, event === 'finish' ? 30 : 14);
    }
  }

  private loop = (time: number): void => {
    if (this.disposed) return;
    const delta = this.previousTime === 0 ? FIXED_DT : Math.min(0.05, (time - this.previousTime) / 1000);
    this.previousTime = time;
    this.fps += ((delta > 0 ? 1 / delta : 60) - this.fps) * 0.05;
    this.frame += 1;
    if (!this.screenshotPaused) {
      this.elapsedVisual += delta;
      this.accumulator += delta;
      while (this.accumulator >= FIXED_DT) {
        this.simulation.update(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
      this.world.update(this.elapsedVisual);
      this.vfx.update(delta);
      this.updateTransforms(delta);
      this.updateCamera(delta);
    }
    const player = this.simulation.player;
    this.audio.setScene(this.simulation.phase === 'menu' ? 'menu' : 'race');
    this.audio.setEngine(player.speed, player.boost > 0 || player.overdrive > 0);
    this.renderFrame(delta);
    this.snapshotTimer += delta;
    if (this.snapshotTimer >= 0.1) {
      this.snapshotTimer = 0;
      this.emitSnapshot();
    }
    this.animationFrame = requestAnimationFrame(this.loop);
  };

  private updateTransforms(delta: number): void {
    this.markTimer -= delta;
    this.sparkTimer -= delta;
    const leaveMarks = this.markTimer <= 0;
    const throwSparks = this.sparkTimer <= 0;
    if (leaveMarks) this.markTimer = 0.065;
    if (throwSparks) this.sparkTimer = 0.13;
    const menu = this.simulation.phase === 'menu';
    this.showroomStage.visible = menu;
    for (const [kartIndex, spec] of KART_SPECS.entries()) {
      const visual = this.visuals.get(spec.id)!;
      if (!this.simulation.hasRacer(spec.id)) {
        visual.root.visible = false;
        continue;
      }
      const racer = this.simulation.getRacer(spec.id);
      visual.root.visible = !menu || this.simulation.selectedKarts.slice(0, this.simulation.playerCount).includes(spec.id);
      if (!visual.root.visible) continue;
      const frame = this.world.track.getFrame(racer.distance, racer.lane);
      visual.root.position.copy(frame.position);
      if (menu) {
        visual.root.position.copy(SHOWROOM_ORIGIN);
        if (this.simulation.playerCount === 2) visual.root.position.x += racer.playerIndex === 0 ? -1.55 : 1.55;
      }
      visual.root.position.y += menu ? 0.14 : racer.airHeight + 0.04;
      const yaw = menu ? 0 : Math.atan2(frame.tangent.x, frame.tangent.z);
      visual.root.rotation.y = yaw - racer.lateralSpeed * 0.026 + racer.driftDirection * racer.drift * 0.17;
      if (menu) {
        visual.root.rotation.y = yaw;
        visual.chassis.rotation.set(0, 0, 0);
        visual.chassis.position.y = 0;
        for (const wheel of visual.wheels) {
          wheel.pivot.rotation.y = 0;
          wheel.pivot.position.y = wheel.baseY;
        }
        visual.driver.rotation.z = 0;
        visual.driverArms.rotation.x = 0;
        visual.driverArms.rotation.z = 0;
        for (const flame of visual.flames) flame.visible = false;
        visual.shield.visible = false;
        visual.contact.position.y = 0.03;
        visual.contact.scale.setScalar(1);
        (visual.contact.material as THREE.MeshBasicMaterial).opacity = 0.85;
        continue;
      }
      visual.chassis.rotation.z = -racer.lateralSpeed * 0.024 + racer.driftDirection * racer.drift * 0.11;
      visual.chassis.rotation.x = -Math.asin(THREE.MathUtils.clamp(frame.tangent.y, -0.6, 0.6)) * 0.7 - racer.airVelocity * 0.018;
      visual.chassis.position.y = Math.sin(this.elapsedVisual * 18 + kartIndex) * 0.018 * Math.min(1, racer.speed / 18);
      for (const wheel of visual.wheels) {
        wheel.spinner.rotation.x -= racer.speed * delta / wheel.radius;
        wheel.pivot.rotation.y = wheel.front ? -racer.lateralSpeed * 0.075 + racer.driftDirection * racer.drift * 0.2 : 0;
        wheel.pivot.position.y = wheel.baseY + Math.sin(this.elapsedVisual * 20 + kartIndex + (wheel.front ? 0 : 1.4)) * 0.012;
      }
      visual.driver.rotation.z = -visual.chassis.rotation.z * 0.55 - racer.driftDirection * racer.drift * 0.12;
      if (racer.finished) {
        visual.driverArms.rotation.x = -1.65;
        visual.driverArms.rotation.z = Math.sin(this.elapsedVisual * 8) * 0.18;
      } else {
        visual.driverArms.rotation.x = 0;
        visual.driverArms.rotation.z = 0;
      }
      const boosting = racer.boost > 0 || racer.routeBoost > 0 || racer.overdrive > 0;
      for (const flame of visual.flames) {
        flame.visible = boosting;
        flame.scale.y = 0.75 + Math.sin(this.elapsedVisual * 35 + kartIndex) * 0.2;
        (flame.material as THREE.MeshBasicMaterial).color.set(racer.overdrive > 0 ? 0xffd85e : 0x6ff7ff);
      }
      visual.shield.visible = racer.shield > 0 || racer.telegraph > 0;
      visual.shield.rotation.y += delta * 0.9;
      const shieldMaterial = visual.shield.material as THREE.MeshBasicMaterial;
      shieldMaterial.color.set(racer.telegraph > 0 ? 0xf4bd32 : 0x7df9e5);
      shieldMaterial.opacity = racer.telegraph > 0 ? 0.28 + Math.sin(this.elapsedVisual * 18) * 0.08 : 0.17;
      visual.contact.position.y = 0.015 - racer.airHeight;
      visual.contact.scale.setScalar(1 + racer.airHeight * 0.12);
      (visual.contact.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 1 - racer.airHeight * 0.15);
      if (racer.drift > 0.42 && racer.airHeight <= 0 && this.simulation.phase === 'racing') {
        if (leaveMarks) {
          for (const side of [-0.55, 0.55]) {
            const markFrame = this.world.track.getFrame(racer.distance - 0.65, racer.lane + side);
            this.vfx.tireMark(markFrame.position, yaw);
          }
        }
        if (throwSparks && (racer.id === this.simulation.selectedKart || Math.abs(racer.distance - this.simulation.player.distance) < 20)) {
          const sparkFrame = this.world.track.getFrame(racer.distance - 0.8, racer.lane - racer.driftDirection * 0.65);
          this.vfx.burst(sparkFrame.position, '#ffd477', 4);
        }
      }
    }
  }

  private updateCamera(delta: number): void {
    const player = this.simulation.player;
    const secondary = this.simulation.playerCount === 2 ? this.simulation.getPlayerRacer(1) : null;
    const separation = secondary ? Math.abs(player.distance - secondary.distance) : 0;
    this.cameraSeparation = separation;
    this.cameraModeTimer += delta;
    this.renderer.domElement.style.cursor = this.simulation.phase === 'menu' ? (this.showroomPointerId === null ? 'grab' : 'grabbing') : 'default';
    const smoothing = 1 - Math.exp(-delta * 6);
    if (this.simulation.phase === 'menu') {
      this.splitView = false;
      this.cameraModeTimer = 0;
      if (this.elapsedVisual - this.showroomLastInteraction > 3.5 && !this.reducedMotion) this.showroomYaw += delta * 0.16;
      const angle = this.showroomYaw;
      const backdrop = this.showroomStage.getObjectByName('showroom-backdrop');
      if (backdrop) backdrop.rotation.y = angle;
      const target = SHOWROOM_ORIGIN.clone();
      target.y += 0.84;
      const effectiveRadius = this.showroomRadius + (this.simulation.playerCount === 2 ? 1.25 : 0);
      const horizontalRadius = Math.cos(this.showroomElevation) * effectiveRadius;
      const desired = target.clone().add(new THREE.Vector3(
        Math.sin(angle) * horizontalRadius,
        Math.sin(this.showroomElevation) * effectiveRadius,
        Math.cos(angle) * horizontalRadius,
      ));
      this.camera.position.lerp(desired, smoothing);
      this.camera.lookAt(target);
      const width = Math.max(1, this.container.clientWidth);
      const height = Math.max(1, this.container.clientHeight);
      this.camera.aspect = width / height;
      this.camera.setViewOffset(width, height, this.mobile ? 0 : -width * 0.18, this.mobile ? height * 0.18 : 0, width, height);
      this.camera.fov += ((this.mobile ? 62 : 58) - this.camera.fov) * Math.min(1, delta * 5);
      this.camera.updateProjectionMatrix();
      return;
    }

    const canSplit = Boolean(secondary) && (this.simulation.phase === 'racing' || this.simulation.phase === 'countdown');
    const previousSplit = this.splitView;
    if (this.splitView && (!canSplit || (separation < 18 && this.cameraModeTimer >= 1.2))) {
      this.splitView = false;
    } else if (!this.splitView && canSplit && separation > 32 && this.cameraModeTimer >= 1) {
      this.splitView = true;
    }
    const modeChanged = previousSplit !== this.splitView;
    if (modeChanged) this.cameraModeTimer = 0;

    if (this.splitView && secondary) {
      this.updateRaceCamera(this.camera, player, delta, true, modeChanged, 0, -0.1);
      this.updateRaceCamera(this.secondaryCamera, secondary, delta, true, modeChanged, 0, 0.1);
    } else {
      const focus: CameraFocus = secondary ? {
        distance: (player.distance + secondary.distance) / 2,
        lane: (player.lane + secondary.lane) / 2,
        airHeight: (player.airHeight + secondary.airHeight) / 2,
        boost: Math.max(player.boost, secondary.boost),
        overdrive: Math.max(player.overdrive, secondary.overdrive),
      } : player;
      this.updateRaceCamera(this.camera, focus, delta, false, modeChanged, separation);
    }
  }

  private updateRaceCamera(camera: THREE.PerspectiveCamera, focus: CameraFocus, delta: number, split: boolean, snap: boolean, separation = 0, innerViewOffset = 0): void {
    const frame = this.world.track.getFrame(focus.distance, focus.lane);
    const cameraFrame = this.world.track.getFrame(focus.distance, focus.lane * (this.mobile ? 0.25 : 0.35));
    frame.position.y += focus.airHeight;
    cameraFrame.position.y += focus.airHeight;
    camera.clearViewOffset();
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    camera.aspect = width / (split ? 2 : 1) / height;
    if (split && innerViewOffset !== 0) {
      const viewWidth = width / 2;
      camera.setViewOffset(viewWidth, height, viewWidth * innerViewOffset, 0, viewWidth, height);
    }
    const sharedExtra = split ? 0 : Math.min(18, separation * 0.65);
    const desired = cameraFrame.position.clone().addScaledVector(cameraFrame.tangent, (this.mobile ? -10 : -8.8) - sharedExtra);
    desired.y += (this.mobile ? 5.6 : 4.9) + (split ? 0 : Math.min(4, separation * 0.14));
    desired.y = Math.max(desired.y, frame.position.y + 3.2);
    const pitchBlend = this.mobile ? 0 : THREE.MathUtils.smoothstep(this.simulation.elapsed, 0.35, 2.2);
    const lookAhead = this.mobile ? 0.5 : THREE.MathUtils.lerp(6, 4.8, pitchBlend);
    const lookHeight = this.mobile ? 0.75 : THREE.MathUtils.lerp(0.95, -0.65, pitchBlend);
    const look = frame.position.clone().addScaledVector(frame.tangent, lookAhead);
    look.y += lookHeight;
    const cameraTarget = frame.position.clone();
    cameraTarget.y += 1.1;
    this.world.constrainCamera(cameraTarget, desired);
    if (snap) camera.position.copy(desired);
    else camera.position.lerp(desired, 1 - Math.exp(-delta * 6));
    this.world.constrainCamera(cameraTarget, camera.position);
    camera.lookAt(look);
    const boosting = focus.boost > 0 || focus.overdrive > 0;
    const targetFov = (this.mobile ? 62 : 58) + (split ? 2 : Math.min(4, separation * 0.1)) + (boosting && !this.reducedMotion && !this.mobile ? 5 : 0);
    camera.fov = snap ? targetFov : camera.fov + (targetFov - camera.fov) * Math.min(1, delta * 5);
    camera.updateProjectionMatrix();
  }

  private renderFrame(delta: number): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    if (this.splitView) {
      const leftWidth = Math.floor(width / 2);
      const rightWidth = width - leftWidth;
      this.renderer.setScissorTest(true);
      this.renderer.setViewport(0, 0, leftWidth, height);
      this.renderer.setScissor(0, 0, leftWidth, height);
      this.world.updateCameraFade(this.camera.position, delta);
      this.renderer.render(this.world.scene, this.camera);
      this.renderer.setViewport(leftWidth, 0, rightWidth, height);
      this.renderer.setScissor(leftWidth, 0, rightWidth, height);
      this.world.updateCameraFade(this.secondaryCamera.position, delta);
      this.renderer.render(this.world.scene, this.secondaryCamera);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, width, height);
      this.renderer.setScissor(0, 0, width, height);
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, width, height);
      this.world.updateCameraFade(this.camera.position, delta);
      this.renderer.render(this.world.scene, this.camera);
    }
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / (this.splitView ? 2 : 1) / height;
    this.secondaryCamera.aspect = width / 2 / height;
    this.camera.updateProjectionMatrix();
    this.secondaryCamera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private emitSnapshot(): void {
    this.onSnapshot(this.getSnapshot());
  }

  private onShowroomPointerDown = (event: PointerEvent): void => {
    if (this.simulation.phase !== 'menu' || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    void this.audio.unlock();
    this.showroomPointerId = event.pointerId;
    this.showroomPointerX = event.clientX;
    this.showroomPointerY = event.clientY;
    this.showroomLastInteraction = this.elapsedVisual;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private onShowroomPointerMove = (event: PointerEvent): void => {
    if (this.simulation.phase !== 'menu' || event.pointerId !== this.showroomPointerId) return;
    const deltaX = event.clientX - this.showroomPointerX;
    const deltaY = event.clientY - this.showroomPointerY;
    this.showroomPointerX = event.clientX;
    this.showroomPointerY = event.clientY;
    this.showroomYaw -= deltaX * 0.008;
    this.showroomElevation = THREE.MathUtils.clamp(this.showroomElevation + deltaY * 0.005, 0.06, 1.15);
    this.showroomLastInteraction = this.elapsedVisual;
    event.preventDefault();
  };

  private onShowroomPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.showroomPointerId) return;
    this.showroomPointerId = null;
    this.showroomLastInteraction = this.elapsedVisual;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
  };

  private onShowroomWheel = (event: WheelEvent): void => {
    if (this.simulation.phase !== 'menu') return;
    this.showroomRadius = THREE.MathUtils.clamp(this.showroomRadius + event.deltaY * 0.003, 2.4, 6.4);
    this.showroomLastInteraction = this.elapsedVisual;
    event.preventDefault();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') event.preventDefault();
    if (event.code === 'Escape' || event.code === 'KeyP') this.togglePause();
    if (event.code === 'KeyM') this.toggleMute();
    if (this.simulation.phase !== 'racing') return;

    const digitMatch = /^(Digit|Numpad)([0-9])$/.exec(event.code);
    if (digitMatch) {
      const playerIndex: PlayerIndex = digitMatch[1] === 'Numpad' && this.simulation.playerCount === 2 ? 1 : 0;
      this.inputDigit(playerIndex, Number(digitMatch[2]));
      event.preventDefault();
      return;
    }
    if ((event.code === 'Enter' || event.code === 'NumpadEnter') && !event.repeat) {
      const playerIndex: PlayerIndex = event.code === 'NumpadEnter' && this.simulation.playerCount === 2 ? 1 : 0;
      this.submitAnswer(playerIndex);
      event.preventDefault();
      return;
    }
    if (event.code === 'Backspace' || event.code === 'Delete') {
      const playerIndex: PlayerIndex = event.code === 'Delete' && this.simulation.playerCount === 2 ? 1 : 0;
      this.backspace(playerIndex);
      event.preventDefault();
      return;
    }
    if (event.code === 'NumpadDecimal') {
      this.clearInput(this.simulation.playerCount === 2 ? 1 : 0);
      event.preventDefault();
    }
  };

  private onBlur = (): void => {
    this.showroomPointerId = null;
    if (document.hidden && (this.simulation.phase === 'racing' || this.simulation.phase === 'countdown')) this.togglePause();
  };

  private onVisibility = (): void => {
    this.onBlur();
  };

  private installDiagnostics(): void {
    const target = window as unknown as Record<string, unknown>;
    const diagnostics: Record<string, unknown> = {
      renderer: this.renderer.info,
      physics: { engine: 'custom-track-autopilot', timestep: FIXED_DT, bodies: this.simulation.playerCount, colliders: this.simulation.playerCount, sensors: this.simulation.playerCount * 2, ccdBodies: 0 },
      audio: this.audio.getDiagnostics(),
    };
    Object.defineProperty(diagnostics, 'state', {
      enumerable: true,
      get: () => {
        const snapshot = this.getSnapshot();
        const player = this.simulation.player;
        const position = this.world.track.getFrame(player.distance, player.lane).position;
        return {
          ...snapshot,
          frame: this.frame,
          fps: this.fps,
          score: snapshot.correctCount,
          complete: snapshot.phase === 'finished',
          fail: false,
          playerPosition: { x: position.x, y: position.y, z: position.z },
          playerDistance: player.distance,
          autoOnly: true,
          audio: this.audio.getDiagnostics(),
          dpr: this.renderer.getPixelRatio(),
          postPasses: 0,
          assets: this.assetDiagnostics,
        };
      },
    });
    Object.defineProperty(diagnostics, 'cameraRig', {
      enumerable: true,
      get: () => {
        const width = Math.max(1, this.container.clientWidth);
        const height = Math.max(1, this.container.clientHeight);
        const viewWidth = this.splitView ? width / 2 : width;
        const racers = [this.simulation.getPlayerRacer(0)];
        if (this.simulation.playerCount === 2) racers.push(this.simulation.getPlayerRacer(1));
        const vehicles = racers.map((racer) => {
          const camera = this.splitView && racer.playerIndex === 1 ? this.secondaryCamera : this.camera;
          const position = this.world.track.getFrame(racer.distance, racer.lane).position;
          position.y += racer.airHeight + 0.8;
          const projected = position.project(camera);
          return {
            playerIndex: racer.playerIndex,
            x: (this.splitView && racer.playerIndex === 1 ? viewWidth : 0) + (projected.x + 1) * 0.5 * viewWidth,
            y: (1 - projected.y) * 0.5 * height,
            ndcX: projected.x,
            ndcY: projected.y,
          };
        });
        return {
          mode: this.splitView ? 'split' : 'shared',
          separation: this.cameraSeparation,
          primary: { aspect: this.camera.aspect, fov: this.camera.fov, position: this.camera.position.toArray() },
          secondary: { aspect: this.secondaryCamera.aspect, fov: this.secondaryCamera.fov, position: this.secondaryCamera.position.toArray() },
          vehicles,
        };
      },
    });
    Object.defineProperty(diagnostics, 'showroom', {
      enumerable: true,
      get: () => ({
        yaw: this.showroomYaw,
        elevation: this.showroomElevation,
        radius: this.showroomRadius,
        dragging: this.showroomPointerId !== null,
        selectedKart: this.simulation.selectedKart,
        stageVisible: this.showroomStage.visible,
        visibleKarts: [...this.visuals.values()].filter((visual) => visual.root.visible).length,
      }),
    });
    target.__THREE_GAME_DIAGNOSTICS__ = diagnostics;
    target.__THREE_GAME_TEST_HOOKS__ = {
      seed: (seed: number) => {
        this.random = createSeededRandom(seed);
        this.simulation.setRandom(this.random);
      },
      setState: async (name: string) => {
        await this.assetsReady;
        const supported = ['menu', 'active-play', 'boost', 'paused', 'finished', 'harbor', 'cliff', 'cave', 'bridge', 'airborne', 'obstacle', 'shielded-obstacle'];
        if (!supported.includes(name)) throw new Error(`Unknown test state: ${name}`);
        if (name === 'menu') {
          this.simulation.phase = 'menu';
          this.simulation.resetGrid();
          this.resetShowroom(false);
        } else if (name === 'paused') {
          this.simulation.startNow();
          this.simulation.togglePause();
        } else if (name === 'finished') {
          this.simulation.startNow();
          for (const [index, spec] of KART_SPECS.entries()) {
            if (!this.simulation.hasRacer(spec.id)) continue;
            const racer = this.simulation.getRacer(spec.id);
            racer.distance = this.world.track.length * TOTAL_LAPS - 0.15 - index * 0.2;
            racer.speed = 28;
          }
          for (let i = 0; i < 120 && this.simulation.phase !== 'finished'; i += 1) this.simulation.update(FIXED_DT);
        } else {
          this.simulation.startNow();
          const progress = name === 'harbor' ? 0.22 : name === 'cliff' ? 0.49 : name === 'cave' ? 0.586 : name === 'bridge' ? 0.81 : name === 'airborne' ? 0.87 : 0.055;
          this.simulation.player.distance = this.world.track.length * progress;
          this.simulation.player.lastProgress = progress - 0.004;
          this.simulation.player.speed = 22;
          for (const [index, spec] of KART_SPECS.entries()) {
            if (!this.simulation.hasRacer(spec.id)) continue;
            const racer = this.simulation.getRacer(spec.id);
            if (racer.id === this.simulation.selectedKart) continue;
            racer.distance = this.simulation.player.distance + 4 - index * 2.2;
            racer.speed = 20 + index * 0.3;
          }
          if (name === 'boost') {
            this.simulation.player.boost = 8;
            this.simulation.energy = 75;
          }
          if (name === 'obstacle' || name === 'shielded-obstacle') {
            const obstacle = TRACK_OBSTACLES[0];
            this.simulation.player.distance = obstacle.at * this.world.track.length - 0.55;
            this.simulation.player.lane = obstacle.lane;
            this.simulation.player.targetLane = obstacle.lane;
            this.simulation.player.speed = 24;
            if (name === 'shielded-obstacle') this.simulation.player.shield = 4;
          }
          if (name === 'airborne') {
            this.simulation.player.airHeight = 2.2;
            this.simulation.player.airVelocity = 1.2;
            this.simulation.player.landingBoostArmed = true;
          }
        }
        this.updateTransforms(0);
        this.updateCamera(1);
        this.emitSnapshot();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => { this.screenshotPaused = paused; },
      setReducedMotion: (reduced: boolean) => { this.reducedMotion = reduced; },
      hideDebugUi: () => undefined,
      auditCamera: () => {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        return {
          camera: this.camera.position.toArray(),
          removedRoadBlockers: [...this.world.removedRoadBlockers],
          hits: raycaster.intersectObjects(this.world.scene.children, true)
            .filter((hit) => hit.object instanceof THREE.Mesh)
            .slice(0, 8)
            .map((hit) => {
              const object = hit.object as THREE.Mesh;
              const material = Array.isArray(object.material) ? object.material[0] : object.material;
              let instanceMatrix: number[] | null = null;
              if (object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
                const matrix = new THREE.Matrix4();
                object.getMatrixAt(hit.instanceId, matrix);
                instanceMatrix = matrix.elements;
              }
              return {
                name: object.name,
                type: object.type,
                parent: object.parent?.name ?? '',
                distance: hit.distance,
                point: hit.point.toArray(),
                instanceId: hit.instanceId ?? null,
                instanceMatrix,
                color: material && 'color' in material && material.color instanceof THREE.Color ? material.color.getHexString() : null,
              };
            }),
        };
      },
      setPlayerCount: (count: 1 | 2) => {
        this.simulation.setPlayerCount(count);
        this.updateTransforms(0);
        this.updateCamera(1);
        this.emitSnapshot();
      },
      setCameraGap: (gap: number) => {
        if (this.simulation.playerCount !== 2) return;
        const primary = this.simulation.getPlayerRacer(0);
        const secondary = this.simulation.getPlayerRacer(1);
        secondary.distance = Math.max(0, primary.distance - Math.max(0, gap));
        secondary.speed = primary.speed;
        secondary.lastProgress = ((secondary.distance % this.world.track.length) + this.world.track.length) % this.world.track.length / this.world.track.length;
        this.updateTransforms(0);
        this.updateCamera(0);
        this.emitSnapshot();
      },
      answerCorrect: (playerIndex: PlayerIndex = 0) => {
        const question = this.simulation.getSnapshot().players[playerIndex]?.question;
        if (question) this.answer(question.answer, playerIndex);
      },
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.removeEventListener('pointerdown', this.onShowroomPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onShowroomPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onShowroomPointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onShowroomPointerUp);
    this.renderer.domElement.removeEventListener('lostpointercapture', this.onShowroomPointerUp);
    this.renderer.domElement.removeEventListener('wheel', this.onShowroomWheel);
    this.audio.dispose();
    this.world.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    delete (window as unknown as Record<string, unknown>).__THREE_GAME_DIAGNOSTICS__;
    delete (window as unknown as Record<string, unknown>).__THREE_GAME_TEST_HOOKS__;
  }
}
