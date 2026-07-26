import * as THREE from 'three/webgpu';
import { BASE_SPEED } from '../game/difficulty';

const CAM_X = 3.1;
const CAM_Z = 10.8;
const BASE_Y = 2.35;
const BASE_FOV = 50;

/**
 * Portrait/narrow viewports pull the camera back, widen the FOV and shift it
 * left so the runner stays on screen (~30% from the left) with enough
 * look-ahead to react.
 */
function narrowness(aspect: number): number {
  return Math.max(0, 1.5 - aspect);
}

/**
 * Side-view rig: soft vertical follow of the jump arc, speed-driven FOV,
 * smash "punch" kick, and trauma-based shake (skipped for reduced motion).
 */
export class CameraRig {
  private trauma = 0;
  private punch = 0;
  private currentY = BASE_Y;
  private shakeTime = 0;
  private readonly lookTarget = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly reducedMotion: boolean,
  ) {
    camera.position.set(CAM_X, BASE_Y, CAM_Z);
    camera.lookAt(CAM_X + 0.9, BASE_Y - 0.3, 0);
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  addPunch(amount: number): void {
    this.punch = Math.min(6, this.punch + amount);
  }

  reset(): void {
    this.trauma = 0;
    this.punch = 0;
    this.currentY = BASE_Y;
  }

  update(deltaSeconds: number, playerY: number, speed: number): void {
    this.shakeTime += deltaSeconds;
    const targetY = BASE_Y + playerY * 0.24;
    this.currentY = THREE.MathUtils.lerp(this.currentY, targetY, 1 - Math.exp(-deltaSeconds / 0.12));

    this.trauma = Math.max(0, this.trauma - deltaSeconds * 1.35);
    this.punch = Math.max(0, this.punch - this.punch * 7 * deltaSeconds - deltaSeconds);

    let shakeX = 0;
    let shakeY = 0;
    if (!this.reducedMotion && this.trauma > 0) {
      const magnitude = this.trauma * this.trauma * 0.42;
      shakeX = Math.sin(this.shakeTime * 39.3) * magnitude;
      shakeY = Math.cos(this.shakeTime * 32.7) * magnitude * 0.7;
    }

    const narrow = narrowness(this.camera.aspect);
    const camZ = CAM_Z + narrow * 6;
    const fovBase = BASE_FOV + narrow * 10;
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(fovBase / 2)) * camZ * this.camera.aspect;
    const camX = Math.min(CAM_X, halfWidth * 0.42);

    this.camera.position.set(camX + shakeX, this.currentY + shakeY, camZ);
    this.lookTarget.set(camX + 0.9 + shakeX * 0.5, this.currentY - 0.3 + shakeY * 0.5, 0);
    this.camera.lookAt(this.lookTarget);

    const fov = fovBase + (speed - BASE_SPEED) * 0.85 + this.punch;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
