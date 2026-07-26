import './styles.css';
import { Game } from './game/Game';
import { I18n, type Locale } from './core/i18n';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const i18n = new I18n();
i18n.apply();
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
  button.addEventListener('click', () => {
    i18n.setLocale(button.dataset.lang as Locale);
  });
}

let game: Game | null = null;

async function bootstrap(): Promise<void> {
  game = await Game.create(canvas!);
  game.start();
}

void bootstrap();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose();
  });
}
