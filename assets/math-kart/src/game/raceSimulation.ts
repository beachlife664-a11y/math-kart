import { KART_SPECS, LANE_CANDIDATES, MAX_SPEED, POWER_UP_LABELS, QUESTION_INTERVAL, TOTAL_LAPS } from './config';
import { createMathQuestion } from './math';
import { SECTION_CHALLENGES, TRACK_OBSTACLES, type SectionChallenge, type Track } from './track';
import type { GamePhase, GameSnapshot, IMathQuestion, IPlayerSnapshot, KartId, PlayerIndex, PowerUpKind, TrackSectionId } from './types';

export type RaceEvent = 'correct' | 'wrong' | 'boost' | 'impact' | 'finish' | 'countdown' | 'land' | 'telegraph' | 'drift';
type StoredPowerUp = Exclude<PowerUpKind, null>;

export interface RacerState {
  id: KartId;
  playerIndex: PlayerIndex;
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

interface PlayerState {
  playerIndex: PlayerIndex;
  kartId: KartId;
  question: IMathQuestion | null;
  answerInput: string;
  questionFeedback: 'correct' | 'wrong' | null;
  correctCount: number;
  streak: number;
  bestStreak: number;
  energy: number;
  overtakeCount: number;
  obstacleHits: number;
  previousPosition: number;
  nextQuestionIn: number;
  questionVisibleFor: number;
  eventLabel: string;
  routeRewards: TrackSectionId[];
}

function createPlayerState(playerIndex: PlayerIndex, kartId: KartId): PlayerState {
  return {
    playerIndex,
    kartId,
    question: null,
    answerInput: '',
    questionFeedback: null,
    correctCount: 0,
    streak: 0,
    bestStreak: 0,
    energy: 0,
    overtakeCount: 0,
    obstacleHits: 0,
    previousPosition: playerIndex + 1,
    nextQuestionIn: 0,
    questionVisibleFor: 0,
    eventLabel: '等待出发',
    routeRewards: [],
  };
}

export class RaceSimulation {
  phase: GamePhase = 'menu';
  playerCount: 1 | 2 = 1;
  selectedKarts: KartId[] = ['comet', 'reef'];
  elapsed = 0;
  countdown = 3;
  eventLabel = '';
  rivalAlert = '';
  loadedModels: KartId[] = [];
  loadedLandmarks: string[] = [];
  muted = false;
  private racers: RacerState[] = [];
  private playerStates: PlayerState[] = [];
  private questionId = 0;
  private countdownMark = 4;
  private driftSoundCooldown = 0;
  private readonly challenged = new Set<string>();
  private random: () => number;

  constructor(
    private readonly track: Track,
    random: () => number,
    private readonly emit: (event: RaceEvent, playerIndex?: PlayerIndex) => void,
  ) {
    this.random = random;
    this.resetGrid();
  }

  setRandom(random: () => number): void {
    this.random = random;
  }

  setPlayerCount(count: 1 | 2): void {
    if (this.phase !== 'menu') return;
    this.playerCount = count;
    if (count === 2 && this.selectedKarts[1] === this.selectedKarts[0]) {
      this.selectedKarts[1] = KART_SPECS.find((spec) => spec.id !== this.selectedKarts[0])!.id;
    }
    this.resetGrid();
  }

  selectKart(id: KartId, playerIndex: PlayerIndex = 0): void {
    if (this.phase !== 'menu' || playerIndex >= this.playerCount) return;
    if (this.selectedKarts.some((kartId, index) => index < this.playerCount && index !== playerIndex && kartId === id)) return;
    this.selectedKarts[playerIndex] = id;
    this.resetGrid();
  }

  resetGrid(): void {
    const activeKarts = this.selectedKarts.slice(0, this.playerCount);
    this.racers = activeKarts.map((id, index) => ({
      id,
      playerIndex: index as PlayerIndex,
      distance: 0,
      lane: this.playerCount === 1 ? 0 : index === 0 ? -2.1 : 2.1,
      speed: 0,
      lateralSpeed: 0,
      targetLane: this.playerCount === 1 ? 0 : index === 0 ? -2.1 : 2.1,
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
      nextBoostAt: Infinity,
      finished: false,
      finishTime: null,
    }));
    this.playerStates = activeKarts.map((id, index) => createPlayerState(index as PlayerIndex, id));
  }

