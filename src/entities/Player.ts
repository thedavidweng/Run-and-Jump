import * as THREE from 'three/webgpu';
import { buildPlayer, type PlayerParts } from '../assets/factories';

export type JumpKind = 'single' | 'double';

export type PlayerTuning = {
  gravity: number;
  jumpVelocity: number;
  doubleJumpVelocity: number;
  jumpCutoff: number;
};

export const DEFAULT_PLAYER_TUNING: PlayerTuning = {
  gravity: 26,
  jumpVelocity: 9.6,
  doubleJumpVelocity: 8.8,
  jumpCutoff: 4.5,
};

const BUFFER_SECONDS = 0.12;
const COYOTE_SECONDS = 0.08;
const APEX_GRAVITY_SCALE = 0.72;
const FLIP_SECONDS = 0.38;
/** Grace window before jump-cutoff applies, so a quick tap still hops ~1.2 high. */
const MIN_RISE_SECONDS = 0.1;
/** Shortest slide, even if the button is released immediately. */
const MIN_SLIDE_SECONDS = 0.22;
const FAST_FALL_VELOCITY = -12.5;
const FAST_FALL_GRAVITY_SCALE = 1.7;

export class Player {
  readonly parts: PlayerParts;
  readonly group: THREE.Group;

  y = 0;
  vy = 0;
  grounded = true;
  sliding = false;
  jumpsUsed = 0;

  onJump: (kind: JumpKind) => void = () => {};
  onLand: (fallSpeed: number) => void = () => {};
  onSlide: (kind: 'start' | 'fastfall') => void = () => {};

  private buffer = 0;
  private coyote = 0;
  private sinceJump = 0;
  private slideTime = 0;
  private wasDownHeld = false;
  private runPhase = 0;
  private squash = 1;
  private squashVel = 0;
  private lean = -0.1;
  private flipTime = FLIP_SECONDS;
  private airTime = 0;
  private dying = false;

  constructor(private readonly tuning: PlayerTuning = DEFAULT_PLAYER_TUNING) {
    this.parts = buildPlayer();
    this.group = this.parts.group;
    this.group.position.set(0, 0, 0);
  }

  reset(): void {
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = false;
    this.jumpsUsed = 0;
    this.buffer = 0;
    this.coyote = 0;
    this.sinceJump = 0;
    this.slideTime = 0;
    this.wasDownHeld = false;
    this.squash = 1;
    this.squashVel = 0;
    this.flipTime = FLIP_SECONDS;
    this.airTime = 0;
    this.dying = false;
    this.group.position.set(0, 0, 0);
    this.parts.visual.rotation.z = 0;
    this.applyPose(0);
  }

  /**
   * Collision box: center x/y plus half extents. The airborne tuck is a bit
   * shorter than running, and sliding hugs the ground under laser gates.
   */
  getAabb(out: { cx: number; cy: number; hw: number; hh: number }): void {
    if (this.sliding) {
      out.cx = this.group.position.x;
      out.cy = 0.31;
      out.hw = 0.4;
      out.hh = 0.27;
      return;
    }
    const height = this.grounded ? 1.12 : 0.95;
    out.cx = this.group.position.x;
    out.cy = this.y + height / 2 + 0.03;
    out.hw = 0.28;
    out.hh = height / 2;
  }

  update(deltaSeconds: number, pressed: boolean, held: boolean, downHeld: boolean, speed: number): void {
    const t = this.tuning;
    const downEdge = downHeld && !this.wasDownHeld;
    this.wasDownHeld = downHeld;

    if (pressed) this.buffer = BUFFER_SECONDS;
    else this.buffer = Math.max(0, this.buffer - deltaSeconds);

    if (this.grounded) {
      this.coyote = COYOTE_SECONDS;
      this.jumpsUsed = 0;
    } else {
      this.coyote = Math.max(0, this.coyote - deltaSeconds);
      this.airTime += deltaSeconds;
    }

    // ---- slide state (a grounded move; jump input cancels it) ----
    if (this.grounded) {
      if (downHeld && !this.sliding) {
        this.sliding = true;
        this.slideTime = 0;
        this.squash = 0.8;
        this.squashVel = 0;
        this.onSlide('start');
      } else if (this.sliding) {
        this.slideTime += deltaSeconds;
        if (!downHeld && this.slideTime >= MIN_SLIDE_SECONDS) {
          this.sliding = false;
        }
      }
    }

    if (this.buffer > 0) {
      if (this.grounded || this.coyote > 0) {
        this.sliding = false;
        this.doJump(t.jumpVelocity, 'single');
      } else if (this.jumpsUsed < 2) {
        this.doJump(t.doubleJumpVelocity, 'double');
        this.jumpsUsed = 2;
        this.flipTime = 0;
      }
    }

    if (!this.grounded) {
      this.sinceJump += deltaSeconds;
      // Fast-fall: stab ↓ in the air to slam down (dino-style).
      if (downEdge && this.vy > FAST_FALL_VELOCITY) {
        this.vy = FAST_FALL_VELOCITY;
        this.onSlide('fastfall');
      }
      // Variable jump height: releasing early clips upward velocity, but only
      // after a short grace so taps still produce a useful hop.
      if (!held && this.sinceJump > MIN_RISE_SECONDS && this.vy > t.jumpCutoff) this.vy = t.jumpCutoff;
      const apex = Math.abs(this.vy) < 1.6 ? APEX_GRAVITY_SCALE : 1;
      const fastFall = downHeld && this.vy < 0 ? FAST_FALL_GRAVITY_SCALE : 1;
      this.vy -= t.gravity * apex * fastFall * deltaSeconds;
      this.y += this.vy * deltaSeconds;

      if (this.y <= 0) {
        const fallSpeed = -this.vy;
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.squash = 0.76;
        this.squashVel = 0;
        this.onLand(fallSpeed);
        this.airTime = 0;
        // Land straight into a slide when ↓ is still held.
        if (downHeld) {
          this.sliding = true;
          this.slideTime = 0;
          this.onSlide('start');
        }
      }
    }

    if (this.grounded && !this.sliding) {
      this.runPhase += deltaSeconds * (5.5 + speed * 0.95);
    }

    this.applyPose(deltaSeconds);
  }

