export type SoundEvent = 'correct' | 'wrong' | 'boost' | 'click' | 'countdown' | 'finish' | 'impact' | 'land' | 'telegraph' | 'drift';
type MusicScene = 'menu' | 'race';

interface MusicVoice {
  scene: MusicScene;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const SFX_FILES: Record<SoundEvent, string | null> = {
  correct: 'correct.wav',
  wrong: 'wrong.wav',
  boost: 'boost.wav',
  click: 'ui-click.wav',
  countdown: 'countdown.wav',
  finish: 'finish.wav',
  impact: 'impact.wav',
  land: null,
  telegraph: 'telegraph.wav',
  drift: 'drift.wav',
};

const SFX_VOLUMES: Record<SoundEvent, number> = {
  correct: 0.42,
  wrong: 0.34,
  boost: 0.4,
  click: 0.32,
  countdown: 0.32,
  finish: 0.48,
  impact: 0.46,
  land: 0.36,
  telegraph: 0.26,
  drift: 0.28,
};

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGroup: GainNode | null = null;
  private sfxGroup: GainNode | null = null;
  private uiGroup: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private musicVoice: MusicVoice | null = null;
  private readonly musicBuffers = new Map<MusicScene, AudioBuffer>();
  private readonly sfxBuffers = new Map<SoundEvent, AudioBuffer>();
  private readonly loadErrors: string[] = [];
  private readonly sampleEvents: Partial<Record<SoundEvent, number>> = {};
  private readonly fallbackEvents: Partial<Record<SoundEvent, number>> = {};
  private baseUrl = '/';
  private scene: MusicScene = 'menu';
  private loading: Promise<void> | null = null;
  private playCounter = 0;
  private muted = false;
  private paused = false;

