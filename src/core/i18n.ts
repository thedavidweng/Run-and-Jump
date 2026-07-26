export type Locale = 'zh' | 'en';

const LOCALE_KEY = 'run-and-jump.locale';

type Dict = {
  htmlTitle: string;
  canvasAria: string;
  subtitle: string;
  promptStart: string;
  promptRetry: string;
  promptResume: string;
  howtoKeys: string;
  howtoTouch: string;
  howtoGoal: string;
  howtoCombo: string;
  runEnded: string;
  newBest: string;
  paused: string;
  score: string;
  best: string;
  dist: string;
  bpm: string;
  maxCombo: string;
  comboWord: string;
  hintLine: string;
  muteAria: string;
};

const STRINGS: Record<Locale, Dict> = {
  zh: {
    htmlTitle: 'Neon Beat Runner · 霓虹节拍跑者',
    canvasAria: 'Neon Beat Runner 游戏画布',
    subtitle: '霓虹节拍 · 节奏跑酷',
    promptStart: '空格 / 点击 / 触屏 —— 开始',
    promptRetry: '空格 / 点击 —— 再来一局',
    promptResume: '按 P 或点击继续',
    howtoKeys: '<b>按一下</b> 跳跃 · <b>按住</b> 跳更高 · <b>空中再按</b> 二段跳 · <b>↓/S</b> 滑铲与急坠',
    howtoTouch: '触屏:<b>点击</b> 跳跃 · <b>按住屏幕下缘</b> 滑铲',
    howtoGoal:
      '跳过 <span class="c-pink">尖刺</span> 与 <span class="c-purple">高墙</span>，滑过 <span class="c-red">激光门</span>，空中撞碎 <span class="c-orange">节拍妖精</span>，收集 <span class="c-cyan">音符</span>',
    howtoCombo: '踩上节拍，连击越高倍率越高',
    runEnded: '本局结束',
    newBest: '新纪录！',
    paused: '已暂停',
    score: '分数',
    best: '最佳',
    dist: '距离',
    bpm: 'BPM',
    maxCombo: '最高连击',
    comboWord: '连击',
    hintLine: '空格 跳跃 · ↓ 滑铲 · P 暂停 · M 静音',
    muteAria: '切换声音',
  },
  en: {
    htmlTitle: 'Neon Beat Runner',
    canvasAria: 'Neon Beat Runner game canvas',
    subtitle: 'Neon rhythm runner',
    promptStart: 'Space / Click / Tap — Start',
    promptRetry: 'Space / Click — Run it back',
    promptResume: 'Press P or click to resume',
    howtoKeys: '<b>Tap</b> to jump · <b>hold</b> for height · <b>tap in air</b> to double-jump · <b>↓/S</b> to slide & fast-fall',
    howtoTouch: 'Touch: <b>tap</b> to jump · <b>hold the bottom edge</b> to slide',
    howtoGoal:
      'Jump <span class="c-pink">spikes</span> and <span class="c-purple">walls</span>, slide under <span class="c-red">laser gates</span>, smash <span class="c-orange">beat imps</span> mid-air, collect <span class="c-cyan">notes</span>',
    howtoCombo: 'Stay on the beat — higher combo, higher multiplier',
    runEnded: 'RUN ENDED',
    newBest: 'NEW BEST!',
    paused: 'PAUSED',
    score: 'SCORE',
    best: 'BEST',
    dist: 'DIST',
    bpm: 'BPM',
    maxCombo: 'MAX COMBO',
    comboWord: 'COMBO',
    hintLine: 'Space jump · ↓ slide · P pause · M mute',
    muteAria: 'Toggle sound',
  },
};

function detectLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(LOCALE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    /* fall through to browser detection */
  }
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const tag of languages) {
    if (tag.toLowerCase().startsWith('zh')) return 'zh';
    if (tag.toLowerCase().startsWith('en')) return 'en';
  }
  return 'en';
}

/**
 * Tiny DOM-driven i18n. Static elements carry `data-i18n="key"` (textContent)
 * or `data-i18n-html="key"` (innerHTML, for strings with markup); dynamic
 * consumers call `t()` and subscribe to locale changes.
 */
export class I18n {
  locale: Locale = detectLocale();

  private readonly listeners = new Set<(locale: Locale) => void>();

  t<K extends keyof Dict>(key: K): string {
    return STRINGS[this.locale][key];
  }

  setLocale(locale: Locale): void {
    if (locale === this.locale) return;
    this.locale = locale;
    try {
      window.localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      /* non-persistent choice is fine */
    }
    this.apply();
  }

  onChange(listener: (locale: Locale) => void): void {
    this.listeners.add(listener);
  }

  /** Re-render every data-i18n element plus document metadata. */
  apply(): void {
    document.documentElement.lang = this.locale === 'zh' ? 'zh-CN' : 'en';
    document.title = this.t('htmlTitle');

    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
      const key = el.dataset.i18n as keyof Dict;
      if (STRINGS[this.locale][key] !== undefined) el.textContent = this.t(key);
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-html]')) {
      const key = el.dataset.i18nHtml as keyof Dict;
      if (STRINGS[this.locale][key] !== undefined) el.innerHTML = this.t(key);
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
      const key = el.dataset.i18nAria as keyof Dict;
      if (STRINGS[this.locale][key] !== undefined) el.setAttribute('aria-label', this.t(key));
    }
    const canvas = document.querySelector('#game-canvas');
    canvas?.setAttribute('aria-label', this.t('canvasAria'));

    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
      button.classList.toggle('active', button.dataset.lang === this.locale);
    }

    for (const listener of this.listeners) listener(this.locale);
  }
}