  /** Title-screen treadmill: run animation only, no physics. */
  idle(deltaSeconds: number, speed: number): void {
    this.runPhase += deltaSeconds * (5.5 + speed * 0.95);
    this.applyPose(deltaSeconds);
  }

  startDeath(): void {
    this.dying = true;
    this.sliding = false;
    this.vy = 6.5;
    this.grounded = false;
  }

  /** Ragdoll-ish tumble during the slow-mo death beat. Runs on real time. */
  deathUpdate(deltaSeconds: number): void {
    this.vy -= this.tuning.gravity * 0.6 * deltaSeconds;
    this.y = Math.max(0, this.y + this.vy * deltaSeconds);
    this.group.position.x -= deltaSeconds * 2.2;
    this.parts.visual.rotation.z += deltaSeconds * 8.5;
    this.group.position.y = this.y;
    this.updateShadow();
  }

  private doJump(velocity: number, kind: JumpKind): void {
    this.vy = velocity;
    this.grounded = false;
    this.sliding = false;
    this.buffer = 0;
    this.coyote = 0;
    this.sinceJump = 0;
    if (this.jumpsUsed === 0) this.jumpsUsed = 1;
    this.squash = 1.2;
    this.squashVel = 0;
    this.onJump(kind);
  }

  private applyPose(deltaSeconds: number): void {
    const { visual, legL, legR, armL, armR, scarf } = this.parts;
    if (this.dying) return;

    this.group.position.y = this.y;

    // Squash & stretch spring back to 1.
    const springAccel = (1 - this.squash) * 140 - this.squashVel * 14;
    this.squashVel += springAccel * deltaSeconds;
    this.squash += this.squashVel * deltaSeconds;
    const stretch = this.grounded ? 0 : THREE.MathUtils.clamp(this.vy * 0.022, -0.12, 0.16);
    visual.scale.set(1 / (this.squash + stretch * 0.5 || 1), this.squash + stretch, 1);

    const smoothing = 1 - Math.exp(-12 * deltaSeconds);

    if (this.sliding) {
      // Baseball slide: tip back around the feet, legs kicked forward.
      this.lean = THREE.MathUtils.lerp(this.lean, 1.18, smoothing);
      visual.rotation.z = this.lean;
      legL.rotation.z = THREE.MathUtils.lerp(legL.rotation.z, -1.25, smoothing);
      legR.rotation.z = THREE.MathUtils.lerp(legR.rotation.z, -1.45, smoothing);
      armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, 1.15, smoothing);
      armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, 1.35, smoothing);
      visual.position.y = 0;
      scarf.rotation.z = THREE.MathUtils.lerp(scarf.rotation.z, -0.6, smoothing);
      this.updateShadow();
      return;
    }

    // Lean: forward on the ground, back a touch while rising, nose-down falling.
    const targetLean = this.grounded ? -0.1 : this.vy > 0 ? -0.22 : 0.04;
    this.lean = THREE.MathUtils.lerp(this.lean, targetLean, 1 - Math.exp(-10 * deltaSeconds));

    // Double-jump front flip.
    let flip = 0;
    if (this.flipTime < FLIP_SECONDS) {
      this.flipTime = Math.min(FLIP_SECONDS, this.flipTime + deltaSeconds);
      const k = this.flipTime / FLIP_SECONDS;
      flip = -(1 - Math.pow(1 - k, 2)) * Math.PI * 2;
    }
    visual.rotation.z = this.lean + flip;

    if (this.grounded) {
      const swing = Math.sin(this.runPhase);
      legL.rotation.z = swing * 0.85;
      legR.rotation.z = -swing * 0.85;
      armL.rotation.z = -swing * 0.55;
      armR.rotation.z = swing * 0.55;
      visual.position.y = Math.abs(Math.cos(this.runPhase)) * 0.055;
    } else {
      const tuck = 1 - Math.exp(-12 * deltaSeconds);
      legL.rotation.z = THREE.MathUtils.lerp(legL.rotation.z, -0.65, tuck);
      legR.rotation.z = THREE.MathUtils.lerp(legR.rotation.z, 0.5, tuck);
      armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, 0.7, tuck);
      armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, -0.6, tuck);
      visual.position.y = 0;
    }

    scarf.rotation.z = 0.5 + Math.sin(this.runPhase * 2.1) * 0.16 + THREE.MathUtils.clamp(this.vy * 0.03, -0.3, 0.3);
    this.updateShadow();
  }

  private updateShadow(): void {
    const { shadow } = this.parts;
    const factor = THREE.MathUtils.clamp(1 - this.y * 0.26, 0.2, 1);
    shadow.scale.setScalar(factor);
    shadow.position.y = 0.02 - this.group.position.y;
  }
}