  prepare(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  async unlock(): Promise<void> {
    if (!this.context) this.createGraph();
    if (this.context?.state === 'suspended') await this.context.resume();
    if (!this.loading) this.loading = this.loadAll();
    await this.loading;
    this.startMusic();
  }

  private createGraph(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.context.destination);
    this.musicGroup = this.context.createGain();
    this.musicGroup.gain.value = 0.6;
    this.musicGroup.connect(this.master);
    this.sfxGroup = this.context.createGain();
    this.sfxGroup.gain.value = 0.82;
    this.sfxGroup.connect(this.master);
    this.uiGroup = this.context.createGain();
    this.uiGroup.gain.value = 0.7;
    this.uiGroup.connect(this.master);
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master);
    this.engineOscillator = this.context.createOscillator();
    this.engineOscillator.type = 'sawtooth';
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOscillator.connect(filter).connect(this.engineGain);
    this.engineOscillator.start();
  }

  private async loadAll(): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const scene of ['menu', 'race'] as const) {
      jobs.push(this.loadBuffer(`${this.baseUrl}audio/${scene}-bgm.wav`, `${scene}-bgm`).then((buffer) => {
        if (buffer) this.musicBuffers.set(scene, buffer);
      }));
    }
    for (const [event, file] of Object.entries(SFX_FILES) as [SoundEvent, string | null][]) {
      if (!file) continue;
      jobs.push(this.loadBuffer(`${this.baseUrl}audio/${file}`, file).then((buffer) => {
        if (buffer) this.sfxBuffers.set(event, buffer);
      }));
    }
    await Promise.all(jobs);
  }

  private async loadBuffer(url: string, label: string): Promise<AudioBuffer | null> {
    if (!this.context) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      return await this.context.decodeAudioData(await response.arrayBuffer());
    } catch {
      if (!this.loadErrors.includes(label)) this.loadErrors.push(label);
      return null;
    }
  }

  setScene(scene: MusicScene): void {
    if (this.scene === scene && this.musicVoice?.scene === scene) return;
    this.scene = scene;
    this.startMusic();
  }

  private startMusic(): void {
    if (!this.context || !this.musicGroup || this.paused) return;
    const buffer = this.musicBuffers.get(this.scene);
    if (!buffer || this.musicVoice?.scene === this.scene) return;
    const now = this.context.currentTime;
    if (this.musicVoice) {
      const previous = this.musicVoice;
      this.musicVoice = null;
      previous.gain.gain.cancelScheduledValues(now);
      previous.gain.gain.setTargetAtTime(0.0001, now, 0.08);
      previous.source.stop(now + 0.32);
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = Math.max(0, buffer.duration - 0.025);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + 0.24);
    source.connect(gain).connect(this.musicGroup);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(now);
    this.musicVoice = { scene: this.scene, source, gain };
  }

  setEngine(speed: number, boosting: boolean): void {
    if (!this.context || !this.engineOscillator || !this.engineGain) return;
    const now = this.context.currentTime;
    this.engineOscillator.frequency.setTargetAtTime(48 + speed * 4.2 + (boosting ? 45 : 0), now, 0.05);
    const volume = speed > 0.5 && !this.paused ? 0.035 + speed * 0.0012 : 0;
    this.engineGain.gain.setTargetAtTime(volume, now, 0.08);
  }

  play(event: SoundEvent): void {
    if (!this.context || !this.master || this.muted || this.paused) return;
    const buffer = this.sfxBuffers.get(event);
    if (!buffer) {
      this.fallbackEvents[event] = (this.fallbackEvents[event] ?? 0) + 1;
      this.playFallback(event);
      return;
    }
    this.sampleEvents[event] = (this.sampleEvents[event] ?? 0) + 1;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    const pitchStep = (this.playCounter % 5) - 2;
    this.playCounter += 1;
    source.playbackRate.value = event === 'countdown' || event === 'finish' ? 1 : 1 + pitchStep * 0.008;
    gain.gain.value = SFX_VOLUMES[event];
    source.connect(gain).connect(event === 'click' ? this.uiGroup! : this.sfxGroup!);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    if (event === 'finish') this.duckMusic(1.8, 0.42);
    else if (event === 'impact') this.duckMusic(0.32, 0.7);
  }

  private playFallback(event: SoundEvent): void {
    if (!this.context || !this.master) return;
    const settings: Record<SoundEvent, [number, number, number, OscillatorType]> = {
      correct: [660, 990, 0.22, 'sine'], wrong: [170, 110, 0.24, 'square'],
      boost: [180, 720, 0.42, 'sawtooth'], click: [420, 520, 0.07, 'sine'],
      countdown: [440, 440, 0.12, 'sine'], finish: [523, 1046, 0.65, 'triangle'],
      impact: [90, 45, 0.16, 'sawtooth'], land: [120, 65, 0.2, 'triangle'],
      telegraph: [330, 510, 0.24, 'square'], drift: [240, 180, 0.16, 'sawtooth'],
    };
    const [from, to, duration, type] = settings[event];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    gain.gain.setValueAtTime(event === 'impact' ? 0.12 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private duckMusic(duration: number, depth: number): void {
    if (!this.context || !this.musicGroup) return;
    const now = this.context.currentTime;
    const gain = this.musicGroup.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0.6 * depth, now + 0.025);
    gain.linearRampToValueAtTime(0.6, now + duration);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.context.currentTime, 0.03);
  }

  async setPaused(paused: boolean): Promise<void> {
    this.paused = paused;
    if (!this.context) return;
    if (paused) await this.context.suspend();
    else {
      await this.context.resume();
      this.startMusic();
    }
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      scene: this.scene,
      contextState: this.context?.state ?? 'locked',
      loadedMusic: [...this.musicBuffers.keys()],
      loadedSfx: [...this.sfxBuffers.keys()],
      activeMusic: this.musicVoice?.scene ?? null,
      musicVoices: this.musicVoice ? 1 : 0,
      muted: this.muted,
      paused: this.paused,
      loadErrors: [...this.loadErrors],
      sampleEvents: { ...this.sampleEvents },
      fallbackEvents: { ...this.fallbackEvents },
      masterGain: this.master?.gain.value ?? 0,
    };
  }

  dispose(): void {
    try { this.musicVoice?.source.stop(); } catch { /* 已结束的音源无需重复停止 */ }
    try { this.engineOscillator?.stop(); } catch { /* 已结束的振荡器无需重复停止 */ }
    this.musicVoice = null;
    void this.context?.close();
    this.context = null;
  }
}
