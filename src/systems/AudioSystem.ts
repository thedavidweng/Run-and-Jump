import type { BeatClock } from '../game/BeatClock';

const MUTE_KEY = 'run-and-jump.muted';
const LOOKAHEAD_SECONDS = 0.16;

/** A minor pentatonic ladder for note-pickup plucks (rises with combo). */
const PLUCK_LADDER = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
/** Two-bar bass line in eighth notes (Hz, 0 = rest). */
const BASS_SEQ = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 55, 0, 82.41, 73.42, 65.41, 49];
/** Chord loop, one stab every two bars: Am, F, C, G. */
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
];
const ARP_SEQ = [440, 659.25, 523.25, 880, 587.33, 783.99, 659.25, 1046.5];

/**
 * Fully procedural Web Audio engine. Music is scheduled ahead of the shared
 * BeatClock (kick / snare / hats / bass / stabs, plus an arp layer in fever),
 * so what you hear is exactly what the spawner charts.
 */
export class AudioSystem {
  muted = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastScheduledEighth = -1;
  private musicOn = false;
  private fever = false;

  constructor() {
    try {
      this.muted = window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  async unlock(): Promise<void> {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    await ctx.resume();

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const compressor = ctx.createDynamicsCompressor();
    this.master.connect(compressor).connect(ctx.destination);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 16000;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.8;
    this.musicBus.connect(this.musicFilter).connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    const seconds = 1;
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
    try {
      window.localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* non-persistent mute is fine */
    }
    return this.muted;
  }

  startMusic(): void {
    this.musicOn = true;
    this.lastScheduledEighth = -1;
    this.fever = false;
    if (this.ctx && this.musicFilter) {
      this.musicFilter.frequency.cancelScheduledValues(this.ctx.currentTime);
      this.musicFilter.frequency.setValueAtTime(16000, this.ctx.currentTime);
    }
  }

  stopMusic(): void {
    this.musicOn = false;
  }

  setFever(on: boolean): void {
    this.fever = on;
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  /** Schedule music for the imminent lookahead window. Call every frame while playing. */
  update(clock: BeatClock): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn || ctx.state !== 'running') return;

    const spb = clock.secondsPerBeat;
    const horizon = clock.beat + LOOKAHEAD_SECONDS / spb;
    let eighth = this.lastScheduledEighth + 1;
    // On (re)start, begin from the current beat rather than replaying the past.
    if (eighth === 0) eighth = Math.max(0, Math.ceil(clock.beat * 2));

    while (eighth * 0.5 <= horizon) {
      const when = ctx.currentTime + Math.max(0, (eighth * 0.5 - clock.beat) * spb);
      this.scheduleEighth(eighth, when);
      this.lastScheduledEighth = eighth;
      eighth += 1;
    }
  }

  private scheduleEighth(eighth: number, when: number): void {
    const onBeat = eighth % 2 === 0;
    const beatInBar = Math.floor(eighth / 2) % 4;

    if (onBeat) this.kick(when);
    if (onBeat && (beatInBar === 1 || beatInBar === 3)) this.snare(when);
    this.hat(when, eighth % 2 === 1 ? 0.085 : 0.045);

    const bass = BASS_SEQ[eighth % BASS_SEQ.length];
    if (bass > 0) this.bassPluck(when, bass);

    if (eighth % 16 === 0) {
      this.chordStab(when, CHORDS[Math.floor(eighth / 16) % CHORDS.length]);
    }

    if (this.fever) {
      this.arp(when, ARP_SEQ[eighth % ARP_SEQ.length]);
    }
  }

  // ------------------------------------------------------------ instruments

  private kick(when: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.1);
    gain.gain.setValueAtTime(0.75, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    osc.connect(gain).connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.18);
  }

  private snare(when: number): void {
    if (!this.ctx || !this.musicBus) return;
    this.noiseHit(this.musicBus, when, 0.16, 'bandpass', 1900, 0.12);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(196, when);
    gain.gain.setValueAtTime(0.08, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
    osc.connect(gain).connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.12);
  }

  private hat(when: number, level: number): void {
    if (!this.musicBus) return;
    this.noiseHit(this.musicBus, when, 0.035, 'highpass', 8200, level);
  }

  private bassPluck(when: number, freq: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, when);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, when);
    filter.frequency.exponentialRampToValueAtTime(220, when + 0.18);
    gain.gain.setValueAtTime(0.16, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
    osc.connect(filter).connect(gain).connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.24);
  }

  private chordStab(when: number, freqs: number[]): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, when);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.05, when + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.9);
      osc.connect(gain).connect(this.musicBus);
      osc.start(when);
      osc.stop(when + 1);
    }
  }

  private arp(when: number, freq: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.035, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.09);
    osc.connect(gain).connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.1);
  }

  private noiseHit(
    bus: AudioNode,
    when: number,
    duration: number,
    filterType: BiquadFilterType,
    frequency: number,
    level: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter).connect(gain).connect(bus);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  // ------------------------------------------------------------------- SFX

  sfxJump(double: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(double ? 430 : 320, now);
    osc.frequency.exponentialRampToValueAtTime(double ? 920 : 660, now + 0.07);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.11);
    this.noiseHit(this.sfxBus, now, 0.07, 'highpass', 1200, 0.03);
  }

  sfxLand(strength: number): void {
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    this.noiseHit(this.sfxBus, this.ctx.currentTime, 0.09, 'lowpass', 300, Math.min(0.09, 0.03 + strength * 0.01));
  }

  sfxSmash(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const start of [220, 331]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(start, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain).connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + 0.13);
    }
    this.noiseHit(this.sfxBus, now, 0.12, 'bandpass', 3200, 0.14);
  }

  sfxNote(combo: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const freq = PLUCK_LADDER[combo % PLUCK_LADDER.length];
    for (const [mult, level] of [
      [1, 0.09],
      [2, 0.03],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * mult, now);
      gain.gain.setValueAtTime(level, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain).connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  }

  sfxSlide(): void {
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    this.noiseHit(this.sfxBus, this.ctx.currentTime, 0.22, 'lowpass', 700, 0.07);
  }

  sfxFastFall(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  /** Style bonus for sliding clean under a laser gate. */
  sfxSlick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    [659.25, 987.77].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);
      gain.gain.setValueAtTime(0.08, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.16);
      osc.connect(gain).connect(this.sfxBus!);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.18);
    });
  }

  sfxMiss(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.16);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  sfxDeath(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.musicFilter) {
      this.musicFilter.frequency.cancelScheduledValues(now);
      this.musicFilter.frequency.setValueAtTime(16000, now);
      this.musicFilter.frequency.exponentialRampToValueAtTime(240, now + 0.5);
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.55);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.62);
    this.noiseHit(this.sfxBus, now, 0.5, 'lowpass', 900, 0.12);
  }

  sfxStart(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    [440, 554.37, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.08, now + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.18);
      osc.connect(gain).connect(this.sfxBus!);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.2);
    });
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
