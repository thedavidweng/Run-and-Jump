/**
 * Single mutable diagnostics object published on window for tests and
 * debugging. Mutated in place every frame to stay allocation-free.
 */
export const diagnostics: ThreeGameDiagnostics = {
  frame: 0,
  phase: 'ready',
  backend: 'webgl',
  score: 0,
  combo: 0,
  multiplier: 1,
  best: 0,
  distance: 0,
  speed: 0,
  bpm: 0,
  beat: 0,
  player: { y: 0, vy: 0, grounded: true, sliding: false, jumpsUsed: 0 },
  nearest: { obstacleX: null, obstacleKind: null, flyerX: null, flyerY: null },
  counts: { obstacles: 0, flyers: 0, notes: 0, particles: 0, droppedSpawns: 0 },
  renderer: { calls: 0, triangles: 0 },
  canvas: { clientWidth: 0, clientHeight: 0, width: 0, height: 0, dpr: 1 },
};

export function publishDiagnostics(): void {
  window.__THREE_GAME_DIAGNOSTICS__ = diagnostics;
}

export function unpublishDiagnostics(): void {
  window.__THREE_GAME_DIAGNOSTICS__ = undefined;
}
