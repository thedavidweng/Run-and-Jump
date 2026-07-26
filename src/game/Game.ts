import * as THREE from 'three/webgpu';
import { GameRenderer } from '../core/Renderer';
import { Input } from '../core/Input';
import { Loop } from '../core/Loop';
import { diagnostics, publishDiagnostics, unpublishDiagnostics } from '../core/diagnostics';
import { disposeObject3D } from '../utils/dispose';
import { BeatClock } from './BeatClock';
import { GameState } from './GameState';
import { BASE_BPM, bpmForDistance, speedForDistance, tierForDistance, BASE_SPEED } from './difficulty';
import { Player, DEFAULT_PLAYER_TUNING } from '../entities/Player';
import { Environment } from '../systems/Environment';
import { Spawner } from '../systems/Spawner';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CameraRig } from '../systems/CameraRig';
import { Vfx } from '../systems/Vfx';
import { AudioSystem } from '../systems/AudioSystem';
import { Hud } from '../systems/Hud';
import { DebugTools } from '../systems/DebugTools';

const READY_SCROLL_SPEED = 3;
const DEATH_SLOWMO = 0.14;
const DEATH_SECONDS = 0.95;
const RESTART_LOCKOUT = 0.45;
const SCORE_SMASH = 50;
const SCORE_NOTE = 15;
const SCORE_SLICK = 10;
const BLOOM_BASE = 0.55;
const BLOOM_FEVER = 0.85;

/**
 * Orchestrator. Explicit update order:
 * input → phase transitions → beat clock → spawner → player → collisions →
 * scoring/feedback → VFX → camera → music scheduling → HUD → diagnostics → render.
 */
export class Game {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new BeatClock();
  private readonly state = new GameState();
  private readonly input = new Input();
  private readonly playerTuning = { ...DEFAULT_PLAYER_TUNING };
  private readonly player = new Player(this.playerTuning);
  private readonly environment: Environment;
  private readonly spawner = new Spawner();
  private readonly collision = new CollisionSystem();
  private readonly cameraRig: CameraRig;
  private readonly vfx = new Vfx();
  private readonly audio = new AudioSystem();
  private readonly hud: Hud;
  private readonly debugTools: DebugTools;
  private readonly loop = new Loop(
    (delta) => this.update(delta),
    () => this.gameRenderer.render(),
  );

  private frame = 0;
  private speed = BASE_SPEED;
  private wasFever = false;
  private runSeed = 1;

  private readonly onVisibilityChange = () => {
    if (document.hidden && this.state.phase === 'playing') this.pause();
  };

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gameRenderer: GameRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.scene = scene;
    this.camera = camera;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cameraRig = new CameraRig(this.camera, reducedMotion);
    this.environment = new Environment(this.scene);
    this.hud = new Hud(() => this.toggleMute());
    this.debugTools = new DebugTools(this.playerTuning, gameRenderer.uniforms);

    const hemisphere = new THREE.HemisphereLight('#cfd7ff', '#2a1052', 1.15);
    const key = new THREE.DirectionalLight('#ffffff', 1.7);
    key.position.set(-4, 7, 9);
    this.scene.add(hemisphere, key);
    this.scene.add(this.environment.root, this.spawner.root, this.vfx.root, this.player.group);

    this.player.onJump = (kind) => {
      this.audio.sfxJump(kind === 'double');
      this.vfx.jumpPuff(this.player.group.position.x, this.player.y);
    };
    this.player.onLand = (fallSpeed) => {
      if (fallSpeed > 4) {
        this.audio.sfxLand(fallSpeed);
        this.vfx.landDust(this.player.group.position.x, fallSpeed * 0.6);
        this.cameraRig.addTrauma(0.07);
      }
    };
    this.player.onSlide = (kind) => {
      if (kind === 'start') {
        this.audio.sfxSlide();
        this.vfx.landDust(this.player.group.position.x, 3);
      } else {
        this.audio.sfxFastFall();
      }
    };

