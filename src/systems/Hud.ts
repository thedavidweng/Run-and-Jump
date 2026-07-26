function el<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing HUD element: ${selector}`);
  return found;
}

export class Hud {
  private readonly scoreValue = el('#score-value');
  private readonly multChip = el('#mult-chip');
  private readonly comboWrap = el('#hud-combo');
  private readonly comboValue = el('#combo-value');
  private readonly bestValue = el('#best-value');
  private readonly distValue = el('#dist-value');
  private readonly bpmValue = el('#bpm-value');
  private readonly muteButton = el<HTMLButtonElement>('#mute-button');
  private readonly overlayTitle = el('#overlay-title');
  private readonly overlayDead = el('#overlay-dead');
  private readonly overlayPaused = el('#overlay-paused');
  private readonly deadScore = el('#dead-score');
  private readonly deadDist = el('#dead-dist');
  private readonly deadCombo = el('#dead-combo');
  private readonly deadBest = el('#dead-best');
  private readonly deadNewBest = el('#dead-newbest');
  private readonly hintLine = el('#hint-line');
  private readonly flashEl = el('#flash');

  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private lastScore = -1;
  private lastCombo = -1;
  private lastMult = -1;

  constructor(onMuteClick: () => void) {
    this.muteButton.addEventListener('click', onMuteClick);
  }

  update(score: number, combo: number, multiplier: number, fever: boolean, best: number, distance: number, bpm: number): void {
    if (score !== this.lastScore) {
      this.scoreValue.textContent = String(score);
      this.lastScore = score;
    }
    if (multiplier !== this.lastMult) {
      this.multChip.textContent = `×${multiplier}`;
      this.multChip.classList.toggle('fever', fever);
      this.lastMult = multiplier;
    }
    if (combo !== this.lastCombo) {
      if (combo >= 2) {
        this.comboWrap.classList.remove('hidden');
        this.comboValue.textContent = String(combo);
      } else {
        this.comboWrap.classList.add('hidden');
      }
      this.lastCombo = combo;
    }
    this.bestValue.textContent = String(best);
    this.distValue.textContent = `${Math.floor(distance)}m`;
    this.bpmValue.textContent = String(Math.round(bpm));
  }

  comboPop(): void {
    if (this.reducedMotion) return;
    this.comboValue.animate(
      [
        { transform: 'scale(1.35)', offset: 0 },
        { transform: 'scale(1)', offset: 1 },
      ],
      { duration: 140, easing: 'ease-out' },
    );
  }

  comboBreak(): void {
    if (this.reducedMotion) return;
    this.comboWrap.animate(
      [
        { transform: 'translateX(-50%) translateY(0)', filter: 'none' },
        { transform: 'translateX(-54%) translateY(2px)', filter: 'hue-rotate(90deg)' },
        { transform: 'translateX(-46%) translateY(-2px)', filter: 'hue-rotate(90deg)' },
        { transform: 'translateX(-50%) translateY(0)', filter: 'none' },
      ],
      { duration: 220, easing: 'ease-in-out' },
    );
  }

  flash(kind: 'smash' | 'death'): void {
    if (this.reducedMotion) return;
    this.flashEl.style.background = kind === 'death' ? '#ff2242' : '#ffffff';
    this.flashEl.animate([{ opacity: kind === 'death' ? 0.42 : 0.16 }, { opacity: 0 }], {
      duration: kind === 'death' ? 380 : 150,
      easing: 'ease-out',
    });
  }

  setMuted(muted: boolean): void {
    this.muteButton.classList.toggle('muted', muted);
  }

  showTitle(): void {
    this.overlayTitle.classList.remove('hidden');
    this.overlayDead.classList.add('hidden');
    this.overlayPaused.classList.add('hidden');
  }

  showRun(): void {
    this.overlayTitle.classList.add('hidden');
    this.overlayDead.classList.add('hidden');
    this.overlayPaused.classList.add('hidden');
    this.hintLine.classList.add('faded');
  }

  showDead(score: number, distance: number, maxCombo: number, best: number, newBest: boolean): void {
    this.deadScore.textContent = String(score);
    this.deadDist.textContent = `${Math.floor(distance)}m`;
    this.deadCombo.textContent = String(maxCombo);
    this.deadBest.textContent = String(best);
    this.deadNewBest.classList.toggle('hidden', !newBest);
    this.overlayDead.classList.remove('hidden');
  }

  showPaused(paused: boolean): void {
    this.overlayPaused.classList.toggle('hidden', !paused);
  }
}
