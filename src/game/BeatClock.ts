/**
 * Musical clock driven by simulated time. Everything rhythmic (spawns, track
 * beat lines, procedural music scheduling) derives from `beat`, so obstacles
 * always arrive at the player exactly on a beat regardless of speed ramps.
 */
export class BeatClock {
  beat = 0;
  bpm = 120;

  get secondsPerBeat(): number {
    return 60 / this.bpm;
  }

  advance(deltaSeconds: number): void {
    this.beat += (deltaSeconds * this.bpm) / 60;
  }

  /** Seconds until the given beat at the current tempo (negative if passed). */
  timeUntil(beat: number): number {
    return (beat - this.beat) * this.secondsPerBeat;
  }

  reset(bpm: number): void {
    this.beat = 0;
    this.bpm = bpm;
  }
}
