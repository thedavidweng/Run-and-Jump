/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  phase: 'ready' | 'playing' | 'dying' | 'dead' | 'paused';
  backend: 'webgpu' | 'webgl';
  score: number;
  combo: number;
  multiplier: number;
  best: number;
  distance: number;
  speed: number;
  bpm: number;
  beat: number;
  player: {
    y: number;
    vy: number;
    grounded: boolean;
    sliding: boolean;
    jumpsUsed: number;
  };
  nearest: {
    obstacleX: number | null;
    obstacleKind: 'spike' | 'wallLow' | 'wallTall' | 'bar' | null;
    flyerX: number | null;
    flyerY: number | null;
  };
  counts: {
    obstacles: number;
    flyers: number;
    notes: number;
    particles: number;
    droppedSpawns: number;
  };
  renderer: {
    calls: number;
    triangles: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
}
