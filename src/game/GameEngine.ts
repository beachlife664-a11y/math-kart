import * as THREE from 'three';
import { GameAudio } from './audio';
import { loadHyperEnvironment, loadHyperKarts, loadHyperLandmarks } from './assets';
import { FIXED_DT, KART_SPECS, TOTAL_LAPS } from './config';
import { TRACK_OBSTACLES } from './track';
import { createProceduralKart, type KartVisual } from './proceduralKarts';
import { RaceSimulation, type RaceEvent } from './raceSimulation';
import { createSeededRandom } from './random';
import type { GameSnapshot, KartId } from './types';
import { VfxSystem } from './vfx';
import { World } from './world';
import { createShowroomStage, SHOWROOM_ORIGIN } from './showroom';

const BASE = `${(import.meta.env.MIAODA_CLIENT_BASE_PATH || '').replace(/\/$/, '')}/`;

export class GameEngine {
  readonly simulation: RaceSimulation;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
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
    this.world = new World(this.renderer, this.mobile, createSeededRandom(84));
    this.world.scene.add(this.showroomStage);
    this.simulation = new RaceSimulation(this.world.track, this.random, (event) => this.handleEvent(event));
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
    this.simulation.restart();
    this.emitSnapshot();
  }

  selectKart(id: KartId): void {
    void this.audio.unlock().then(() => this.audio.play('click'));
    this.simulation.selectKart(id);
    this.resetShowroom(false);
    this.updateTransforms(0);
    this.emitSnapshot();
  }

  resetShowroom(withSound = true): void {
    if (withSound) void this.audio.unlock().then(() => this.audio.play('click'));
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

  answer(index: number): void {
    void this.audio.unlock();
    this.simulation.answer(index);
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
    return this.simulation.getSnapshot();
  }

  private handleEvent(event: RaceEvent): void {
    this.audio.play(event);
    if (event === 'correct' || event === 'boost' || event === 'impact' || event === 'finish' || event === 'land') {
      const player = this.simulation.player;
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
    this.renderer.render(this.world.scene, this.camera);
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
      visual.root.visible = !menu || spec.id === this.simulation.selectedKart;
      if (!visual.root.visible) continue;
      const frame = this.world.track.getFrame(racer.distance, racer.lane);
      visual.root.position.copy(menu ? SHOWROOM_ORIGIN : frame.position);
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
    this.renderer.domElement.style.cursor = this.simulation.phase === 'menu' ? (this.showroomPointerId === null ? 'grab' : 'grabbing') : 'default';
    const frame = this.world.track.getFrame(player.distance, player.lane);
    const cameraFrame = this.world.track.getFrame(player.distance, player.lane * (this.mobile ? 0.25 : 0.35));
    frame.position.y += player.airHeight;
    cameraFrame.position.y += player.airHeight;
    const smoothing = 1 - Math.exp(-delta * 6);
    if (this.simulation.phase === 'menu') {
      if (this.elapsedVisual - this.showroomLastInteraction > 3.5 && !this.reducedMotion) this.showroomYaw += delta * 0.16;
      const angle = this.showroomYaw;
      const backdrop = this.showroomStage.getObjectByName('showroom-backdrop');
      if (backdrop) backdrop.rotation.y = angle;
      const target = SHOWROOM_ORIGIN.clone();
      target.y += 0.84;
      const horizontalRadius = Math.cos(this.showroomElevation) * this.showroomRadius;
      const desired = target.clone().add(new THREE.Vector3(
        Math.sin(angle) * horizontalRadius,
        Math.sin(this.showroomElevation) * this.showroomRadius,
        Math.cos(angle) * horizontalRadius,
      ));
      this.camera.position.lerp(desired, smoothing);
      this.camera.lookAt(target);
      const width = Math.max(1, this.container.clientWidth);
      const height = Math.max(1, this.container.clientHeight);
      this.camera.setViewOffset(width, height, this.mobile ? 0 : -width * 0.18, this.mobile ? height * 0.18 : 0, width, height);
    } else {
      this.camera.clearViewOffset();
      const desired = cameraFrame.position.clone().addScaledVector(cameraFrame.tangent, this.mobile ? -10 : -8.8);
      desired.y += this.mobile ? 5.6 : 4.9;
      desired.y = Math.max(desired.y, frame.position.y + 3.2);
      const look = frame.position.clone().addScaledVector(frame.tangent, this.mobile ? -0.5 : 6);
      look.y += this.mobile ? 0.75 : 0.95;
      const cameraTarget = frame.position.clone();
      cameraTarget.y += 1.1;
      this.world.constrainCamera(cameraTarget, desired);
      this.camera.position.lerp(desired, smoothing);
      this.world.constrainCamera(cameraTarget, this.camera.position);
      this.camera.lookAt(look);
    }
    this.world.updateCameraFade(this.camera.position, delta);
    const targetFov = (this.mobile ? 62 : 58) + ((player.boost > 0 || player.overdrive > 0) && !this.reducedMotion && !this.mobile ? 7 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, delta * 5);
    this.camera.updateProjectionMatrix();
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
    if (event.repeat && /^[1-4]$/.test(event.key)) return;
    if (event.code === 'Space') event.preventDefault();
    if (/^[1-4]$/.test(event.key)) this.answer(Number(event.key) - 1);
    if (event.code === 'Escape' || event.code === 'KeyP') this.togglePause();
    if (event.code === 'KeyM') this.toggleMute();
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
      physics: { engine: 'custom-track-autopilot', timestep: FIXED_DT, bodies: 5, colliders: 5, sensors: 10, ccdBodies: 0 },
      audio: this.audio.getDiagnostics(),
    };
    Object.defineProperty(diagnostics, 'state', {
      enumerable: true,
      get: () => {
        const snapshot = this.simulation.getSnapshot();
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
      answerCorrect: () => {
        const question = this.simulation.question;
        if (question) this.answer(question.correctIndex);
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
