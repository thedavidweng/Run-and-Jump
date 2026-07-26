import * as THREE from 'three/webgpu';

/**
 * Pooled CPU particles rendered through two InstancedMeshes (quads + rings)
 * with additive blending. Fade-out is done by darkening instance color, which
 * under additive blending reads as transparency. Hot path is allocation-free.
 */

const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchPos = new THREE.Vector3();
const scratchColor = new THREE.Color();

class ParticleField {
  readonly mesh: THREE.InstancedMesh;
  active = 0;

  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly life: Float32Array;
  private readonly ttl: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly aspect: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly cr: Float32Array;
  private readonly cg: Float32Array;
  private readonly cb: Float32Array;

  constructor(geometry: THREE.BufferGeometry, readonly capacity: number) {
    const material = new THREE.MeshBasicNodeMaterial();
    material.blending = THREE.AdditiveBlending;
    material.transparent = true;
    material.depthWrite = false;
    material.fog = false;

    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = capacity;
    // instanceColor is lazily created by three on first setColorAt.
    for (let i = 0; i < capacity; i += 1) this.mesh.setColorAt(i, scratchColor.setRGB(0, 0, 0));

    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.ttl = new Float32Array(capacity);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.aspect = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.cr = new Float32Array(capacity);
    this.cg = new Float32Array(capacity);
    this.cb = new Float32Array(capacity);
  }

  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    ttl: number,
    s0: number,
    s1: number,
    color: THREE.Color,
    gravity = 0,
    drag = 0,
    aspect = 1,
  ): void {
    if (this.active >= this.capacity) return;
    const i = this.active;
    this.active += 1;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = 0;
    this.ttl[i] = ttl;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.aspect[i] = aspect;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
    this.cr[i] = color.r;
    this.cg[i] = color.g;
    this.cb[i] = color.b;
  }

  update(deltaSeconds: number, worldVx: number): void {
    let i = 0;
    while (i < this.active) {
      this.life[i] += deltaSeconds;
      if (this.life[i] >= this.ttl[i]) {
        this.swapRemove(i);
        continue;
      }
      const dragFactor = 1 - this.drag[i] * deltaSeconds;
      this.vx[i] *= dragFactor;
      this.vy[i] = this.vy[i] * dragFactor - this.gravity[i] * deltaSeconds;
      this.vz[i] *= dragFactor;
      this.px[i] += (this.vx[i] + worldVx) * deltaSeconds;
      this.py[i] += this.vy[i] * deltaSeconds;
      this.pz[i] += this.vz[i] * deltaSeconds;
      i += 1;
    }

    for (let j = 0; j < this.capacity; j += 1) {
      if (j < this.active) {
        const k = this.life[j] / this.ttl[j];
        const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        const size = THREE.MathUtils.lerp(this.s0[j], this.s1[j], k);
        scratchPos.set(this.px[j], this.py[j], this.pz[j]);
        scratchScale.set(size * this.aspect[j], size, 1);
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
        this.mesh.setMatrixAt(j, scratchMatrix);
        this.mesh.setColorAt(j, scratchColor.setRGB(this.cr[j] * fade, this.cg[j] * fade, this.cb[j] * fade));
      } else {
        scratchScale.set(0, 0, 0);
        scratchMatrix.compose(scratchPos.set(0, -20, 0), scratchQuat, scratchScale);
        this.mesh.setMatrixAt(j, scratchMatrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.active = 0;
  }

  private swapRemove(i: number): void {
    const last = this.active - 1;
    if (i !== last) {
      this.px[i] = this.px[last];
      this.py[i] = this.py[last];
      this.pz[i] = this.pz[last];
      this.vx[i] = this.vx[last];
      this.vy[i] = this.vy[last];
      this.vz[i] = this.vz[last];
      this.life[i] = this.life[last];
      this.ttl[i] = this.ttl[last];
      this.s0[i] = this.s0[last];
      this.s1[i] = this.s1[last];
      this.aspect[i] = this.aspect[last];
      this.gravity[i] = this.gravity[last];
      this.drag[i] = this.drag[last];
      this.cr[i] = this.cr[last];
      this.cg[i] = this.cg[last];
      this.cb[i] = this.cb[last];
    }
    this.active = last;
  }
}

const COLOR_SMASH = new THREE.Color('#ffb347');
const COLOR_SMASH_HOT = new THREE.Color('#fff3c4');
const COLOR_NOTE = new THREE.Color('#00ffd5');
const COLOR_DUST = new THREE.Color('#6f5aa8');
const COLOR_TRAIL_A = new THREE.Color('#00e5ff');
const COLOR_TRAIL_B = new THREE.Color('#ff2e97');
const COLOR_MISS = new THREE.Color('#5a4a7a');
const COLOR_DEATH = new THREE.Color('#ff4c6a');
const COLOR_STREAK = new THREE.Color('#9fb4ff');
const COLOR_CONFETTI = [new THREE.Color('#ff2e97'), new THREE.Color('#00e5ff'), new THREE.Color('#ffd23e')];
const COLOR_GOLD = new THREE.Color('#ffd23e');

export class Vfx {
  readonly root = new THREE.Group();

  private readonly quads: ParticleField;
  private readonly rings: ParticleField;
  private trailTimer = 0;
  private streakTimer = 0;
  private confettiTimer = 0;
  private slideTimer = 0;

  constructor() {
    this.quads = new ParticleField(new THREE.PlaneGeometry(0.15, 0.15), 320);
    this.rings = new ParticleField(new THREE.RingGeometry(0.42, 0.5, 26), 14);
    this.root.add(this.quads.mesh, this.rings.mesh);
  }

  get activeCount(): number {
    return this.quads.active + this.rings.active;
  }

  update(deltaSeconds: number, worldSpeed: number): void {
    this.quads.update(deltaSeconds, -worldSpeed * 0.25);
    this.rings.update(deltaSeconds, 0);
  }

  clear(): void {
    this.quads.clear();
    this.rings.clear();
  }

  jumpPuff(x: number, y: number): void {
    for (let i = 0; i < 5; i += 1) {
      const angle = Math.PI * (0.9 + Math.random() * 1.2);
      this.quads.spawn(x, y + 0.05, 0.3, Math.cos(angle) * 2, 0.6 + Math.random(), 0, 0.32, 0.9, 0.1, COLOR_DUST, 2, 2);
    }
  }

  landDust(x: number, strength: number): void {
    const count = Math.min(10, 4 + Math.floor(strength));
    for (let i = 0; i < count; i += 1) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.quads.spawn(
        x + dir * 0.2,
        0.06,
        0.3,
        dir * (1.5 + Math.random() * 2.2),
        0.4 + Math.random() * 0.8,
        0,
        0.38,
        0.7 + strength * 0.05,
        0.1,
        COLOR_DUST,
        1.5,
        3,
      );
    }
  }

  smashBurst(x: number, y: number): void {
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 3.5 + Math.random() * 4;
      const hot = i % 3 === 0;
      this.quads.spawn(
        x,
        y,
        0.4,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        0,
        0.4 + Math.random() * 0.25,
        hot ? 1.3 : 0.9,
        0.05,
        hot ? COLOR_SMASH_HOT : COLOR_SMASH,
        4,
        2.5,
      );
    }
    this.rings.spawn(x, y, 0.42, 0, 0, 0, 0.36, 0.6, 4.6, COLOR_SMASH_HOT);
  }

  noteSparkle(x: number, y: number): void {
    for (let i = 0; i < 7; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * 1.8;
      this.quads.spawn(x, y, 0.4, Math.cos(angle) * speed, Math.sin(angle) * speed + 1, 0, 0.34, 0.7, 0.04, COLOR_NOTE, 2.5, 3);
    }
    this.rings.spawn(x, y, 0.42, 0, 0, 0, 0.26, 0.3, 2.2, COLOR_NOTE);
  }

  /** Gold flash for sliding clean under a laser gate. */
  slickSparkle(x: number, y: number): void {
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.random() * Math.PI;
      const speed = 1.6 + Math.random() * 2;
      this.quads.spawn(x, y + 0.3, 0.4, Math.cos(angle) * speed, Math.sin(angle) * speed + 0.8, 0, 0.36, 0.7, 0.05, COLOR_GOLD, 2.5, 3);
    }
    this.rings.spawn(x, y + 0.3, 0.42, 0, 0, 0, 0.28, 0.3, 2.6, COLOR_GOLD);
  }

  missPuff(x: number, y: number): void {
    for (let i = 0; i < 5; i += 1) {
      this.quads.spawn(x, y, 0.35, -1 - Math.random(), (Math.random() - 0.3) * 1.4, 0, 0.4, 0.8, 0.15, COLOR_MISS, 1, 2);
    }
  }

  deathBurst(x: number, y: number): void {
    for (let i = 0; i < 26; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 6.5;
      this.quads.spawn(
        x,
        y + 0.55,
        0.5,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed + 2,
        0,
        0.7 + Math.random() * 0.4,
        1.2,
        0.05,
        i % 2 === 0 ? COLOR_DEATH : COLOR_SMASH_HOT,
        6,
        1.6,
      );
    }
    this.rings.spawn(x, y + 0.55, 0.5, 0, 0, 0, 0.55, 0.6, 7.5, COLOR_DEATH);
  }

  /** Continuous effects driven from the game loop. */
  ambient(
    deltaSeconds: number,
    playerX: number,
    playerY: number,
    vy: number,
    speed: number,
    airborne: boolean,
    sliding: boolean,
    fever: boolean,
  ): void {
    this.trailTimer -= deltaSeconds;
    if (this.trailTimer <= 0 && (airborne || speed > 9 || fever)) {
      this.trailTimer = 0.03;
      const color = Math.random() > 0.5 ? COLOR_TRAIL_A : COLOR_TRAIL_B;
      this.quads.spawn(playerX - 0.25, playerY + 0.55 + (Math.random() - 0.5) * 0.5, -0.15, -speed * 0.45, vy * 0.2, 0, 0.3, 0.55, 0.02, color, 0, 4, 2.6);
    }

    this.slideTimer -= deltaSeconds;
    if (sliding && this.slideTimer <= 0) {
      this.slideTimer = 0.05;
      this.quads.spawn(
        playerX - 0.4,
        0.08,
        0.3,
        -1.5 - Math.random() * 1.5,
        0.6 + Math.random() * 0.9,
        0,
        0.34,
        0.6,
        0.08,
        COLOR_DUST,
        1.8,
        2.5,
      );
    }

    this.streakTimer -= deltaSeconds;
    if (this.streakTimer <= 0 && speed > 9.5) {
      this.streakTimer = Math.max(0.03, 0.24 - speed * 0.012);
      this.quads.spawn(
        14 + Math.random() * 6,
        0.6 + Math.random() * 3.6,
        -1.5 + Math.random() * 3,
        -speed * 2.6,
        0,
        0,
        0.5,
        0.09,
        0.05,
        COLOR_STREAK,
        0,
        0,
        22,
      );
    }

    if (fever) {
      this.confettiTimer -= deltaSeconds;
      if (this.confettiTimer <= 0) {
        this.confettiTimer = 0.08;
        const color = COLOR_CONFETTI[Math.floor(Math.random() * COLOR_CONFETTI.length)];
        this.quads.spawn(
          Math.random() * 16 - 2,
          5.5 + Math.random() * 1.5,
          -1 + Math.random() * 2,
          -speed * 0.5,
          -1.2 - Math.random(),
          0,
          1.6,
          0.32,
          0.18,
          color,
          0.4,
          0.5,
        );
      }
    }
  }
}
