import * as THREE from 'three/webgpu';
import type { BeatClock } from '../game/BeatClock';
import { gapBeatsForTier } from '../game/difficulty';
import { INTRO_SEQUENCE, patternByName, pickPattern, type SpawnKind } from '../game/patterns';
import { Flyer, Note, Obstacle, type ObstacleKind } from '../entities/scrolling';

const POOL_SIZES = { spike: 14, wallLow: 6, wallTall: 6, bar: 6, flyer: 14, note: 44 } as const;
const OBSTACLE_KINDS = ['spike', 'wallLow', 'wallTall', 'bar'] as const;
/** X past which a bar counts as slid-under (for the style bonus). */
const BAR_PASS_X = -1.1;
const SPAWN_AHEAD_UNITS = 38;
const DESPAWN_BEHIND_UNITS = -13;
const FLYER_MISS_X = -1.6;
const FLYER_LOW_Y = 1.7;
const FLYER_HIGH_Y = 2.9;
/** First chart event lands on beat 8 — two calm bars after the run starts. */
const FIRST_PATTERN_BEAT = 8;

type QueuedSpawn = { beat: number; kind: SpawnKind; y: number };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Spawner {
  readonly root = new THREE.Group();
  /** Flyers that slipped past unsmashed this frame (combo breaks). */
  readonly frameMisses: Flyer[] = [];
  /** Laser gates that just scrolled past the player this frame. */
  readonly frameBarPasses: Obstacle[] = [];
  droppedSpawns = 0;

  private readonly obstaclePools: Record<ObstacleKind, Obstacle[]> = {
    spike: [],
    wallLow: [],
    wallTall: [],
    bar: [],
  };
  private readonly flyerPool: Flyer[] = [];
  private readonly notePool: Note[] = [];

  private queue: QueuedSpawn[] = [];
  private queueHead = 0;
  private nextPatternBeat = FIRST_PATTERN_BEAT;
  private introIndex = 0;
  private lastPatternName = '';
  private random = mulberry32(1);

  constructor() {
    for (const kind of OBSTACLE_KINDS) {
      for (let i = 0; i < POOL_SIZES[kind]; i += 1) {
        const obstacle = new Obstacle(kind);
        this.obstaclePools[kind].push(obstacle);
        this.root.add(obstacle.group);
      }
    }
    for (let i = 0; i < POOL_SIZES.flyer; i += 1) {
      const flyer = new Flyer();
      this.flyerPool.push(flyer);
      this.root.add(flyer.group);
    }
    for (let i = 0; i < POOL_SIZES.note; i += 1) {
      const note = new Note();
      this.notePool.push(note);
      this.root.add(note.group);
    }
  }

  get obstacles(): readonly Obstacle[] {
    return this.activeObstacles;
  }
  get flyers(): readonly Flyer[] {
    return this.flyerPool;
  }
  get notes(): readonly Note[] {
    return this.notePool;
  }

  private readonly activeObstacles: Obstacle[] = [];

  counts(): { obstacles: number; flyers: number; notes: number } {
    let flyers = 0;
    for (const f of this.flyerPool) if (f.active) flyers += 1;
    let notes = 0;
    for (const n of this.notePool) if (n.active) notes += 1;
    return { obstacles: this.activeObstacles.length, flyers, notes };
  }

  reset(seed: number): void {
    for (const kind of OBSTACLE_KINDS) {
      for (const obstacle of this.obstaclePools[kind]) obstacle.despawn();
    }
    for (const flyer of this.flyerPool) flyer.despawn();
    for (const note of this.notePool) note.despawn();
    this.activeObstacles.length = 0;
    this.frameMisses.length = 0;
    this.frameBarPasses.length = 0;
    this.queue = [];
    this.queueHead = 0;
    this.nextPatternBeat = FIRST_PATTERN_BEAT;
    this.introIndex = 0;
    this.lastPatternName = '';
    this.droppedSpawns = 0;
    this.random = mulberry32(seed);
  }

  update(clock: BeatClock, speed: number, tier: number, deltaSeconds: number, playerX: number, playerY: number): void {
    this.frameMisses.length = 0;
    this.frameBarPasses.length = 0;

    const horizonBeats = SPAWN_AHEAD_UNITS / speed / clock.secondsPerBeat;
    this.refillQueue(clock.beat + horizonBeats + 4, tier);

    while (this.queueHead < this.queue.length) {
      const next = this.queue[this.queueHead];
      if (clock.timeUntil(next.beat) * speed > SPAWN_AHEAD_UNITS) break;
      this.spawn(next);
      this.queueHead += 1;
    }
    if (this.queueHead > 256) {
      this.queue = this.queue.slice(this.queueHead);
      this.queueHead = 0;
    }

    for (let i = this.activeObstacles.length - 1; i >= 0; i -= 1) {
      const obstacle = this.activeObstacles[i];
      obstacle.update(clock, speed);
      if (obstacle.kind === 'bar' && !obstacle.passed && obstacle.group.position.x < BAR_PASS_X) {
        obstacle.passed = true;
        this.frameBarPasses.push(obstacle);
      }
      if (obstacle.group.position.x < DESPAWN_BEHIND_UNITS) {
        obstacle.despawn();
        this.activeObstacles.splice(i, 1);
      }
    }

    for (const flyer of this.flyerPool) {
      if (!flyer.active) continue;
      flyer.update(clock, speed, deltaSeconds);
      if (!flyer.smashed && !flyer.missed && flyer.group.position.x < FLYER_MISS_X) {
        flyer.missed = true;
        this.frameMisses.push(flyer);
      }
      if (flyer.group.position.x < DESPAWN_BEHIND_UNITS) flyer.despawn();
    }

    for (const note of this.notePool) {
      if (!note.active) continue;
      note.update(clock, speed, deltaSeconds, playerX, playerY);
      if (note.group.position.x < DESPAWN_BEHIND_UNITS) note.despawn();
    }
  }

  private refillQueue(untilBeat: number, tier: number): void {
    while (this.nextPatternBeat < untilBeat) {
      const pattern =
        this.introIndex < INTRO_SEQUENCE.length
          ? patternByName(INTRO_SEQUENCE[this.introIndex])
          : pickPattern(tier, this.random, this.lastPatternName);
      this.introIndex += 1;
      this.lastPatternName = pattern.name;

      for (const event of pattern.events) {
        const y = event.y ?? (event.t === 'flyerLow' ? FLYER_LOW_Y : event.t === 'flyerHigh' ? FLYER_HIGH_Y : 0);
        this.queue.push({ beat: this.nextPatternBeat + event.b, kind: event.t, y });
      }
      this.nextPatternBeat += pattern.lengthBeats + gapBeatsForTier(tier);
    }
  }

  private spawn(item: QueuedSpawn): void {
    switch (item.kind) {
      case 'spike':
      case 'wallLow':
      case 'wallTall':
      case 'bar': {
        const obstacle = this.obstaclePools[item.kind].find((o) => !o.active);
        if (!obstacle) {
          this.droppedSpawns += 1;
          return;
        }
        obstacle.spawn(item.beat);
        this.activeObstacles.push(obstacle);
        break;
      }
      case 'flyerLow':
      case 'flyerHigh': {
        const flyer = this.flyerPool.find((f) => !f.active);
        if (!flyer) {
          this.droppedSpawns += 1;
          return;
        }
        flyer.spawn(item.beat, item.y);
        break;
      }
      case 'note': {
        const note = this.notePool.find((n) => !n.active);
        if (!note) {
          this.droppedSpawns += 1;
          return;
        }
        note.spawn(item.beat, item.y);
        break;
      }
    }
  }
}
