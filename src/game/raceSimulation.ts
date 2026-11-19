import { AI_BASE_SPEED, KART_SPECS, LANE_CANDIDATES, MAX_SPEED, POWER_UP_LABELS, QUESTION_INTERVAL, TOTAL_LAPS } from './config';
import { createMathQuestion } from './math';
import { SECTION_CHALLENGES, TRACK_OBSTACLES, type SectionChallenge, type Track } from './track';
import type { GamePhase, GameSnapshot, IMathQuestion, KartId, PowerUpKind, TrackSectionId } from './types';

export type RaceEvent = 'correct' | 'wrong' | 'boost' | 'impact' | 'finish' | 'countdown' | 'land' | 'telegraph' | 'drift';
type StoredPowerUp = Exclude<PowerUpKind, null>;

export interface RacerState {
  id: KartId;
  distance: number;
  lane: number;
  speed: number;
  lateralSpeed: number;
  targetLane: number;
  boost: number;
  shield: number;
  overdrive: number;
  routeBoost: number;
  shortcut: number;
  item: StoredPowerUp | null;
  itemTimer: number;
  collisionCooldown: number;
  impactSlow: number;
  decisionTimer: number;
  drift: number;
  driftDirection: number;
  airHeight: number;
  airVelocity: number;
  lastProgress: number;
  landingBoostArmed: boolean;
  autoStatus: string;
  telegraph: number;
  telegraphKind: StoredPowerUp | null;
  nextBoostAt: number;
  finished: boolean;
  finishTime: number | null;
}

export class RaceSimulation {
  phase: GamePhase = 'menu';
  selectedKart: KartId = 'comet';
  elapsed = 0;
  countdown = 3;
  correctCount = 0;
  streak = 0;
  bestStreak = 0;
  energy = 0;
  overtakeCount = 0;
  obstacleHits = 0;
  question: IMathQuestion | null = null;
  questionFeedback: 'correct' | 'wrong' | null = null;
  eventLabel = '';
  rivalAlert = '';
  loadedModels: KartId[] = [];
  loadedLandmarks: string[] = [];
  routeRewards: TrackSectionId[] = [];
  muted = false;
  private racers: RacerState[] = [];
  private nextQuestionIn = 1.2;
  private questionVisibleFor = 0;
  private questionId = 0;
  private countdownMark = 4;
  private driftSoundCooldown = 0;
  private rivalAlertTimer = 0;
  private previousPlayerPosition = 3;
  private readonly challenged = new Set<string>();
  private random: () => number;

  constructor(
    private readonly track: Track,
    random: () => number,
    private readonly emit: (event: RaceEvent) => void,
  ) {
    this.random = random;
    this.resetGrid();
  }

  setRandom(random: () => number): void {
    this.random = random;
  }

  selectKart(id: KartId): void {
    if (this.phase !== 'menu') return;
    this.selectedKart = id;
    this.resetGrid();
  }

  resetGrid(): void {
    const others = KART_SPECS.filter((spec) => spec.id !== this.selectedKart).slice(0, 4);
    const ordered = [...others.slice(0, 2), KART_SPECS.find((spec) => spec.id === this.selectedKart)!, ...others.slice(2)];
    this.racers = ordered.map((spec, index) => ({
      id: spec.id,
      distance: index < 2 ? 0 : index === 2 ? -3 : -6,
      lane: [-2.1, 2.1, 0, -2.1, 2.1][index],
      speed: 0,
      lateralSpeed: 0,
      targetLane: [-2.1, 2.1, 0, -2.1, 2.1][index],
      boost: 0,
      shield: 0,
      overdrive: 0,
      routeBoost: 0,
      shortcut: 0,
      item: null,
      itemTimer: 0,
      collisionCooldown: 0,
      impactSlow: 0,
      decisionTimer: index * 0.035,
      drift: 0,
      driftDirection: 0,
      airHeight: 0,
      airVelocity: 0,
      lastProgress: 0,
      landingBoostArmed: false,
      autoStatus: '自动驾驶待命',
      telegraph: 0,
      telegraphKind: null,
      nextBoostAt: 8 + index * 1.8,
      finished: false,
      finishTime: null,
    }));
    this.previousPlayerPosition = 3;
  }

