import * as THREE from 'three/webgpu';
import { color, mix, uv } from 'three/tsl';
import { PALETTE } from './palette';

/**
 * Procedural mesh factories. Entities own the returned groups; geometry and
 * material cleanup is handled centrally by disposing the scene graph.
 */

function standard(colorHex: string, options: { emissive?: string; emissiveIntensity?: number; roughness?: number; metalness?: number } = {}): THREE.MeshStandardNodeMaterial {
  const material = new THREE.MeshStandardNodeMaterial();
  material.color = new THREE.Color(colorHex);
  material.roughness = options.roughness ?? 0.55;
  material.metalness = options.metalness ?? 0.05;
  if (options.emissive) {
    material.emissive = new THREE.Color(options.emissive);
    material.emissiveIntensity = options.emissiveIntensity ?? 1;
  }
  return material;
}

function unlit(colorHex: string, options: { fog?: boolean; transparent?: boolean; opacity?: number } = {}): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.color = new THREE.Color(colorHex);
  material.fog = options.fog ?? true;
  if (options.transparent) {
    material.transparent = true;
    material.opacity = options.opacity ?? 1;
    material.depthWrite = false;
  }
  return material;
}

// ---------------------------------------------------------------- player

export type PlayerParts = {
  group: THREE.Group;
  visual: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  scarf: THREE.Mesh;
  shadow: THREE.Mesh;
};

export function buildPlayer(): PlayerParts {
  const group = new THREE.Group();
  const visual = new THREE.Group();
  group.add(visual);

  const bodyMat = standard(PALETTE.playerBody, { roughness: 0.4 });
  const accentMat = standard(PALETTE.playerAccent, {
    emissive: PALETTE.playerAccent,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });
  const scarfMat = standard(PALETTE.playerScarf, {
    emissive: PALETTE.playerScarf,
    emissiveIntensity: 0.55,
    roughness: 0.5,
  });
  const darkMat = standard(PALETTE.playerVisor, { roughness: 0.25, metalness: 0.3 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.3, 6, 14), bodyMat);
  body.position.y = 0.62;
  visual.add(body);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.26), accentMat);
  chest.position.set(0.05, 0.66, 0);
  visual.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 20, 16), bodyMat);
  head.position.y = 1.06;
  visual.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.34), darkMat);
  visor.position.set(0.15, 1.08, 0);
  visual.add(visor);

  const hornGeo = new THREE.ConeGeometry(0.07, 0.22, 8);
  const hornL = new THREE.Mesh(hornGeo, accentMat);
  hornL.position.set(-0.06, 1.28, 0.1);
  hornL.rotation.z = -0.4;
  const hornR = hornL.clone();
  hornR.position.z = -0.1;
  visual.add(hornL, hornR);

  const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.2), scarfMat);
  scarf.geometry.translate(-0.17, 0, 0);
  scarf.position.set(-0.12, 0.92, 0);
  scarf.rotation.z = 0.45;
  visual.add(scarf);

  const legGeo = new THREE.BoxGeometry(0.11, 0.36, 0.13);
  legGeo.translate(0, -0.18, 0);
  const legL = new THREE.Group();
  legL.position.set(0, 0.4, 0.09);
  legL.add(new THREE.Mesh(legGeo, darkMat));
  const legR = new THREE.Group();
  legR.position.set(0, 0.4, -0.09);
  legR.add(new THREE.Mesh(legGeo.clone(), darkMat));
  visual.add(legL, legR);

  const armGeo = new THREE.BoxGeometry(0.09, 0.3, 0.1);
  armGeo.translate(0, -0.15, 0);
  const armL = new THREE.Group();
  armL.position.set(0, 0.82, 0.24);
  armL.add(new THREE.Mesh(armGeo, bodyMat));
  const armR = new THREE.Group();
  armR.position.set(0, 0.82, -0.24);
  armR.add(new THREE.Mesh(armGeo.clone(), bodyMat));
  visual.add(armL, armR);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 24),
    unlit('#000000', { transparent: true, opacity: 0.4 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  return { group, visual, legL, legR, armL, armR, scarf, shadow };
}

// ---------------------------------------------------------------- hazards

export function buildSpike(): THREE.Group {
  const group = new THREE.Group();
  const mat = standard(PALETTE.spike, {
    emissive: PALETTE.spikeEmissive,
    emissiveIntensity: 0.65,
    roughness: 0.35,
  });
  const specs: Array<[number, number, number]> = [
    [0, 0.3, 1.05],
    [-0.3, 0.24, 0.72],
    [0.28, 0.2, 0.58],
  ];
  for (const [x, radius, height] of specs) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5), mat);
    cone.position.set(x, height / 2, 0);
    group.add(cone);
  }
  return group;
}

