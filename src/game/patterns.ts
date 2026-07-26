/**
 * Beat-grid spawn charts. Event beats are relative to the pattern start and
 * mark the moment the entity ARRIVES at the player, so charts read like sheet
 * music. y is the world height for airborne entities (flyers, notes).
 */

export type SpawnKind = 'spike' | 'wallLow' | 'wallTall' | 'bar' | 'flyerLow' | 'flyerHigh' | 'note';

export type PatternEvent = {
  b: number;
  t: SpawnKind;
  y?: number;
};

export type Pattern = {
  name: string;
  tier: number;
  lengthBeats: number;
  events: PatternEvent[];
};

const GROUND_NOTE_Y = 0.7;

function noteLine(startBeat: number, count: number, y = GROUND_NOTE_Y, stepBeats = 0.5): PatternEvent[] {
  const events: PatternEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    events.push({ b: startBeat + i * stepBeats, t: 'note', y });
  }
  return events;
}

/** Notes tracing a jump arc peaking at `peakBeat`. */
function noteArc(peakBeat: number, peakY: number): PatternEvent[] {
  return [
    { b: peakBeat - 0.5, t: 'note', y: peakY - 0.7 },
    { b: peakBeat, t: 'note', y: peakY },
    { b: peakBeat + 0.5, t: 'note', y: peakY - 0.7 },
  ];
}

export const PATTERNS: Pattern[] = [
  // ---- tier 0: teach single jumps and smashes ----
  { name: 'solo-spike', tier: 0, lengthBeats: 4, events: [{ b: 0.5, t: 'spike' }] },
  { name: 'note-run', tier: 0, lengthBeats: 4, events: noteLine(0, 5) },
  { name: 'solo-flyer', tier: 0, lengthBeats: 4, events: [{ b: 0.5, t: 'flyerLow' }] },
  {
    name: 'spike-arc',
    tier: 0,
    lengthBeats: 4,
    events: [{ b: 1, t: 'spike' }, ...noteArc(1, 1.9)],
  },

  { name: 'solo-bar', tier: 0, lengthBeats: 4, events: [{ b: 0.5, t: 'bar' }] },

  // ---- tier 1: pairs and low walls ----
  { name: 'double-spike', tier: 1, lengthBeats: 6, events: [{ b: 0.5, t: 'spike' }, { b: 2.5, t: 'spike' }] },
  { name: 'flyer-pair', tier: 1, lengthBeats: 6, events: [{ b: 0.5, t: 'flyerLow' }, { b: 1.5, t: 'flyerLow' }] },
  { name: 'low-wall', tier: 1, lengthBeats: 4, events: [{ b: 0.5, t: 'wallLow' }] },
  {
    name: 'spike-then-flyer',
    tier: 1,
    lengthBeats: 6,
    events: [{ b: 0.5, t: 'spike' }, { b: 2.5, t: 'flyerLow' }],
  },
  {
    name: 'note-river',
    tier: 1,
    lengthBeats: 8,
    events: [...noteLine(0, 8), { b: 4, t: 'flyerLow' }],
  },
  {
    name: 'bar-then-spike',
    tier: 1,
    lengthBeats: 6,
    events: [{ b: 0.5, t: 'bar' }, { b: 2.5, t: 'spike' }],
  },

  // ---- tier 2: double jumps and tight timing ----
  { name: 'tall-wall', tier: 2, lengthBeats: 6, events: [{ b: 1, t: 'wallTall' }] },
  {
    name: 'long-jump',
    tier: 2,
    lengthBeats: 6,
    events: [{ b: 0.5, t: 'spike' }, { b: 1.25, t: 'spike' }],
  },
  {
    name: 'sky-arc',
    tier: 2,
    lengthBeats: 6,
    events: [{ b: 1.5, t: 'flyerHigh' }, ...noteArc(1.5, 2.2)],
  },
  {
    name: 'combo-lane',
    tier: 2,
    lengthBeats: 8,
    events: [{ b: 0.5, t: 'spike' }, { b: 2.5, t: 'wallLow' }, { b: 4, t: 'flyerLow' }],
  },
  {
    name: 'flyer-stairs',
    tier: 2,
    lengthBeats: 8,
    events: [{ b: 0.5, t: 'flyerLow' }, { b: 1.5, t: 'flyerHigh' }, { b: 2.5, t: 'flyerLow' }],
  },
  {
    name: 'slide-weave',
    tier: 2,
    lengthBeats: 8,
    events: [{ b: 0.5, t: 'spike' }, { b: 2.5, t: 'bar' }, { b: 4, t: 'spike' }],
  },
  {
    name: 'bar-sky',
    tier: 2,
    lengthBeats: 6,
    events: [{ b: 1, t: 'bar' }, { b: 2.5, t: 'flyerHigh' }],
  },

  // ---- tier 3: gauntlets ----
  {
    name: 'gauntlet',
    tier: 3,
    lengthBeats: 10,
    events: [
      { b: 0.5, t: 'spike' },
      { b: 2, t: 'spike' },
      { b: 4, t: 'wallTall' },
      { b: 6, t: 'flyerLow' },
      { b: 7, t: 'flyerHigh' },
    ],
  },
  {
    name: 'hop-drill',
    tier: 3,
    lengthBeats: 8,
    events: [{ b: 0.5, t: 'spike' }, { b: 1.75, t: 'spike' }, { b: 3, t: 'spike' }],
  },
  {
    name: 'weave',
    tier: 3,
    lengthBeats: 10,
    events: [
      { b: 0.5, t: 'wallLow' },
      { b: 2, t: 'flyerLow' },
      { b: 3.5, t: 'wallLow' },
      { b: 5, t: 'flyerHigh' },
      ...noteArc(5, 2.2),
    ],
  },
  {
    name: 'dino-rush',
    tier: 3,
    lengthBeats: 8,
    events: [{ b: 0.5, t: 'bar' }, { b: 1.75, t: 'bar' }, { b: 3.25, t: 'spike' }],
  },
];

/**
 * Fixed opening chart: teaches jump → smash → collect in order and guarantees
 * a lethal obstacle early (also relied on by the automated fail-path test).
 */
export const INTRO_SEQUENCE: readonly string[] = [
  'solo-spike',
  'solo-spike',
  'solo-flyer',
  'solo-bar',
  'spike-arc',
  'note-run',
];

export function patternByName(name: string): Pattern {
  const found = PATTERNS.find((pattern) => pattern.name === name);
  if (!found) throw new Error(`Unknown pattern: ${name}`);
  return found;
}

/** Weighted pick among unlocked tiers, avoiding immediate repeats. */
export function pickPattern(tier: number, random: () => number, lastName: string): Pattern {
  const unlocked = PATTERNS.filter((pattern) => pattern.tier <= tier);
  const fresh = unlocked.filter((pattern) => pattern.name !== lastName);
  const pool = fresh.length > 0 ? fresh : unlocked;
  // Bias toward the highest unlocked tier so difficulty actually shows up.
  const weighted: Pattern[] = [];
  for (const pattern of pool) {
    const weight = pattern.tier === tier ? 3 : pattern.tier === tier - 1 ? 2 : 1;
    for (let i = 0; i < weight; i += 1) weighted.push(pattern);
  }
  return weighted[Math.floor(random() * weighted.length)];
}
