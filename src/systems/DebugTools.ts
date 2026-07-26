import GUI from 'lil-gui';
import type { PlayerTuning } from '../entities/Player';
import type { PostUniforms } from '../core/Renderer';

/** Live tuning panel, only when the page is loaded with ?debug. */
export class DebugTools {
  private gui: GUI | null = null;

  constructor(playerTuning: PlayerTuning, postUniforms: PostUniforms) {
    if (!new URLSearchParams(window.location.search).has('debug')) return;

    this.gui = new GUI({ title: 'Run & Jump tuning' });
    const jump = this.gui.addFolder('Jump');
    jump.add(playerTuning, 'gravity', 14, 40, 0.5);
    jump.add(playerTuning, 'jumpVelocity', 6, 14, 0.1);
    jump.add(playerTuning, 'doubleJumpVelocity', 5, 13, 0.1);
    jump.add(playerTuning, 'jumpCutoff', 1, 7, 0.1);
    const post = this.gui.addFolder('Post');
    post.add(postUniforms.bloomStrength, 'value', 0, 2, 0.01).name('bloom');
    post.add(postUniforms.vignette, 'value', 0, 1.4, 0.01).name('vignette');
  }

  dispose(): void {
    this.gui?.destroy();
    this.gui = null;
  }
}