export function buildWall(tall: boolean): THREE.Group {
  const group = new THREE.Group();
  const height = tall ? 2.6 : 1.4;
  const bodyMat = standard(PALETTE.wall, { roughness: 0.5, emissive: PALETTE.wall, emissiveIntensity: 0.18 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, height, 1.6), bodyMat);
  body.position.y = height / 2;
  group.add(body);

  const stripeMat = unlit(PALETTE.wallStripe);
  for (let i = 0; i < (tall ? 3 : 2); i += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.09, 1.64), stripeMat);
    stripe.position.y = height * (0.3 + i * 0.28);
    group.add(stripe);
  }

  const lipMat = unlit(tall ? PALETTE.edgePink : PALETTE.edgeCyan);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 1.68), lipMat);
  lip.position.y = height + 0.035;
  group.add(lip);
  return group;
}

/** Overhead laser gate: slide under it (or thread a double jump over it). */
export function buildBar(): THREE.Group {
  const group = new THREE.Group();

  const postMat = standard(PALETTE.laserPost, { roughness: 0.6 });
  const stripeMat = unlit(PALETTE.wallStripe);
  for (const z of [-1.7, 1.3]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.4, 0.24), postMat);
    post.position.set(0, 1.2, z);
    group.add(post);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.26), stripeMat);
    stripe.position.set(0, 0.35, z);
    group.add(stripe);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), unlit(PALETTE.laser));
    tip.position.set(0, 2.5, z);
    group.add(tip);
  }

  const beamMat = unlit(PALETTE.laser, { transparent: true, opacity: 0.85 });
  const coreMat = unlit('#ffffff');
  for (const y of [0.78, 1.2, 1.62, 2.0]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 3.0), beamMat);
    beam.position.y = y;
    group.add(beam);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 3.0), coreMat);
    core.position.y = y;
    group.add(core);
  }

  // Safe-lane glow on the ground: telegraph that you slide through here.
  const safe = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 3.0),
    unlit(PALETTE.edgeCyan, { transparent: true, opacity: 0.28 }),
  );
  safe.rotation.x = -Math.PI / 2;
  safe.position.y = 0.015;
  group.add(safe);

  return group;
}

export type FlyerParts = { group: THREE.Group; core: THREE.Mesh };

export function buildFlyer(): FlyerParts {
  const group = new THREE.Group();
  const coreMat = standard(PALETTE.flyer, {
    emissive: PALETTE.flyer,
    emissiveIntensity: 0.75,
    roughness: 0.4,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), coreMat);
  group.add(core);

  const spikeGeo = new THREE.ConeGeometry(0.09, 0.26, 6);
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  const up = new THREE.Vector3(0, 1, 0);
  for (const dir of directions) {
    const spike = new THREE.Mesh(spikeGeo, coreMat);
    spike.position.copy(dir).multiplyScalar(0.38);
    spike.quaternion.setFromUnitVectors(up, dir);
    core.add(spike);
  }

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 12, 10),
    unlit(PALETTE.flyerEye),
  );
  eye.position.set(0, 0, 0.3);
  group.add(eye);
  return { group, core };
}

export function buildNote(): THREE.Group {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28, 0),
    standard(PALETTE.note, { emissive: PALETTE.note, emissiveIntensity: 1.5, roughness: 0.2 }),
  );
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), unlit('#ffffff'));
  group.add(shell, core);
  return group;
}