  restart(): void {
    this.phase = 'countdown';
    this.elapsed = 0;
    this.countdown = 3;
    this.countdownMark = 4;
    this.driftSoundCooldown = 0;
    this.correctCount = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.energy = 0;
    this.overtakeCount = 0;
    this.obstacleHits = 0;
    this.routeRewards = [];
    this.question = null;
    this.questionFeedback = null;
    this.nextQuestionIn = 1.2;
    this.questionVisibleFor = 0;
    this.eventLabel = '两圈 · 五段旅程';
    this.rivalAlert = '';
    this.rivalAlertTimer = 0;
    this.challenged.clear();
    this.resetGrid();
  }

  startNow(): void {
    this.restart();
    this.phase = 'racing';
    this.countdown = 0;
    this.createQuestion();
  }

  togglePause(): void {
    if (this.phase === 'racing' || this.phase === 'countdown') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'racing';
  }

  answer(optionIndex: number): void {
    const player = this.player;
    if (this.phase !== 'racing' || !this.question || this.question.selectedIndex !== null || player.finished) return;
    const question = this.question;
    const correct = optionIndex === question.correctIndex;
    question.selectedIndex = optionIndex;
    question.isCorrect = correct;
    this.questionFeedback = correct ? 'correct' : 'wrong';
    this.questionVisibleFor = 0;
    this.nextQuestionIn = correct ? 2 : 2.6;
    if (correct) {
      this.correctCount += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      player.boost = Math.max(player.boost, 2.25);
      player.speed = Math.min(player.speed + 3.4, 31);
      this.energy = Math.min(100, this.energy + 26);
      this.eventLabel = '答对了 · 即时喷射';
      if (this.energy >= 100) {
        this.energy -= 100;
        this.grantItem(player, 'overdrive');
        this.eventLabel = '连对满能 · 超级涡轮已装填';
      } else if (this.streak % 3 === 0 && !player.item) {
        this.grantItem(player, this.hasCloseTraffic(player) ? 'shield' : 'nitro');
        this.eventLabel = `连对 ${this.streak} · 自动道具已装填`;
      }
      if (question.challenge) this.applyChallengeReward(question.challenge);
      this.emit('correct');
      this.emit('boost');
    } else {
      this.streak = 0;
      this.eventLabel = `正确答案 ${question.options[question.correctIndex]} · 本次无加速`;
      this.emit('wrong');
    }
  }

  private grantItem(racer: RacerState, item: StoredPowerUp): void {
    racer.item = item;
    racer.itemTimer = 0;
  }

  private applyChallengeReward(section: TrackSectionId): void {
    const player = this.player;
    if (!this.routeRewards.includes(section)) this.routeRewards.push(section);
    if (section === 'harbor') {
      player.routeBoost = Math.max(player.routeBoost, 5.5);
      player.shortcut = Math.max(player.shortcut, 5.5);
      this.eventLabel = '港口加速线开启 · 自动切线';
    } else if (section === 'cliff') {
      player.routeBoost = Math.max(player.routeBoost, 5.5);
      player.shortcut = Math.max(player.shortcut, 6.5);
      this.eventLabel = '内侧捷径解锁 · 漂移超车';
    } else if (section === 'cave') {
      player.routeBoost = Math.max(player.routeBoost, 6.5);
      player.shortcut = Math.max(player.shortcut, 6.5);
      player.shield = Math.max(player.shield, 5);
      this.eventLabel = '水晶高速线开启 · 护盾同步';
    } else {
      player.landingBoostArmed = true;
      this.eventLabel = '落地冲刺已武装 · 瞄准跳台';
    }
  }

  createQuestion(challenge: SectionChallenge | null = null): void {
    this.questionId += 1;
    this.question = createMathQuestion(this.random, this.questionId);
    if (challenge) {
      this.question.challenge = challenge.id;
      this.question.rewardLabel = challenge.rewardLabel;
      const lap = Math.max(0, Math.floor(this.player.distance / this.track.length));
      this.challenged.add(`${lap}:${challenge.id}`);
    }
    this.questionFeedback = null;
    this.questionVisibleFor = 0;
  }

