import * as THREE from 'three/webgpu';
import type { BeatClock } from '../game/BeatClock';
import { buildBar, buildFlyer, buildNote, buildSpike, buildWall, type FlyerParts } from '../assets/factories';

/**
 * Scrolling entities are positioned every frame from their arrival beat:
 * x = timeUntil(arrivalBeat) * speed. Arrival at the player (x = 0) therefore
 * lands exactly on the beat no matter how tempo or speed ramp.
 */

export type ObstacleKind = 'spike' | 'wallLow' | 'wallTall' | 'bar';

function buildObstacleMesh(kind: ObstacleKind): THREE.Group {
  if (kind === 'spike') return buildSpike();
  if (kind === 'bar') return buildBar();
  return buildWall(kind === 'wallTall');
}

export class Obstacle {
  readonly group: THREE.Group;
  kind: ObstacleKind;
  arrivalBeat = 0;
  active = false;
  /** Set once the obstacle scrolls past the player (used for slide bonuses). */
  passed = false;

  constructor(kind: ObstacleKind) {
    this.kind = kind;
    this.group = buildObstacleMesh(kind);
    this.group.visible = false;
  }

  spawn(arrivalBeat: number): void {
    this.arrivalBeat = arrivalBeat;
    this.active = true;
    this.passed = false;
    this.group.visible = true;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
  }

  update(clock: BeatClock, speed: number): void {
    if (!this.active) return;
    this.group.position.x = clock.timeUntil(this.arrivalBeat) * speed;
  }

  /** Hitboxes shrunk ~15% from the visuals so grazes feel fair. */
  getAabb(out: { cx: number; cy: number; hw: number; hh: number }): void {
    out.cx = this.group.position.x;
    if (this.kind === 'spike') {
      out.cy = 0.44;
      out.hw = 0.34;
      out.hh = 0.44;
    } else if (this.kind === 'wallLow') {
      out.cy = 0.66;
      out.hw = 0.26;
      out.hh = 0.62;
    } else if (this.kind === 'bar') {
      // Beams span 0.72..2.0: sliding (top 0.58) clears, running (top 1.15) dies.
      out.cy = 1.36;
      out.hw = 0.22;
      out.hh = 0.64;
    } else {
      out.cy = 1.26;
      out.hw = 0.26;
      out.hh = 1.22;
    }
  }
}

export class Flyer {
  readonly parts: FlyerParts;
  readonly group: THREE.Group;
  arrivalBeat = 0;
  baseY = 1.7;
  active = false;
  smashed = false;
  missed = false;
  radius = 0.52;

  private wobbleSeed = Math.random() * Math.PI * 2;

  constructor() {
    this.parts = buildFlyer();
    this.group = this.parts.group;
    this.group.visible = false;
  }

  spawn(arrivalBeat: number, y: number): void {
    this.arrivalBeat = arrivalBeat;
    this.baseY = y;
    this.active = true;
    this.smashed = false;
    this.missed = false;
    this.group.visible = true;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
  }

  update(clock: BeatClock, speed: number, deltaSeconds: number): void {
    if (!this.active) return;
    this.group.position.x = clock.timeUntil(this.arrivalBeat) * speed;
    this.group.position.y = this.baseY + Math.sin(clock.beat * Math.PI + this.wobbleSeed) * 0.12;
    this.parts.core.rotation.x += deltaSeconds * 2.4;
    this.parts.core.rotation.y += deltaSeconds * 3.1;
  }
}

export class Note {
  readonly group: THREE.Group;
  arrivalBeat = 0;
  baseY = 0.7;
  active = false;
  collected = false;
  radius = 0.52;

  private magnet = 0;

  constructor() {
    this.group = buildNote();
    this.group.visible = false;
  }

  spawn(arrivalBeat: number, y: number): void {
    this.arrivalBeat = arrivalBeat;
    this.baseY = y;
    this.active = true;
    this.collected = false;
    this.magnet = 0;
    this.group.visible = true;
  }

  despawn(): void {
    this.active = false;
    this.group.visible = false;
  }

  update(clock: BeatClock, speed: number, deltaSeconds: number, playerX: number, playerY: number): void {
    if (!this.active) return;
    const x = clock.timeUntil(this.arrivalBeat) * speed;
    const y = this.baseY + Math.sin(clock.beat * Math.PI * 2) * 0.05;

    // Light magnetism: ease toward the player when close enough to grab.
    const dx = x - playerX;
    const dy = y - (playerY + 0.6);
    const distSq = dx * dx + dy * dy;
    if (distSq < 2.1 * 2.1) {
      this.magnet = Math.min(1, this.magnet + deltaSeconds * 6);
    }
    this.group.position.x = THREE.MathUtils.lerp(x, playerX, this.magnet * 0.55);
    this.group.position.y = THREE.MathUtils.lerp(y, playerY + 0.6, this.magnet * 0.55);
    this.group.rotation.y += deltaSeconds * 3.4;
  }
}