  restart(): void {
    this.phase = 'countdown';
    this.elapsed = 0;
    this.countdown = 3;
    this.countdownMark = 4;
    this.driftSoundCooldown = 0;
    this.questionId = 0;
    this.challenged.clear();
    this.rivalAlert = '';
    this.resetGrid();
    this.eventLabel = this.playerCount === 2 ? '双人对决 · 两圈五段旅程' : '单人挑战 · 两圈五段旅程';
    for (const player of this.playerStates) player.eventLabel = '自动驾驶待命';
  }

  startNow(): void {
    this.restart();
    this.phase = 'racing';
    this.countdown = 0;
    for (const player of this.playerStates) this.createQuestion(player);
  }

  togglePause(): void {
    if (this.phase === 'racing' || this.phase === 'countdown') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'racing';
  }

  inputDigit(playerIndex: PlayerIndex, digit: number): void {
    const player = this.playerStates[playerIndex];
    if (!player || this.phase !== 'racing' || !player.question || player.question.submittedAnswer !== null) return;
    if (!Number.isInteger(digit) || digit < 0 || digit > 9 || player.answerInput.length >= 3) return;
    player.answerInput = `${player.answerInput}${digit}`.slice(0, 3);
  }

  backspace(playerIndex: PlayerIndex): void {
    const player = this.playerStates[playerIndex];
    if (!player || this.phase !== 'racing' || player.question?.submittedAnswer !== null) return;
    player.answerInput = player.answerInput.slice(0, -1);
  }

  clearInput(playerIndex: PlayerIndex): void {
    const player = this.playerStates[playerIndex];
    if (!player || this.phase !== 'racing' || player.question?.submittedAnswer !== null) return;
    player.answerInput = '';
  }

  submitAnswer(playerIndex: PlayerIndex = 0): void {
    const player = this.playerStates[playerIndex];
    if (!player || player.answerInput === '') return;
    this.answer(Number(player.answerInput), playerIndex);
  }

  answer(value: number, playerIndex: PlayerIndex = 0): void {
    const player = this.playerStates[playerIndex];
    if (!player || this.phase !== 'racing' || !player.question || player.question.submittedAnswer !== null) return;
    const racer = this.getPlayerRacer(playerIndex);
    if (racer.finished) return;
    const question = player.question;
    const correct = value === question.answer;
    player.answerInput = String(value);
    question.submittedAnswer = value;
    question.isCorrect = correct;
    player.questionFeedback = correct ? 'correct' : 'wrong';
    player.questionVisibleFor = 0;
    player.nextQuestionIn = correct ? 2 : 2.6;
    if (correct) {
      player.correctCount += 1;
      player.streak += 1;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
      racer.boost = Math.max(racer.boost, 2.25);
      racer.speed = Math.min(racer.speed + 3.4, 31);
      player.energy = Math.min(100, player.energy + 26);
      this.setPlayerEvent(player, '答对了 · 即时喷射');
      if (player.energy >= 100) {
        player.energy -= 100;
        this.grantItem(racer, 'overdrive');
        this.setPlayerEvent(player, '连对满能 · 超级涡轮已装填');
      } else if (player.streak % 3 === 0 && !racer.item) {
        this.grantItem(racer, this.hasCloseTraffic(racer) ? 'shield' : 'nitro');
        this.setPlayerEvent(player, `连对 ${player.streak} · 自动道具已装填`);
      }
      if (question.challenge) this.applyChallengeReward(player, question.challenge);
      this.emit('correct', playerIndex);
      this.emit('boost', playerIndex);
    } else {
      player.streak = 0;
      this.setPlayerEvent(player, `正确答案 ${question.answer} · 本次无加速`);
      this.emit('wrong', playerIndex);
    }
  }

  private setPlayerEvent(player: PlayerState, label: string): void {
    player.eventLabel = label;
    this.eventLabel = `P${player.playerIndex + 1} · ${label}`;
  }

  private grantItem(racer: RacerState, item: StoredPowerUp): void {
    racer.item = item;
    racer.itemTimer = 0;
  }

