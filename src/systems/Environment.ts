import * as THREE from 'three/webgpu';
import { color, mix, screenUV } from 'three/tsl';
import type { BeatClock } from '../game/BeatClock';
import { PALETTE } from '../assets/palette';
import {
  buildBeatLine,
  buildCloud,
  buildHill,
  buildHorizonGlow,
  buildMountain,
  buildPylon,
  buildStars,
  buildSun,
  buildTower,
  buildTrack,
} from '../assets/factories';

const BEAT_LINE_COUNT = 26;
const PYLON_COUNT = 8;

type ParallaxLayer = {
  group: THREE.Group;
  factor: number;
  span: number;
};

/**
 * Everything that sells speed and depth: gradient sky, synthwave sun, three
 * parallax silhouette layers, the track with beat-synced lane lines, and
 * trackside pylons every four beats.
 */
export class Environment {
  readonly root = new THREE.Group();

  private readonly beatLines: Array<{ mesh: THREE.Mesh; bar: boolean }> = [];
  private readonly barLines: Array<{ mesh: THREE.Mesh; bar: boolean }> = [];
  private readonly pylons: THREE.Group[] = [];
  private readonly layers: ParallaxLayer[] = [];
  private scroll = 0;

  constructor(scene: THREE.Scene) {
    scene.backgroundNode = mix(color(PALETTE.bgBottom), color(PALETTE.bgTop), screenUV.y.clamp(0, 1));
    scene.fog = new THREE.Fog(PALETTE.fog, 20, 58);

    this.root.add(buildTrack());
    this.root.add(buildSun());
    this.root.add(buildHorizonGlow());
    this.root.add(buildStars(70));

    // Beat lines: thin every beat, bright every bar. Positioned per frame off the clock.
    for (let i = 0; i < BEAT_LINE_COUNT; i += 1) {
      const thin = buildBeatLine(false);
      thin.position.z = -0.4;
      this.beatLines.push({ mesh: thin, bar: false });
      this.root.add(thin);
      const bright = buildBeatLine(true);
      bright.position.z = -0.4;
      bright.visible = false;
      this.barLines.push({ mesh: bright, bar: true });
      this.root.add(bright);
    }

    for (let i = 0; i < PYLON_COUNT; i += 1) {
      const pylon = buildPylon(i % 2 === 0);
      pylon.position.z = -3.4;
      this.pylons.push(pylon);
      this.root.add(pylon);
    }

    this.layers.push(this.buildMountainLayer(), this.buildTowerLayer(), this.buildHillLayer(), this.buildCloudLayer());
    for (const layer of this.layers) this.root.add(layer.group);
  }

  private buildMountainLayer(): ParallaxLayer {
    const group = new THREE.Group();
    const span = 110;
    for (let copy = 0; copy < 2; copy += 1) {
      for (let i = 0; i < 6; i += 1) {
        const width = 18 + (i % 3) * 9;
        const height = 7 + ((i * 5) % 4) * 2.4;
        const mountain = buildMountain(width, height, PALETTE.mountainFar);
        mountain.position.set(copy * span + i * (span / 6) + (i % 2) * 5, 0, -34);
        group.add(mountain);
      }
    }
    return { group, factor: 0.12, span };
  }

  private buildTowerLayer(): ParallaxLayer {
    const group = new THREE.Group();
    const span = 96;
    for (let copy = 0; copy < 2; copy += 1) {
      for (let i = 0; i < 9; i += 1) {
        const width = 1.6 + (i % 3) * 1.1;
        const height = 3 + ((i * 7) % 5) * 1.5;
        const tower = buildTower(width, height);
        tower.position.set(copy * span + i * (span / 9) + ((i * 13) % 4), 0, -19);
        group.add(tower);
      }
    }
    return { group, factor: 0.3, span };
  }

  private buildHillLayer(): ParallaxLayer {
    const group = new THREE.Group();
    const span = 80;
    for (let copy = 0; copy < 2; copy += 1) {
      for (let i = 0; i < 5; i += 1) {
        const hill = buildHill(1.8 + (i % 3) * 1.2);
        hill.position.set(copy * span + i * (span / 5) + (i % 2) * 4, 0, -11);
        group.add(hill);
      }
    }
    return { group, factor: 0.55, span };
  }

  private buildCloudLayer(): ParallaxLayer {
    const group = new THREE.Group();
    const span = 130;
    for (let copy = 0; copy < 2; copy += 1) {
      for (let i = 0; i < 6; i += 1) {
        const cloud = buildCloud(1.4 + (i % 3) * 0.8);
        cloud.position.set(copy * span + i * (span / 6) + (i * 11) % 8, 8.5 + (i % 4) * 2.2, -27);
        group.add(cloud);
      }
    }
    return { group, factor: 0.2, span };
  }

  update(deltaSeconds: number, clock: BeatClock, speed: number): void {
    this.scroll += speed * deltaSeconds;

    for (const layer of this.layers) {
      layer.group.position.x = -((this.scroll * layer.factor) % layer.span);
    }

    // Lane lines: one per beat, bars highlighted, all beat-locked to arrival at x=0.
    const baseBeat = Math.floor(clock.beat) - 3;
    for (let i = 0; i < BEAT_LINE_COUNT; i += 1) {
      const beat = baseBeat + i;
      const x = clock.timeUntil(beat) * speed;
      const isBar = ((beat % 4) + 4) % 4 === 0;
      const thin = this.beatLines[i].mesh;
      const bright = this.barLines[i].mesh;
      thin.visible = !isBar && x > -12 && x < 44;
      bright.visible = isBar && x > -12 && x < 44;
      thin.position.x = x;
      bright.position.x = x;
    }

    const basePylon = Math.floor(clock.beat / 4) - 1;
    for (let i = 0; i < PYLON_COUNT; i += 1) {
      const beat = (basePylon + i) * 4;
      const x = clock.timeUntil(beat) * speed;
      this.pylons[i].visible = x > -12 && x < 46;
      this.pylons[i].position.x = x;
    }
  }
}