// ------------------------------------------------------------- environment

export function buildTrack(): THREE.Group {
  const group = new THREE.Group();

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(64, 1.5, 6.4),
    standard(PALETTE.track, { roughness: 0.85 }),
  );
  slab.position.set(8, -0.75, -0.4);
  group.add(slab);

  const topMat = new THREE.MeshStandardNodeMaterial();
  topMat.roughness = 0.7;
  topMat.colorNode = mix(color(PALETTE.trackTop), color(PALETTE.track), uv().y);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(64, 6.4), topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.set(8, 0.002, -0.4);
  group.add(top);

  const edgeFront = new THREE.Mesh(new THREE.BoxGeometry(64, 0.09, 0.14), unlit(PALETTE.edgePink));
  edgeFront.position.set(8, 0.045, 2.75);
  const edgeBack = new THREE.Mesh(new THREE.BoxGeometry(64, 0.09, 0.14), unlit(PALETTE.edgeCyan));
  edgeBack.position.set(8, 0.045, -3.55);
  group.add(edgeFront, edgeBack);

  return group;
}

export function buildBeatLine(bar: boolean): THREE.Mesh {
  const material = unlit(bar ? PALETTE.barLine : PALETTE.beatLine, {
    transparent: true,
    opacity: bar ? 0.85 : 0.35,
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(bar ? 0.12 : 0.06, 6.1), material);
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.012;
  return line;
}

export function buildPylon(pink: boolean): THREE.Group {
  const group = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 3.4, 0.16),
    standard('#2a1052', { roughness: 0.7 }),
  );
  column.position.y = 1.7;
  group.add(column);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 8),
    unlit(pink ? PALETTE.edgePink : PALETTE.edgeCyan),
  );
  tip.position.y = 3.5;
  group.add(tip);
  return group;
}

export function buildSun(): THREE.Mesh {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = mix(color(PALETTE.sunBottom), color(PALETTE.sunTop), uv().y);
  material.fog = false;
  const sun = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48), material);
  sun.position.set(3, 9.5, -44);
  return sun;
}

export function buildHorizonGlow(): THREE.Mesh {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = mix(color(PALETTE.horizon), color(PALETTE.bgTop), uv().y);
  material.opacityNode = uv().y.oneMinus().mul(0.55);
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(170, 26), material);
  glow.position.set(10, 9, -46);
  return glow;
}

export function buildMountain(width: number, height: number, colorHex: string): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(0, height);
  shape.lineTo(width / 2, 0);
  shape.closePath();
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), unlit(colorHex));
}

export function buildTower(width: number, height: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, 1.2), unlit(PALETTE.towerMid));
  body.position.y = height / 2;
  group.add(body);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.85, 0.1, 1.24),
    unlit(Math.random() > 0.5 ? PALETTE.edgeCyan : PALETTE.edgePink, { transparent: true, opacity: 0.8 }),
  );
  cap.position.y = height + 0.05;
  group.add(cap);
  return group;
}

export function buildHill(radius: number): THREE.Mesh {
  const hill = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 26, 0, Math.PI),
    unlit(PALETTE.hillNear),
  );
  return hill;
}

export function buildCloud(scale: number): THREE.Mesh {
  const cloud = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 14, 10),
    unlit(PALETTE.cloud, { transparent: true, opacity: 0.32 }),
  );
  cloud.material.fog = false;
  cloud.scale.set(scale, scale * 0.22, 1);
  return cloud;
}

export function buildStars(count: number): THREE.InstancedMesh {
  const material = new THREE.MeshBasicNodeMaterial();
  material.color = new THREE.Color(PALETTE.star);
  material.fog = false;
  const stars = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), material, count);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i += 1) {
    const scale = 0.5 + Math.random() * 1.1;
    matrix.makeScale(scale, scale, 1);
    matrix.setPosition(-70 + Math.random() * 150, 9 + Math.random() * 26, -48 - Math.random() * 4);
    stars.setMatrixAt(i, matrix);
  }
  stars.instanceMatrix.needsUpdate = true;
  stars.frustumCulled = false;
  return stars;
}