    this.clock.bpm = BASE_BPM;
    this.hud.setMuted(this.audio.muted);
    this.hud.showTitle();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.gameRenderer.resize(this.camera);
    publishDiagnostics();
    diagnostics.backend = gameRenderer.backendName;
    diagnostics.best = this.state.best;
  }

  static async create(canvas: HTMLCanvasElement): Promise<Game> {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 130);
    const renderer = await GameRenderer.create(canvas, scene, camera);
    return new Game(canvas, renderer, scene, camera);
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.input.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
    disposeObject3D(this.scene);
    this.gameRenderer.dispose();
    unpublishDiagnostics();
  }

  // ------------------------------------------------------------- game flow

  private startRun(): void {
    this.runSeed = (this.runSeed * 16807 + this.frame) % 2147483647 || 1;
    this.state.resetRun();
    this.state.setPhase('playing');
    this.clock.reset(BASE_BPM);
    this.speed = BASE_SPEED;
    this.spawner.reset(this.runSeed);
    this.player.reset();
    this.vfx.clear();
    this.cameraRig.reset();
    this.wasFever = false;
    this.gameRenderer.uniforms.bloomStrength.value = BLOOM_BASE;
    void this.audio.unlock().then(() => {
      this.audio.startMusic();
      this.audio.sfxStart();
    });
    this.hud.showRun();
  }

  private die(): void {
    this.state.finishRun();
    this.state.setPhase('dying');
    this.audio.stopMusic();
    this.audio.sfxDeath();
    this.vfx.deathBurst(this.player.group.position.x, this.player.y);
    this.cameraRig.addTrauma(1);
    this.hud.flash('death');
    this.player.startDeath();
    diagnostics.best = this.state.best;
  }

  private pause(): void {
    if (this.state.phase !== 'playing') return;
    this.state.setPhase('paused');
    this.audio.suspend();
    this.hud.showPaused(true);
  }

  private resume(): void {
    this.state.setPhase('playing');
    this.audio.resume();
    this.hud.showPaused(false);
  }

  private toggleMute(): void {
    void this.audio.unlock().then(() => {
      this.hud.setMuted(this.audio.toggleMute());
    });
  }

  // ---------------------------------------------------------------- update

  private update(delta: number): void {
    this.frame += 1;
    this.input.beginFrame();
    if (this.input.muteEdge) this.toggleMute();
    this.gameRenderer.resize(this.camera);

    const state = this.state;
    state.phaseTime += delta;

    switch (state.phase) {
      case 'ready': {
        this.clock.bpm = BASE_BPM;
        this.clock.advance(delta * (READY_SCROLL_SPEED / BASE_SPEED));
        this.environment.update(delta, this.clock, READY_SCROLL_SPEED);
        this.player.idle(delta, READY_SCROLL_SPEED);
        this.vfx.update(delta, READY_SCROLL_SPEED);
        if (this.input.pressed) this.startRun();
        break;
      }
      case 'playing': {
        if (this.input.pauseEdge) {
          this.pause();
          break;
        }
        this.simulate(delta);
        break;
      }
      case 'dying': {
        const slowDelta = delta * DEATH_SLOWMO;
        this.clock.advance(slowDelta);
        this.environment.update(slowDelta, this.clock, this.speed);
        this.spawner.update(this.clock, this.speed, tierForDistance(state.distance), slowDelta, 0, this.player.y);
        this.player.deathUpdate(delta);
        this.vfx.update(delta, this.speed * DEATH_SLOWMO);
        if (state.phaseTime >= DEATH_SECONDS) {
          state.setPhase('dead');
          this.hud.showDead(state.score, state.distance, state.maxCombo, state.best, state.newBest);
        }
        break;
      }
      case 'dead': {
        this.vfx.update(delta, 0);
        if (this.input.pressed && state.phaseTime > RESTART_LOCKOUT) this.startRun();
        break;
      }
      case 'paused': {
        if (this.input.pressed || this.input.pauseEdge) this.resume();
        break;
      }
    }

    this.cameraRig.update(delta, this.player.y, this.state.phase === 'playing' ? this.speed : BASE_SPEED);
    this.hud.update(
      state.score,
      state.combo,
      state.multiplier,
      state.fever,
      state.best,
      state.distance,
      this.clock.bpm,
    );
    this.publishDiagnostics();
  }

  private simulate(delta: number): void {
    const state = this.state;

    this.speed = speedForDistance(state.distance);
    this.clock.bpm = bpmForDistance(state.distance);
    this.clock.advance(delta);
    state.addDistance(this.speed * delta);

    const tier = tierForDistance(state.distance);
    this.environment.update(delta, this.clock, this.speed);
    this.spawner.update(this.clock, this.speed, tier, delta, this.player.group.position.x, this.player.y);
    this.player.update(delta, this.input.pressed, this.input.held, this.input.downHeld, this.speed);

    const hits = this.collision.check(this.player, this.spawner.obstacles, this.spawner.flyers, this.spawner.notes);

    for (const flyer of hits.smashed) {
      flyer.smashed = true;
      flyer.despawn();
      state.addCombo();
      state.score += SCORE_SMASH * state.multiplier;
      this.audio.sfxSmash();
      this.vfx.smashBurst(flyer.group.position.x, flyer.group.position.y);
      this.cameraRig.addPunch(2.2);
      this.cameraRig.addTrauma(0.22);
      this.hud.comboPop();
      this.hud.flash('smash');
    }

    for (const note of hits.collected) {
      note.collected = true;
      note.despawn();
      state.addCombo();
      state.score += SCORE_NOTE * state.multiplier;
      this.audio.sfxNote(state.combo);
      this.vfx.noteSparkle(note.group.position.x, note.group.position.y);
      this.hud.comboPop();
    }

    for (const missed of this.spawner.frameMisses) {
      if (state.breakCombo()) {
        this.audio.sfxMiss();
        this.hud.comboBreak();
      }
      this.vfx.missPuff(missed.group.position.x, missed.group.position.y);
    }

    // Style bonus: still sliding as a laser gate passes overhead.
    if (this.player.sliding && this.spawner.frameBarPasses.length > 0) {
      for (let i = 0; i < this.spawner.frameBarPasses.length; i += 1) {
        state.addCombo();
        state.score += SCORE_SLICK * state.multiplier;
      }
      this.audio.sfxSlick();
      this.vfx.slickSparkle(this.player.group.position.x, this.player.y);
      this.hud.comboPop();
    }

    if (state.fever !== this.wasFever) {
      this.wasFever = state.fever;
      this.audio.setFever(state.fever);
      this.gameRenderer.uniforms.bloomStrength.value = state.fever ? BLOOM_FEVER : BLOOM_BASE;
    }

    this.vfx.ambient(
      delta,
      this.player.group.position.x,
      this.player.y,
      this.player.vy,
      this.speed,
      !this.player.grounded,
      this.player.sliding,
      state.fever,
    );
    this.vfx.update(delta, this.speed);
    this.audio.update(this.clock);

    if (hits.deadly) this.die();
  }

  private publishDiagnostics(): void {
    const counts = this.spawner.counts();
    diagnostics.frame = this.frame;
    diagnostics.phase = this.state.phase;
    diagnostics.score = this.state.score;
    diagnostics.combo = this.state.combo;
    diagnostics.multiplier = this.state.multiplier;
    diagnostics.best = this.state.best;
    diagnostics.distance = this.state.distance;
    diagnostics.speed = this.speed;
    diagnostics.bpm = this.clock.bpm;
    diagnostics.beat = this.clock.beat;
    diagnostics.player.y = this.player.y;
    diagnostics.player.vy = this.player.vy;
    diagnostics.player.grounded = this.player.grounded;
    diagnostics.player.sliding = this.player.sliding;
    diagnostics.player.jumpsUsed = this.player.jumpsUsed;

    diagnostics.nearest.obstacleX = null;
    diagnostics.nearest.obstacleKind = null;
    for (const obstacle of this.spawner.obstacles) {
      const x = obstacle.group.position.x;
      if (x > -0.5 && (diagnostics.nearest.obstacleX === null || x < diagnostics.nearest.obstacleX)) {
        diagnostics.nearest.obstacleX = x;
        diagnostics.nearest.obstacleKind = obstacle.kind;
      }
    }
    diagnostics.nearest.flyerX = null;
    diagnostics.nearest.flyerY = null;
    for (const flyer of this.spawner.flyers) {
      if (!flyer.active || flyer.smashed || flyer.missed) continue;
      const x = flyer.group.position.x;
      if (x > -0.5 && (diagnostics.nearest.flyerX === null || x < diagnostics.nearest.flyerX)) {
        diagnostics.nearest.flyerX = x;
        diagnostics.nearest.flyerY = flyer.group.position.y;
      }
    }
    diagnostics.counts.obstacles = counts.obstacles;
    diagnostics.counts.flyers = counts.flyers;
    diagnostics.counts.notes = counts.notes;
    diagnostics.counts.particles = this.vfx.activeCount;
    diagnostics.counts.droppedSpawns = this.spawner.droppedSpawns;
    const info = this.gameRenderer.info;
    diagnostics.renderer.calls = info.calls;
    diagnostics.renderer.triangles = info.triangles;
    diagnostics.canvas.clientWidth = this.canvas.clientWidth;
    diagnostics.canvas.clientHeight = this.canvas.clientHeight;
    diagnostics.canvas.width = this.canvas.width;
    diagnostics.canvas.height = this.canvas.height;
    diagnostics.canvas.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }
}
