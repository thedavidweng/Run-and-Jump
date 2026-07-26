const JUMP_CODES = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter']);
const DOWN_CODES = new Set(['ArrowDown', 'KeyS']);
/** Touch presses in the bottom strip of the screen mean "slide", not "jump". */
const TOUCH_SLIDE_ZONE = 0.72;

/**
 * Two-intent collector. Keyboard (Space/Up/W/Enter), mouse, and touch taps
 * map to "press" (jump); ArrowDown/S and touch-holds on the bottom edge map
 * to "down" (slide / fast-fall). Edge flags are latched between frames.
 */
export class Input {
  /** True on the frame a press started (edge). */
  pressed = false;
  /** True while the jump button/pointer is held. */
  held = false;
  /** True while a "down" input (slide) is held. */
  downHeld = false;
  /** Edge flags for secondary keys, valid for one frame. */
  muteEdge = false;
  pauseEdge = false;

  private pressLatch = 0;
  private muteLatch = 0;
  private pauseLatch = 0;
  private keyHeld = false;
  private keyDownHeld = false;
  private pointerHeld = false;
  private slidePointers = new Set<number>();

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (JUMP_CODES.has(event.code)) {
      event.preventDefault();
      if (!event.repeat) {
        this.pressLatch += 1;
        this.keyHeld = true;
      }
    } else if (DOWN_CODES.has(event.code)) {
      event.preventDefault();
      this.keyDownHeld = true;
    } else if (event.code === 'KeyM' && !event.repeat) {
      this.muteLatch += 1;
    } else if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) {
      this.pauseLatch += 1;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (JUMP_CODES.has(event.code)) {
      this.keyHeld = false;
    } else if (DOWN_CODES.has(event.code)) {
      this.keyDownHeld = false;
    }
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('[data-ui]')) return;
    event.preventDefault();
    if (event.pointerType === 'touch' && event.clientY > window.innerHeight * TOUCH_SLIDE_ZONE) {
      this.slidePointers.add(event.pointerId);
      return;
    }
    this.pressLatch += 1;
    this.pointerHeld = true;
  };

  private readonly onPointerEnd = (event: PointerEvent) => {
    if (this.slidePointers.delete(event.pointerId)) return;
    this.pointerHeld = false;
  };

  private readonly onBlur = () => {
    this.keyHeld = false;
    this.keyDownHeld = false;
    this.pointerHeld = false;
    this.slidePointers.clear();
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerEnd);
    window.addEventListener('pointercancel', this.onPointerEnd);
    window.addEventListener('blur', this.onBlur);
  }

  /** Latch edges into per-frame flags. Call exactly once at the top of each update. */
  beginFrame(): void {
    this.pressed = this.pressLatch > 0;
    this.muteEdge = this.muteLatch > 0;
    this.pauseEdge = this.pauseLatch > 0;
    this.pressLatch = 0;
    this.muteLatch = 0;
    this.pauseLatch = 0;
    this.held = this.keyHeld || this.pointerHeld;
    this.downHeld = this.keyDownHeld || this.slidePointers.size > 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerEnd);
    window.removeEventListener('pointercancel', this.onPointerEnd);
    window.removeEventListener('blur', this.onBlur);
  }
}