  update(delta: number): void {
    if (this.phase === 'paused' || this.phase === 'menu' || this.phase === 'finished') return;
    if (this.phase === 'countdown') {
      this.countdown -= delta;
      const mark = Math.ceil(this.countdown);
      if (mark < this.countdownMark && mark > 0) {
        this.countdownMark = mark;
        this.eventLabel = String(mark);
        this.emit('countdown');
      }
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.countdown = 0;
        this.eventLabel = '自动驾驶接管 · 出发';
        this.emit('boost');
      }
      return;
    }

    this.elapsed += delta;
    this.driftSoundCooldown = Math.max(0, this.driftSoundCooldown - delta);
    this.rivalAlertTimer = Math.max(0, this.rivalAlertTimer - delta);
    if (this.rivalAlertTimer === 0) this.rivalAlert = '';
    this.updateQuestion(delta);
    for (let index = 0; index < this.racers.length; index += 1) {
      const racer = this.racers[index];
      racer.boost = Math.max(0, racer.boost - delta);
      racer.shield = Math.max(0, racer.shield - delta);
      racer.overdrive = Math.max(0, racer.overdrive - delta);
      racer.routeBoost = Math.max(0, racer.routeBoost - delta);
      racer.shortcut = Math.max(0, racer.shortcut - delta);
      racer.collisionCooldown = Math.max(0, racer.collisionCooldown - delta);
      racer.impactSlow = Math.max(0, racer.impactSlow - delta);
      if (racer.finished) {
        racer.speed += (8 - racer.speed) * Math.min(1, delta * 2);
        racer.distance += racer.speed * delta;
        continue;
      }
      if (racer.id !== this.selectedKart) this.updateAiPowerUp(racer, delta);
      this.updateAutomaticItem(racer, delta);
      const previousDrift = racer.drift;
      this.updateDrive(racer, index, delta);
      if (racer.id === this.selectedKart && this.driftSoundCooldown <= 0 && previousDrift < 0.12 && racer.drift >= 0.12) {
        this.driftSoundCooldown = 2.8;
        this.emit('drift');
      }
      racer.distance += racer.speed * delta;
      this.updateJump(racer, delta);
      const finishDistance = this.track.length * TOTAL_LAPS;
      if (racer.distance >= finishDistance) {
        racer.finished = true;
        racer.finishTime = this.elapsed;
        this.eventLabel = racer.id === this.selectedKart ? `第 ${this.getPosition(racer.id)} 名冲线` : `${this.getName(racer.id)} 已冲线`;
        if (racer.id === this.selectedKart) this.emit('finish');
      }
    }
    this.resolveCollisions();
    this.resolveObstacleCollisions();
    const position = this.getPosition(this.selectedKart);
    if (position < this.previousPlayerPosition) {
      this.overtakeCount += this.previousPlayerPosition - position;
      if (this.player.collisionCooldown <= 0) this.eventLabel = `超越成功 · 当前第 ${position} 名`;
    }
    this.previousPlayerPosition = position;
    if (this.racers.every((racer) => racer.finished)) {
      this.phase = 'finished';
      this.eventLabel = '比赛完成';
    }
  }

  private updateDrive(racer: RacerState, index: number, delta: number): void {
    racer.decisionTimer -= delta;
    if (racer.decisionTimer <= 0) {
      this.chooseLane(racer);
      racer.decisionTimer = 0.16 + this.random() * 0.08;
    }
    const curvature = this.track.getCurvature(racer.distance + Math.min(10, racer.speed * 0.3));
    const driftTarget = Math.abs(curvature) > 0.028 && racer.speed > 14 ? Math.min(1, Math.abs(curvature) * 8) : 0;
    racer.drift += (driftTarget - racer.drift) * Math.min(1, delta * (driftTarget > racer.drift ? 5 : 8));
    racer.driftDirection = curvature === 0 ? 0 : Math.sign(curvature);

    const lap = Math.max(0, Math.floor(racer.distance / this.track.length));
    const isPlayer = racer.id === this.selectedKart;
    let targetSpeed = isPlayer ? MAX_SPEED : AI_BASE_SPEED + index * 0.22 + lap * 0.42;
    const gap = this.player.distance - racer.distance;
    if (!isPlayer) targetSpeed *= gap > 34 ? 1.09 : gap < -32 ? 0.965 : 1;
    else {
      const bestOpponent = Math.max(...this.racers.filter((item) => item.id !== this.selectedKart).map((item) => item.distance));
      if (racer.distance - bestOpponent > 40) targetSpeed *= 0.975;
      if (bestOpponent - racer.distance > 36) targetSpeed *= 1.035;
    }
    targetSpeed -= Math.min(4.8, Math.abs(curvature) * 17);
    if (racer.boost > 0) targetSpeed = Math.max(targetSpeed, 29.5);
    if (racer.routeBoost > 0) targetSpeed = Math.max(targetSpeed, 31);
    if (racer.overdrive > 0) targetSpeed = Math.max(targetSpeed, 34);
    targetSpeed = Math.min(targetSpeed, isPlayer ? 31 : 31.5);
    if (racer.impactSlow > 0) targetSpeed = Math.min(targetSpeed, 10.5 + (1 - racer.impactSlow / 0.9) * 5);

    let closestAhead: RacerState | null = null;
    let closestDistance = Infinity;
    for (const other of this.racers) {
      if (other === racer || other.finished) continue;
      const ahead = other.distance - racer.distance;
      if (ahead > 0 && ahead < closestDistance && Math.abs(other.lane - racer.lane) < 1.35) {
        closestAhead = other;
        closestDistance = ahead;
      }
    }
    if (racer.impactSlow > 0) {
      racer.autoStatus = '碰撞减速 · 自动回到行车线';
    } else if (closestAhead && closestDistance < 5.2 && racer.boost <= 0 && racer.routeBoost <= 0) {
      targetSpeed = Math.min(targetSpeed, closestAhead.speed * 0.985);
      racer.autoStatus = '自动跟车 · 正在找空位';
    } else if (racer.shortcut > 0) {
      racer.autoStatus = '奖励路线 · 自动切线';
    } else if (racer.drift > 0.35) {
      racer.autoStatus = '弯道漂移 · 出弯回正';
    } else if ((racer.boost > 0 || racer.overdrive > 0) && Math.abs(racer.targetLane - racer.lane) > 0.25) {
      racer.autoStatus = '加速超车 · 侧向找空位';
    } else {
      racer.autoStatus = '自动走线 · 路障避让';
    }

    const response = racer.overdrive > 0 || racer.boost > 0 ? 3.1 : 1.55;
    racer.speed += (targetSpeed - racer.speed) * Math.min(1, delta * response);
    racer.speed = Math.max(7, Math.min(34, racer.speed));
    const lateralTarget = Math.max(-4.8, Math.min(4.8, (racer.targetLane - racer.lane) * 3.4));
    racer.lateralSpeed += (lateralTarget - racer.lateralSpeed) * Math.min(1, delta * 6);
    racer.lane += racer.lateralSpeed * delta;
    racer.lane = Math.max(-this.track.width / 2 + 0.75, Math.min(this.track.width / 2 - 0.75, racer.lane));
  }

  private chooseLane(racer: RacerState): void {
    const curvature = this.track.getCurvature(racer.distance + 7);
    let preferred = -Math.sign(curvature) * 2.1;
    if (racer.shortcut > 0) {
      const section = this.track.getSection(racer.distance).id;
      preferred = section === 'harbor' ? 3.6 : -3.6;
    }
    let bestLane = racer.targetLane;
    let bestScore = Infinity;
    for (const candidate of LANE_CANDIDATES) {
      let score = Math.abs(candidate - preferred) * 0.65 + Math.abs(candidate - racer.lane) * 0.16;
      for (const other of this.racers) {
        if (other === racer || other.finished) continue;
        const ahead = other.distance - racer.distance;
        const lateral = Math.abs(other.lane - candidate);
        if (lateral > 1.6) continue;
        if (ahead > -2.8 && ahead < 3.5) score += 110;
        else if (ahead >= 3.5 && ahead < 15) score += (15 - ahead) * (racer.boost > 0 || racer.routeBoost > 0 ? 2.5 : 1.25);
        else if (ahead <= -2.8 && ahead > -7 && Math.abs(other.lateralSpeed) > 1) score += 8;
      }
      const lap = Math.max(0, Math.floor(racer.distance / this.track.length));
      for (const obstacle of TRACK_OBSTACLES) {
        const ahead = lap * this.track.length + obstacle.at * this.track.length - racer.distance;
        if (ahead > -1 && ahead < 15 && Math.abs(obstacle.lane - candidate) < 1.45) score += 95;
      }
      if (score < bestScore) {
        bestScore = score;
        bestLane = candidate;
      }
    }
    racer.targetLane = bestLane;
  }

  private updateAutomaticItem(racer: RacerState, delta: number): void {
    if (!racer.item) return;
    racer.itemTimer += delta;
    const curvature = Math.abs(this.track.getCurvature(racer.distance + 6));
    const shouldUse = racer.item === 'shield'
      ? this.hasCloseTraffic(racer) || racer.itemTimer > 2.2
      : racer.item === 'overdrive'
        ? curvature < 0.12 || racer.itemTimer > 1.2
        : curvature < 0.1 || racer.itemTimer > 1.8;
    if (!shouldUse) return;
    const item = racer.item;
    racer.item = null;
    if (item === 'nitro') racer.boost = Math.max(racer.boost, 3.8);
    if (item === 'shield') racer.shield = Math.max(racer.shield, 6.5);
    if (item === 'overdrive') {
      racer.overdrive = Math.max(racer.overdrive, 5);
      racer.boost = Math.max(racer.boost, 5);
    }
    if (racer.id === this.selectedKart) {
      this.eventLabel = `自动使用 · ${POWER_UP_LABELS[item]}`;
      this.emit('boost');
    }
  }

  private hasCloseTraffic(racer: RacerState): boolean {
    return this.racers.some((other) => other !== racer && Math.abs(other.distance - racer.distance) < 6 && Math.abs(other.lane - racer.lane) < 2.2);
  }

  private updateAiPowerUp(racer: RacerState, delta: number): void {
    if (racer.telegraph > 0) {
      racer.telegraph = Math.max(0, racer.telegraph - delta);
      if (racer.telegraph === 0 && racer.telegraphKind) {
        const item = racer.telegraphKind;
        if (item === 'shield') racer.shield = Math.max(racer.shield, 4.5);
        else {
          racer.boost = Math.max(racer.boost, item === 'overdrive' ? 3.8 : 2.6);
          if (item === 'overdrive') racer.overdrive = Math.max(racer.overdrive, 3.8);
        }
        racer.telegraphKind = null;
        this.rivalAlert = `${this.getName(racer.id)} · ${POWER_UP_LABELS[item]}启动`;
        this.rivalAlertTimer = 1.8;
      }
      return;
    }
    if (this.elapsed < racer.nextBoostAt) return;
    const roll = this.random();
    const item: StoredPowerUp = roll < 0.58 ? 'nitro' : roll < 0.82 ? 'shield' : 'overdrive';
    racer.telegraph = 1.4;
    racer.telegraphKind = item;
    racer.nextBoostAt = this.elapsed + 12 + this.random() * 5;
    this.rivalAlert = `预告 · ${this.getName(racer.id)}准备${POWER_UP_LABELS[item]}`;
    this.rivalAlertTimer = 2.2;
    if (Math.abs(racer.distance - this.player.distance) < 40) this.emit('telegraph');
  }

  private updateJump(racer: RacerState, delta: number): void {
    const progress = this.track.progress(racer.distance);
    if (progress >= 0.885 && progress < 0.9 && racer.lastProgress < 0.885 && racer.airHeight <= 0) {
      racer.airVelocity = 5.4;
      racer.airHeight = 0.02;
    }
    if (racer.airHeight > 0 || racer.airVelocity > 0) {
      racer.airHeight += racer.airVelocity * delta;
      racer.airVelocity -= 12.5 * delta;
      if (racer.airHeight <= 0 && racer.airVelocity < 0) {
        racer.airHeight = 0;
        racer.airVelocity = 0;
        if (racer.id === this.selectedKart) {
          if (racer.landingBoostArmed) {
            racer.landingBoostArmed = false;
            racer.overdrive = Math.max(racer.overdrive, 4.5);
            racer.boost = Math.max(racer.boost, 4.5);
            this.eventLabel = '完美落地 · 冲刺启动';
            this.emit('boost');
          } else {
            this.eventLabel = '平稳落地 · 自动回正';
          }
          this.emit('land');
        }
      }
    }
    racer.lastProgress = progress;
  }

  private resolveCollisions(): void {
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < this.racers.length; i += 1) {
        for (let j = i + 1; j < this.racers.length; j += 1) {
          const a = this.racers[i];
          const b = this.racers[j];
          if (a.finished || b.finished) continue;
          const longitudinal = a.distance - b.distance;
          const lateral = a.lane - b.lane;
          if (Math.abs(longitudinal) > 2.15 || Math.abs(lateral) > 1.3) continue;
          const direction = lateral === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(lateral);
          const push = (1.3 - Math.abs(lateral)) * 0.52 + 0.015;
          a.lane += direction * push;
          b.lane -= direction * push;
          a.lane = Math.max(-5.25, Math.min(5.25, a.lane));
          b.lane = Math.max(-5.25, Math.min(5.25, b.lane));
          if (Math.abs(longitudinal) < 1.7) {
            const follower = longitudinal < 0 ? a : b;
            follower.distance -= (1.7 - Math.abs(longitudinal)) * 0.25;
            if (follower.shield <= 0) follower.speed *= 0.992;
          }
          if (a.collisionCooldown <= 0 && b.collisionCooldown <= 0 && (a.id === this.selectedKart || b.id === this.selectedKart)) this.emit('impact');
          a.collisionCooldown = 0.4;
          b.collisionCooldown = 0.4;
        }
      }
    }
  }

  private resolveObstacleCollisions(): void {
    for (const racer of this.racers) {
      if (racer.finished || racer.collisionCooldown > 0 || racer.airHeight > 0.65) continue;
      const lap = Math.floor(racer.distance / this.track.length);
      if (lap < 0 || lap >= TOTAL_LAPS) continue;
      for (const [index, obstacle] of TRACK_OBSTACLES.entries()) {
        const obstacleDistance = lap * this.track.length + obstacle.at * this.track.length;
        if (Math.abs(racer.distance - obstacleDistance) > 1.35 || Math.abs(racer.lane - obstacle.lane) > 1.45) continue;
        racer.collisionCooldown = 1;
        const direction = racer.lane === obstacle.lane ? (index % 2 === 0 ? 1 : -1) : Math.sign(racer.lane - obstacle.lane);
        racer.lane = Math.max(-5.25, Math.min(5.25, racer.lane + direction * 0.45));
        if (racer.shield > 0) {
          racer.shield = Math.max(0, racer.shield - 1.25);
          if (racer.id === this.selectedKart) this.eventLabel = '护盾抵挡路障 · 速度保持';
        } else {
          racer.speed = Math.max(7, racer.speed * 0.58);
          racer.impactSlow = Math.max(racer.impactSlow, 0.9);
          racer.autoStatus = '碰撞减速 · 自动回到行车线';
          if (racer.id === this.selectedKart) {
            this.obstacleHits += 1;
            this.eventLabel = '碰到路障 · 短暂减速';
          }
        }
        if (racer.id === this.selectedKart) this.emit('impact');
        break;
      }
    }
  }

  private updateQuestion(delta: number): void {
    if (this.player.finished) return;
    const challenge = this.getUpcomingChallenge();
    if (challenge && (!this.question || this.question.selectedIndex === null)) {
      if (this.question?.challenge !== challenge.id) this.createQuestion(challenge);
      return;
    }
    if (this.question && this.question.selectedIndex === null) {
      this.questionVisibleFor += delta;
      if (this.questionVisibleFor >= QUESTION_INTERVAL) this.createQuestion();
      return;
    }
    this.nextQuestionIn -= delta;
    if (this.nextQuestionIn <= 0) {
      this.createQuestion();
      this.nextQuestionIn = QUESTION_INTERVAL;
    } else if (this.question?.selectedIndex !== null && this.nextQuestionIn < 1.25) {
      this.question = null;
      this.questionFeedback = null;
    }
  }

  private getUpcomingChallenge(): SectionChallenge | null {
    const lap = Math.max(0, Math.floor(this.player.distance / this.track.length));
    const progress = this.track.progress(this.player.distance);
    for (const challenge of SECTION_CHALLENGES) {
      if (this.challenged.has(`${lap}:${challenge.id}`)) continue;
      if (progress >= challenge.at - 0.018 && progress <= challenge.at + 0.025) return challenge;
    }
    return null;
  }

  get player(): RacerState {
    return this.racers.find((racer) => racer.id === this.selectedKart)!;
  }

  hasRacer(id: KartId): boolean {
    return this.racers.some((racer) => racer.id === id);
  }

  getRacer(id: KartId): RacerState {
    return this.racers.find((racer) => racer.id === id)!;
  }

  getPosition(id: KartId): number {
    return this.getOrdered().findIndex((racer) => racer.id === id) + 1;
  }

  private getOrdered(): RacerState[] {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance;
    });
  }

  get powerUp(): PowerUpKind {
    if (this.player.overdrive > 0) return 'overdrive';
    if (this.player.boost > 0 || this.player.routeBoost > 0) return 'nitro';
    if (this.player.shield > 0) return 'shield';
    return null;
  }

  getName(id: KartId): string {
    return KART_SPECS.find((spec) => spec.id === id)!.name;
  }

  getSnapshot(): GameSnapshot {
    const ordered = this.getOrdered();
    const section = this.track.getSection(this.player.distance);
    return {
      phase: this.phase,
      selectedKart: this.selectedKart,
      racers: this.racers.map((racer) => ({
        id: racer.id,
        name: this.getName(racer.id),
        color: KART_SPECS.find((spec) => spec.id === racer.id)!.color,
        lap: Math.min(TOTAL_LAPS, Math.max(1, Math.floor(Math.max(0, racer.distance) / this.track.length) + 1)),
        totalLaps: TOTAL_LAPS,
        position: ordered.findIndex((item) => item.id === racer.id) + 1,
        speed: racer.speed,
        trackProgress: this.track.progress(racer.distance),
        lane: racer.lane,
        finished: racer.finished,
        finishTime: racer.finishTime,
        isPlayer: racer.id === this.selectedKart,
        boosting: racer.boost > 0 || racer.routeBoost > 0 || racer.overdrive > 0,
        drifting: racer.drift,
        airHeight: racer.airHeight,
        telegraph: racer.telegraph,
      })),
      elapsed: this.elapsed,
      countdown: this.countdown,
      question: this.question ? { ...this.question, options: [...this.question.options] } : null,
      questionFeedback: this.questionFeedback,
      correctCount: this.correctCount,
      streak: this.streak,
      bestStreak: this.bestStreak,
      energy: this.energy,
      powerUp: this.powerUp,
      inventory: this.player.item,
      boostRemaining: Math.max(this.player.boost, this.player.routeBoost),
      shieldRemaining: this.player.shield,
      results: this.phase === 'finished' ? ordered.map((racer, index) => ({
        rank: index + 1,
        id: racer.id,
        name: this.getName(racer.id),
        color: KART_SPECS.find((spec) => spec.id === racer.id)!.color,
        time: racer.finishTime ?? this.elapsed,
        isPlayer: racer.id === this.selectedKart,
      })) : [],
      muted: this.muted,
      loadedModels: [...this.loadedModels],
      loadedLandmarks: [...this.loadedLandmarks],
      eventLabel: this.eventLabel,
      autoStatus: this.player.autoStatus,
      rivalAlert: this.rivalAlert,
      overtakeCount: this.overtakeCount,
      obstacleHits: this.obstacleHits,
      collisionSlowRemaining: this.player.impactSlow,
      sectionId: section.id,
      sectionName: section.name,
      sectionProgress: this.track.getSectionProgress(this.player.distance),
      landingBoostArmed: this.player.landingBoostArmed,
      routeRewards: [...this.routeRewards],
    };
  }
}
