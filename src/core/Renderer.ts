import * as THREE from 'three/webgpu';
import { float, pass, screenUV, uniform, vec2 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export type PostUniforms = {
  bloomStrength: { value: number };
  vignette: { value: number };
};

export class GameRenderer {
  readonly renderer: THREE.WebGPURenderer;
  readonly post: THREE.RenderPipeline;
  readonly backendName: 'webgpu' | 'webgl';
  readonly uniforms: PostUniforms;

  private constructor(
    renderer: THREE.WebGPURenderer,
    post: THREE.RenderPipeline,
    backendName: 'webgpu' | 'webgl',
    uniforms: PostUniforms,
  ) {
    this.renderer = renderer;
    this.post = post;
    this.backendName = backendName;
    this.uniforms = uniforms;
  }

  static async create(
    canvas: HTMLCanvasElement,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ): Promise<GameRenderer> {
    let renderer: THREE.WebGPURenderer;
    try {
      renderer = new THREE.WebGPURenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
      await renderer.init();
    } catch {
      // navigator.gpu may exist while adapter creation fails (some WebKit
      // builds) — retry once on the WebGL2 backend.
      renderer = new THREE.WebGPURenderer({
        canvas,
        antialias: true,
        forceWebGL: true,
      });
      await renderer.init();
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    const backend = renderer.backend as { isWebGPUBackend?: boolean };
    const backendName = backend.isWebGPUBackend ? 'webgpu' : 'webgl';

    const vignette = uniform(0.42);

    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode();
    const bloomNode = bloom(sceneColor, 0.55, 0.35, 0.72);

    const edge = screenUV.sub(vec2(0.5, 0.5)).length();
    const vignetteFactor = float(1.0).sub(edge.mul(edge).mul(vignette)).clamp(0.0, 1.0);

    const post = new THREE.RenderPipeline(renderer);
    post.outputNode = sceneColor.add(bloomNode).mul(vignetteFactor);

    return new GameRenderer(renderer, post, backendName, {
      bloomStrength: bloomNode.strength as unknown as { value: number },
      vignette: vignette as unknown as { value: number },
    });
  }

  /** Match drawing buffer to CSS size; returns true when a resize happened. */
  resize(camera: THREE.PerspectiveCamera, maxDpr = 2): boolean {
    const canvas = this.renderer.domElement;
    const width = Math.max(1, Math.floor(canvas.clientWidth));
    const height = Math.max(1, Math.floor(canvas.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const bufferWidth = Math.floor(width * dpr);
    const bufferHeight = Math.floor(height * dpr);
    const needsResize = canvas.width !== bufferWidth || canvas.height !== bufferHeight;

    if (needsResize) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    return needsResize;
  }

  render(): void {
    this.post.render();
  }

  get info(): { calls: number; triangles: number } {
    const info = this.renderer.info;
    return { calls: info.render.calls, triangles: info.render.triangles };
  }

  dispose(): void {
    this.post.dispose();
    this.renderer.dispose();
  }
}
