export type Phase = 'ready' | 'playing' | 'dying' | 'dead' | 'paused';

const BEST_KEY = 'run-and-jump.best';

export class GameState {
  phase: Phase = 'ready';
  phaseTime = 0;
  score = 0;
  combo = 0;
  maxCombo = 0;
  distance = 0;
  best = 0;
  newBest = false;
  private scoreRemainder = 0;

  constructor() {
    this.best = this.loadBest();
  }

  /** Combo-driven score multiplier: ×1 → ×4 (fever). */
  get multiplier(): number {
    return 1 + Math.min(3, Math.floor(this.combo / 8));
  }

  get fever(): boolean {
    return this.multiplier >= 4;
  }

  setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  resetRun(): void {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.distance = 0;
    this.newBest = false;
    this.scoreRemainder = 0;
  }

  addDistance(meters: number): void {
    this.distance += meters;
    this.scoreRemainder += meters * 2;
    const whole = Math.floor(this.scoreRemainder);
    if (whole > 0) {
      this.score += whole;
      this.scoreRemainder -= whole;
    }
  }

  addCombo(): void {
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  breakCombo(): boolean {
    const had = this.combo >= 2;
    this.combo = 0;
    return had;
  }

  finishRun(): void {
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      this.saveBest();
    }
  }

  private loadBest(): number {
    try {
      return Number(window.localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  private saveBest(): void {
    try {
      window.localStorage.setItem(BEST_KEY, String(this.best));
    } catch {
      /* private mode — best score just won't persist */
    }
  }
}
