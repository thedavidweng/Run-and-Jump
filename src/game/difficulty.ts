/** Continuous difficulty curves keyed off run distance (1 unit = 1 m). */

export const BASE_SPEED = 7.2;
export const MAX_SPEED = 14.5;
export const BASE_BPM = 120;
export const MAX_BPM = 174;

export function speedForDistance(distance: number): number {
  return Math.min(MAX_SPEED, BASE_SPEED + distance * 0.0048);
}

export function bpmForDistance(distance: number): number {
  return Math.min(MAX_BPM, BASE_BPM + distance * 0.036);
}

/** Pattern tier 0..3 unlocks harder charts as the run progresses. */
export function tierForDistance(distance: number): number {
  return Math.min(3, Math.floor(distance / 220));
}

/** Silence between patterns, in beats: breathing room shrinks with tier. */
export function gapBeatsForTier(tier: number): number {
  return tier >= 2 ? 1 : 2;
}
