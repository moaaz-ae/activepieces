/*
 * Every corner on the page, counted.
 *
 * A screenshot diff cannot tell a radius change from a loading race or a
 * timestamp ticking over, so it is the wrong instrument for a refactor that
 * claims to change no pixels. This reads the computed `border-radius` of every
 * element on every route and prints a histogram, which is immune to render
 * timing and says exactly what the change did.
 *
 *   node scripts/radius-audit.mjs > before.json
 *   node scripts/radius-audit.mjs > after.json
 *   diff before.json after.json
 */

import { chromium } from '@playwright/test';

const BASE = process.env.HARNESS_URL ?? 'http://localhost:4210';

const ROUTES = [
  '/chat',
  '/agents',
  '/impact',
  '/mcp-server',
  'project:/automations',
  'project:/flows',
  'project:/runs',
  'project:/connections',
  'project:/tables',
  'project:/approvals',
  'project:/releases',
  '/platform/setup',
  '/platform/users',
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

/*
 * A fresh context per route.
 *
 * Walking thirteen routes on one page exhausts the renderer — the dev server
 * hands out one request per ES module, which is thousands per navigation, and
 * the tab eventually crashes. A context per route gives the memory back each
 * time, at the cost of re-priming the session (which is free: the harness
 * installs it from `?harness=1` on first load).
 */
async function withPage(run) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/?harness=1`);
    const projectId = await page
      .waitForFunction(() => localStorage.getItem('projectId'))
      .then((handle) => handle.jsonValue());
    return await run(page, projectId);
  } finally {
    await context.close();
  }
}

const histogram = {};

for (const route of ROUTES) {
  histogram[route] = await withPage(async (page, projectId) => {
    const href = route.startsWith('project:')
      ? `/projects/${projectId}${route.slice('project:'.length)}`
      : route;

    await page.goto(`${BASE}${href}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);

    return page.evaluate(() => {
      const seen = {};
      /*
       * Rule 4 — a radius never reaches half the shortest side.
       *
       * At exactly half the shape *is* a pill, and the approach to it is where
       * rounded rectangles start looking accidental. This is the one rule a
       * human cannot check by reading the source, because it depends on the
       * rendered box: the same `rounded-xl` is right on a 36px button and a
       * pill on a 20px badge. So the browser checks it.
       */
      const pills = [];

      for (const element of document.querySelectorAll('*')) {
        const style = getComputedStyle(element);
        const radius = style.borderRadius;
        /* Squares are the overwhelming majority and say nothing. */
        if (radius === '0px' || radius === '') continue;
        seen[radius] = (seen[radius] ?? 0) + 1;

        /* `rounded-full` is a deliberate circle, not a near-pill. */
        const px = parseFloat(radius);
        if (!Number.isFinite(px) || px > 1000) continue;

        const box = element.getBoundingClientRect();
        const shortest = Math.min(box.width, box.height);
        if (shortest < 8) continue;
        const ratio = px / shortest;
        if (ratio <= 0.44) continue;

        pills.push({
          ratio: Number(ratio.toFixed(2)),
          radius,
          box: `${Math.round(box.width)}x${Math.round(box.height)}`,
          className:
            typeof element.className === 'string'
              ? element.className.slice(0, 120)
              : String(element.tagName),
        });
      }

      return {
        histogram: Object.fromEntries(
          Object.entries(seen).sort(([a], [b]) => a.localeCompare(b)),
        ),
        pills: pills
          .sort((a, b) => b.ratio - a.ratio)
          .filter(
            (pill, index, all) =>
              all.findIndex((other) => other.className === pill.className) ===
              index,
          )
          .slice(0, 12),
      };
    });
  });
}

await browser.close();
process.stdout.write(`${JSON.stringify(histogram, null, 1)}\n`);