  private applyChallengeReward(player: PlayerState, section: TrackSectionId): void {
    const racer = this.getPlayerRacer(player.playerIndex);
    if (!player.routeRewards.includes(section)) player.routeRewards.push(section);
    if (section === 'harbor') {
      racer.routeBoost = Math.max(racer.routeBoost, 5.5);
      racer.shortcut = Math.max(racer.shortcut, 5.5);
      this.setPlayerEvent(player, '港口加速线开启 · 自动切线');
    } else if (section === 'cliff') {
      racer.routeBoost = Math.max(racer.routeBoost, 5.5);
      racer.shortcut = Math.max(racer.shortcut, 6.5);
      this.setPlayerEvent(player, '内侧捷径解锁 · 漂移超车');
    } else if (section === 'cave') {
      racer.routeBoost = Math.max(racer.routeBoost, 6.5);
      racer.shortcut = Math.max(racer.shortcut, 6.5);
      racer.shield = Math.max(racer.shield, 5);
      this.setPlayerEvent(player, '水晶高速线开启 · 护盾同步');
    } else {
      racer.landingBoostArmed = true;
      this.setPlayerEvent(player, '落地冲刺已武装 · 瞄准跳台');
    }
  }

  createQuestion(player: PlayerState, challenge: SectionChallenge | null = null): void {
    this.questionId += 1;
    player.question = createMathQuestion(this.random, this.questionId);
    player.answerInput = '';
    if (challenge) {
      player.question.challenge = challenge.id;
      player.question.rewardLabel = challenge.rewardLabel;
      const racer = this.getPlayerRacer(player.playerIndex);
      const lap = Math.max(0, Math.floor(racer.distance / this.track.length));
      this.challenged.add(`${player.playerIndex}:${lap}:${challenge.id}`);
    }
    player.questionFeedback = null;
    player.questionVisibleFor = 0;
    player.nextQuestionIn = QUESTION_INTERVAL;
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
        for (const player of this.playerStates) this.createQuestion(player);
        this.emit('boost');
      }
      return;
    }

