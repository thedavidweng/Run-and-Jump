#!/usr/bin/env node
/**
 * Automated playtest probe: starts a run and auto-jumps using the
 * nearest-entity diagnostics the game publishes. Captures screenshots and a
 * final report. Usage: node scripts/playtest.mjs [--seconds 30]
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const secondsArg = process.argv.indexOf('--seconds');
const seconds = secondsArg > -1 ? Number(process.argv[secondsArg + 1]) : 30;
await mkdir('artifacts/playtest', { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto('http://127.0.0.1:5188/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 30, undefined, { timeout: 30_000 });

// Warm up shader pipelines: run one throwaway second of play, then restart.
await page.keyboard.press('Space');
await page.waitForTimeout(2500);

// In-page autopilot at frame granularity: far more precise than CDP round-trips.
await page.evaluate(() => {
  const stats = { deaths: 0, smashes: 0, presses: 0, maxCombo: 0, maxMult: 1 };
  window.__AUTOPILOT_STATS__ = stats;
  let lastCombo = 0;
  let lastPhase = 'ready';
  let cooldown = 0;
  const press = (holdMs) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    }, holdMs);
    stats.presses += 1;
  };
  const slide = (holdMs) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true }));
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown', bubbles: true }));
    }, holdMs);
    stats.slides = (stats.slides ?? 0) + 1;
  };
  const tick = () => {
    const d = window.__THREE_GAME_DIAGNOSTICS__;
    if (!d) return requestAnimationFrame(tick);
    cooldown -= 1;
    if (d.phase === 'dead') {
      if (lastPhase !== 'dead') stats.deaths += 1;
      if (cooldown <= 0) {
        press(40);
        cooldown = 30;
      }
    } else if (d.phase === 'playing' && cooldown <= 0) {
      if (d.combo > lastCombo) stats.smashes += 1;
      lastCombo = d.combo;
      stats.maxCombo = Math.max(stats.maxCombo, d.combo);
      stats.maxMult = Math.max(stats.maxMult, d.multiplier);
      const timeAhead = (x) => x / d.speed;
      const isBar = d.nearest.obstacleKind === 'bar';
      const obstacleClose =
        d.nearest.obstacleX !== null && timeAhead(d.nearest.obstacleX) < 0.34 && timeAhead(d.nearest.obstacleX) > 0.02;
      const barClose = isBar && d.nearest.obstacleX !== null && timeAhead(d.nearest.obstacleX) < 0.45;
      const tall = d.nearest.obstacleKind === 'wallTall';
      const flyerClose = d.nearest.flyerX !== null && timeAhead(d.nearest.flyerX) < 0.42 && d.nearest.flyerY < 2.2;
      const flyerHigh = d.nearest.flyerX !== null && timeAhead(d.nearest.flyerX) < 0.5 && d.nearest.flyerY >= 2.2;
      if (d.player.grounded && barClose) {
        slide(650);
        cooldown = 14;
      } else if (d.player.grounded && ((obstacleClose && !isBar) || flyerClose)) {
        press(tall ? 300 : 240);
        cooldown = 10;
      } else if (!d.player.grounded && d.player.jumpsUsed < 2 && (tall || flyerHigh) && d.player.vy < 2) {
        press(200);
        cooldown = 12;
      }
    }
    lastPhase = d.phase;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const shots = [Math.floor(seconds * 0.35), Math.floor(seconds * 0.7), seconds - 2];
const t0 = Date.now();
let shotIndex = 0;
while ((Date.now() - t0) / 1000 < seconds) {
  const elapsed = (Date.now() - t0) / 1000;
  if (shotIndex < shots.length && elapsed >= shots[shotIndex]) {
    const state = await page.evaluate(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return { phase: d.phase, distance: Math.round(d.distance), combo: d.combo, mult: d.multiplier, score: d.score };
    });
    const file = `artifacts/playtest/run-${shots[shotIndex]}s.png`;
    await page.screenshot({ path: file });
    console.log('shot:', file, JSON.stringify(state));
    shotIndex += 1;
  }
  await page.waitForTimeout(200);
}

const final = await page.evaluate(() => {
  const d = window.__THREE_GAME_DIAGNOSTICS__;
  return {
    stats: window.__AUTOPILOT_STATS__,
    phase: d.phase,
    score: d.score,
    best: d.best,
    distance: Math.round(d.distance),
    speed: Number(d.speed.toFixed(1)),
    bpm: Math.round(d.bpm),
    counts: d.counts,
    backend: d.backend,
  };
});
console.log('final:', JSON.stringify(final, null, 2));
console.log('errors:', JSON.stringify(errors));
await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
