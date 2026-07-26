import type { Player } from '../entities/Player';
import type { Flyer, Note, Obstacle } from '../entities/scrolling';

export type CollisionResult = {
  deadly: Obstacle | null;
  smashed: Flyer[];
  collected: Note[];
};

const playerBox = { cx: 0, cy: 0, hw: 0, hh: 0 };
const obstacleBox = { cx: 0, cy: 0, hw: 0, hh: 0 };

/**
 * Arcade collision: player AABB vs obstacle AABBs, circle-vs-AABB for flyers
 * and notes. Flyers only count as smashed while the player is airborne.
 */
export class CollisionSystem {
  private readonly result: CollisionResult = { deadly: null, smashed: [], collected: [] };

  check(
    player: Player,
    obstacles: readonly Obstacle[],
    flyers: readonly Flyer[],
    notes: readonly Note[],
  ): CollisionResult {
    const result = this.result;
    result.deadly = null;
    result.smashed.length = 0;
    result.collected.length = 0;

    player.getAabb(playerBox);

    for (const obstacle of obstacles) {
      if (!obstacle.active) continue;
      obstacle.getAabb(obstacleBox);
      if (
        Math.abs(playerBox.cx - obstacleBox.cx) <= playerBox.hw + obstacleBox.hw &&
        Math.abs(playerBox.cy - obstacleBox.cy) <= playerBox.hh + obstacleBox.hh
      ) {
        result.deadly = obstacle;
        break;
      }
    }

    for (const flyer of flyers) {
      if (!flyer.active || flyer.smashed || flyer.missed) continue;
      if (!player.grounded && this.circleHitsPlayer(flyer.group.position.x, flyer.group.position.y, flyer.radius)) {
        result.smashed.push(flyer);
      }
    }

    for (const note of notes) {
      if (!note.active || note.collected) continue;
      if (this.circleHitsPlayer(note.group.position.x, note.group.position.y, note.radius)) {
        result.collected.push(note);
      }
    }

    return result;
  }

  private circleHitsPlayer(x: number, y: number, radius: number): boolean {
    const nearestX = Math.max(playerBox.cx - playerBox.hw, Math.min(x, playerBox.cx + playerBox.hw));
    const nearestY = Math.max(playerBox.cy - playerBox.hh, Math.min(y, playerBox.cy + playerBox.hh));
    const dx = x - nearestX;
    const dy = y - nearestY;
    return dx * dx + dy * dy <= radius * radius;
  }
}