    this.elapsed += delta;
    this.driftSoundCooldown = Math.max(0, this.driftSoundCooldown - delta);
    for (const player of this.playerStates) this.updateQuestion(player, delta);
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
      this.updateAutomaticItem(racer, delta);
      const previousDrift = racer.drift;
      this.updateDrive(racer, delta);
      if (this.driftSoundCooldown <= 0 && previousDrift < 0.12 && racer.drift >= 0.12) {
        this.driftSoundCooldown = 2.8;
        this.emit('drift', racer.playerIndex);
      }
      racer.distance += racer.speed * delta;
      this.updateJump(racer, delta);
      const finishDistance = this.track.length * TOTAL_LAPS;
      if (racer.distance >= finishDistance) {
        racer.finished = true;
        racer.finishTime = this.elapsed;
        const player = this.playerStates[racer.playerIndex];
        this.setPlayerEvent(player, `第 ${this.getPosition(racer.id)} 名冲线`);
        this.emit('finish', racer.playerIndex);
      }
    }
    this.resolveCollisions();
    this.resolveObstacleCollisions();
    for (const player of this.playerStates) {
      const racer = this.getPlayerRacer(player.playerIndex);
      const position = this.getPosition(racer.id);
      if (position < player.previousPosition) {
        player.overtakeCount += player.previousPosition - position;
        if (racer.collisionCooldown <= 0) this.setPlayerEvent(player, `超越成功 · 当前第 ${position} 名`);
      }
      player.previousPosition = position;
    }
    if (this.racers.every((racer) => racer.finished)) {
      this.phase = 'finished';
      this.eventLabel = '比赛完成';
    }
  }

  private updateDrive(racer: RacerState, delta: number): void {
    racer.decisionTimer -= delta;
    if (racer.decisionTimer <= 0) {
      this.chooseLane(racer);
      racer.decisionTimer = 0.16 + this.random() * 0.08;
    }
    const curvature = this.track.getCurvature(racer.distance + Math.min(10, racer.speed * 0.3));
    const driftTarget = Math.abs(curvature) > 0.028 && racer.speed > 14 ? Math.min(1, Math.abs(curvature) * 8) : 0;
    racer.drift += (driftTarget - racer.drift) * Math.min(1, delta * (driftTarget > racer.drift ? 5 : 8));
    racer.driftDirection = curvature === 0 ? 0 : Math.sign(curvature);

    let targetSpeed = MAX_SPEED;
    targetSpeed -= Math.min(4.8, Math.abs(curvature) * 17);
    if (racer.boost > 0) targetSpeed = Math.max(targetSpeed, 29.5);
    if (racer.routeBoost > 0) targetSpeed = Math.max(targetSpeed, 31);
    if (racer.overdrive > 0) targetSpeed = Math.max(targetSpeed, 34);
    targetSpeed = Math.min(targetSpeed, 31);
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
    const player = this.playerStates[racer.playerIndex];
    this.setPlayerEvent(player, `自动使用 · ${POWER_UP_LABELS[item]}`);
    this.emit('boost', racer.playerIndex);
  }

  private hasCloseTraffic(racer: RacerState): boolean {
    return this.racers.some((other) => other !== racer && Math.abs(other.distance - racer.distance) < 6 && Math.abs(other.lane - racer.lane) < 2.2);
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
        const player = this.playerStates[racer.playerIndex];
        if (racer.landingBoostArmed) {
          racer.landingBoostArmed = false;
          racer.overdrive = Math.max(racer.overdrive, 4.5);
          racer.boost = Math.max(racer.boost, 4.5);
          this.setPlayerEvent(player, '完美落地 · 冲刺启动');
          this.emit('boost', racer.playerIndex);
        } else {
          this.setPlayerEvent(player, '平稳落地 · 自动回正');
        }
        this.emit('land', racer.playerIndex);
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
          if (a.collisionCooldown <= 0 && b.collisionCooldown <= 0) this.emit('impact', a.playerIndex);
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
        const player = this.playerStates[racer.playerIndex];
        if (racer.shield > 0) {
          racer.shield = Math.max(0, racer.shield - 1.25);
          this.setPlayerEvent(player, '护盾抵挡路障 · 速度保持');
        } else {
          racer.speed = Math.max(7, racer.speed * 0.58);
          racer.impactSlow = Math.max(racer.impactSlow, 0.9);
          racer.autoStatus = '碰撞减速 · 自动回到行车线';
          player.obstacleHits += 1;
          this.setPlayerEvent(player, '碰到路障 · 短暂减速');
        }
        this.emit('impact', racer.playerIndex);
        break;
      }
    }
  }

  private updateQuestion(player: PlayerState, delta: number): void {
    const racer = this.getPlayerRacer(player.playerIndex);
    if (racer.finished) return;
    const challenge = this.getUpcomingChallenge(player);
    if (challenge && (!player.question || player.question.submittedAnswer === null)) {
      if (player.question?.challenge !== challenge.id) this.createQuestion(player, challenge);
      return;
    }
    if (player.question && player.question.submittedAnswer === null) {
      player.questionVisibleFor += delta;
      if (player.questionVisibleFor >= QUESTION_INTERVAL) this.createQuestion(player);
      return;
    }
    player.nextQuestionIn -= delta;
    if (player.nextQuestionIn <= 0) {
      this.createQuestion(player);
    } else if (player.question?.submittedAnswer !== null && player.nextQuestionIn < 1.25) {
      player.question = null;
      player.answerInput = '';
      player.questionFeedback = null;
    }
  }

  private getUpcomingChallenge(player: PlayerState): SectionChallenge | null {
    const racer = this.getPlayerRacer(player.playerIndex);
    const lap = Math.max(0, Math.floor(racer.distance / this.track.length));
    const progress = this.track.progress(racer.distance);
    for (const challenge of SECTION_CHALLENGES) {
      if (this.challenged.has(`${player.playerIndex}:${lap}:${challenge.id}`)) continue;
      if (progress >= challenge.at - 0.018 && progress <= challenge.at + 0.025) return challenge;
    }
    return null;
  }

  get selectedKart(): KartId {
    return this.selectedKarts[0];
  }

  get player(): RacerState {
    return this.getPlayerRacer(0);
  }

  get question(): IMathQuestion | null {
    return this.playerStates[0]?.question ?? null;
  }

  get questionFeedback(): 'correct' | 'wrong' | null {
    return this.playerStates[0]?.questionFeedback ?? null;
  }

  get correctCount(): number { return this.playerStates[0]?.correctCount ?? 0; }
  get streak(): number { return this.playerStates[0]?.streak ?? 0; }
  get bestStreak(): number { return this.playerStates[0]?.bestStreak ?? 0; }
  get energy(): number { return this.playerStates[0]?.energy ?? 0; }
  set energy(value: number) { if (this.playerStates[0]) this.playerStates[0].energy = value; }
  get overtakeCount(): number { return this.playerStates[0]?.overtakeCount ?? 0; }
  get obstacleHits(): number { return this.playerStates[0]?.obstacleHits ?? 0; }
  get routeRewards(): TrackSectionId[] { return this.playerStates[0]?.routeRewards ?? []; }
  get activeRacers(): RacerState[] { return this.racers; }

  getPlayerRacer(playerIndex: PlayerIndex): RacerState {
    return this.racers.find((racer) => racer.playerIndex === playerIndex)!;
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

  private getPowerUp(racer: RacerState): PowerUpKind {
    if (racer.overdrive > 0) return 'overdrive';
    if (racer.boost > 0 || racer.routeBoost > 0) return 'nitro';
    if (racer.shield > 0) return 'shield';
    return null;
  }

  get powerUp(): PowerUpKind {
    return this.getPowerUp(this.player);
  }

  getName(id: KartId): string {
    return KART_SPECS.find((spec) => spec.id === id)!.name;
  }

  private getPlayerSnapshot(player: PlayerState): IPlayerSnapshot {
    const racer = this.getPlayerRacer(player.playerIndex);
    const section = this.track.getSection(racer.distance);
    return {
      playerIndex: player.playerIndex,
      kartId: player.kartId,
      question: player.question ? { ...player.question } : null,
      answerInput: player.answerInput,
      questionFeedback: player.questionFeedback,
      correctCount: player.correctCount,
      streak: player.streak,
      bestStreak: player.bestStreak,
      energy: player.energy,
      powerUp: this.getPowerUp(racer),
      inventory: racer.item,
      boostRemaining: Math.max(racer.boost, racer.routeBoost),
      shieldRemaining: racer.shield,
      eventLabel: player.eventLabel,
      autoStatus: racer.autoStatus,
      overtakeCount: player.overtakeCount,
      obstacleHits: player.obstacleHits,
      collisionSlowRemaining: racer.impactSlow,
      sectionId: section.id,
      sectionName: section.name,
      sectionProgress: this.track.getSectionProgress(racer.distance),
      landingBoostArmed: racer.landingBoostArmed,
      routeRewards: [...player.routeRewards],
    };
  }

  getSnapshot(): GameSnapshot {
    const ordered = this.getOrdered();
    const players = this.playerStates.map((player) => this.getPlayerSnapshot(player));
    const primary = players[0];
    return {
      phase: this.phase,
      playerCount: this.playerCount,
      cameraMode: 'shared',
      cameraSeparation: 0,
      selectedKarts: this.selectedKarts.slice(0, this.playerCount),
      players,
      racers: this.racers.map((racer) => ({
        id: racer.id,
        playerIndex: racer.playerIndex,
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
        isPlayer: true,
        boosting: racer.boost > 0 || racer.routeBoost > 0 || racer.overdrive > 0,
        drifting: racer.drift,
        airHeight: racer.airHeight,
        telegraph: racer.telegraph,
      })),
      elapsed: this.elapsed,
      countdown: this.countdown,
      results: this.phase === 'finished' ? ordered.map((racer, index) => ({
        rank: index + 1,
        id: racer.id,
        playerIndex: racer.playerIndex,
        name: this.getName(racer.id),
        color: KART_SPECS.find((spec) => spec.id === racer.id)!.color,
        time: racer.finishTime ?? this.elapsed,
        isPlayer: true,
      })) : [],
      muted: this.muted,
      loadedModels: [...this.loadedModels],
      loadedLandmarks: [...this.loadedLandmarks],
      eventLabel: this.eventLabel,
      rivalAlert: '',
      selectedKart: this.selectedKart,
      question: primary.question,
      questionFeedback: primary.questionFeedback,
      correctCount: primary.correctCount,
      streak: primary.streak,
      bestStreak: primary.bestStreak,
      energy: primary.energy,
      powerUp: primary.powerUp,
      inventory: primary.inventory,
      boostRemaining: primary.boostRemaining,
      shieldRemaining: primary.shieldRemaining,
      autoStatus: primary.autoStatus,
      overtakeCount: primary.overtakeCount,
      obstacleHits: primary.obstacleHits,
      collisionSlowRemaining: primary.collisionSlowRemaining,
      sectionId: primary.sectionId,
      sectionName: primary.sectionName,
      sectionProgress: primary.sectionProgress,
      landingBoostArmed: primary.landingBoostArmed,
      routeRewards: [...primary.routeRewards],
    };
  }
}
