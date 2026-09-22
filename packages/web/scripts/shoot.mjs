/*
 * Screenshots, one scenario at a time — for any app that can describe itself.
 *
 * Walks routes × scenarios × themes against a running dev server and writes a
 * PNG per combination, plus a manifest that says what each picture is and why
 * any missing one is missing. Before and after a design commit, the diff
 * between two runs is the change — which only works because the fixtures are
 * seeded, so identical input always produces identical data.
 *
 * The engine knows nothing about the app. Everything app-specific — the
 * scenarios and how to switch them, the routes and how to address them, how to
 * fake a session — lives in a TARGET module (see `shoot.target.mjs` beside this
 * file for the shipping app, and `concept/scripts/shoot.target.mjs` for the
 * redesign). One engine, two targets: the two sides of a comparison are shot
 * by the same code, so the comparison cannot drift because the halves used
 * different tooling.
 *
 *   node scripts/shoot.mjs                              the review set
 *   node scripts/shoot.mjs --target ../../concept/scripts/shoot.target.mjs
 *   node scripts/shoot.mjs --out before                 into a named directory
 *   node scripts/shoot.mjs --scenario typical           just one scenario
 *   node scripts/shoot.mjs --route platform-users       one route (by name or path); comma-separate for several
 *   node scripts/shoot.mjs --group admin                just one group of routes
 *   node scripts/shoot.mjs --all                        every scenario, not the review set
 *   node scripts/shoot.mjs --no-states                  the resting page only, no dialogs
 *   node scripts/shoot.mjs --keep --route platform-ai   re-shoot one route into an existing
 *                                                       run, leaving the rest in place
 *   node scripts/shoot.mjs --strict                     fail unmodelled endpoints instead
 *                                                       of guessing — diagnosis, not review
 *   node scripts/shoot.mjs --workers 4                  how many contexts shoot at once
 *
 * A route may declare STATES: named sequences of clicks that put the screen
 * into a state with no URL of its own — the invite dialog, the upgrade prompt,
 * a detail sheet. Each state is shot as its own picture, `route--state.png`,
 * and named the same on both sides so the contact sheet can pair them.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const has = (name) => args.includes(`--${name}`);

const BASE = process.env.HARNESS_URL ?? 'http://localhost:4210';

/* The target: default to the shipping app's description beside this file. */
const targetPath = path.resolve(flag('target', path.join(import.meta.dirname, 'shoot.target.mjs')));
const target = (await import(pathToFileURL(targetPath).href)).default;

const THEMES = flag('themes', (target.themes ?? ['light', 'dark']).join(',')).split(',');

/*
 * Wait for the screen to stop changing.
 *
 * `networkidle` fires while a route is still suspended behind its lazy chunk,
 * and matching on a spinner class ties the script to markup it is meant to be
 * reviewing. Watching the rendered text settle works on every route and
 * survives the redesign, which is the whole point.
 */
async function settle(page, { timeout = 15_000, quietFor = 600, minChars = 40 } = {}) {
  const deadline = Date.now() + timeout;
  let previous = '';
  let stableSince = Date.now();

  for (;;) {
    const text = await page.evaluate(
      () => document.body.innerText.length + ':' + document.body.innerText.slice(0, 200),
    );
    if (text !== previous) {
      previous = text;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= quietFor && text.length > minChars) {
      return;
    }
    if (Date.now() > deadline) throw new Error('did not settle');
    await page.waitForTimeout(150);
  }
}

/*
 * Is there anything on the screen?
 *
 * Measured rather than assumed: a blank page still has a <body> and still
 * reports a load event. A rendered app puts hundreds of boxes on the page; a
 * spinner puts one.
 */
async function hasPaint(page, { minBoxes = 40, minChars = 40 } = {}) {
  return page.evaluate(
    ([boxes, chars]) => {
      const main = document.body;
      if (!main || main.innerText.trim().length < chars) return false;
      const painted = [...document.querySelectorAll('*')].filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 4 && box.height > 4;
      });
      return painted.length > boxes;
    },
    [minBoxes, minChars],
  );
}

/* Local dev server, not a cold CI runner: a route that has not answered in
   45s is stuck, not slow. */
const NAV_TIMEOUT = 45_000;
const ROUTE_DEADLINE = 150_000;
const STEP_TIMEOUT = 8_000;

/* The adapter records every unmodelled endpoint on the window, so the run can
   report them rather than leaving them in a console nobody reads. A target
   without a fixture layer simply reports none. */
async function readGaps(page) {
  return page
    .evaluate(() => ({
      missing: window.__AP_HARNESS_GAPS__ ?? [],
      shapeErrors: window.__AP_HARNESS_SHAPE_ERRORS__ ?? [],
    }))
    .catch(() => ({ missing: [], shapeErrors: [] }));
}

function withDeadline(work, ms, label) {
  let timer;
  return Promise.race([
    work,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/*
 * One step of a state: a click, a key press, a wait. Selectors are Playwright
 * locator strings — `role=button[name="Invite"]`, `text=Upgrade`,
 * `button:has-text("SAML")` — so a state can be described without knowing the
 * markup, only what a person would see.
 */
async function runStep(page, step) {
  if (typeof step === 'string') step = { click: step };
  if (step.click) {
    await page.locator(step.click).first().click({ timeout: STEP_TIMEOUT });
  }
  if (step.hover) {
    await page.locator(step.hover).first().hover({ timeout: STEP_TIMEOUT });
  }
  if (step.fill) {
    await page.locator(step.fill.selector).first().fill(step.fill.value, { timeout: STEP_TIMEOUT });
  }
  if (step.press) {
    await page.keyboard.press(step.press);
  }
  if (step.waitFor) {
    await page.locator(step.waitFor).first().waitFor({ timeout: STEP_TIMEOUT });
  }
  if (step.wait) {
    await page.waitForTimeout(step.wait);
  }
}

/* A picture, and the checks that decide whether to keep it. */
async function capture(page, { file, paint, record, sink, consoleErrors, failedRequests }) {
  const unique = (values) => [...new Set(values)];
  let ok = false;
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {
    try {
      await settle(page, paint ? { minChars: paint.minChars } : undefined);
    } catch {
      /* fall through to the paint check */
    }
    ok = await hasPaint(page, paint);
    if (!ok && attempt === 0) await page.waitForTimeout(1500);
  }

  const gaps = await readGaps(page);
  gaps.missing.forEach((gap) => sink.gaps.add(gap));
  gaps.shapeErrors.forEach((gap) => sink.shapeErrors.add(gap));
  if (gaps.missing.length > 0) record.unfixturedEndpoints = gaps.missing;
  if (gaps.shapeErrors.length > 0) record.fixtureShapeErrors = gaps.shapeErrors;

  if (!ok) {
    const diagnosis = [];
    const errors = unique(consoleErrors);
    const failures = unique(failedRequests);
    if (errors.length > 0) diagnosis.push(`console: ${errors.slice(0, 3).join(' | ')}`);
    if (failures.length > 0) diagnosis.push(`requests: ${failures.slice(0, 3).join(' | ')}`);
    if (diagnosis.length === 0) {
      diagnosis.push('rendered nothing — no console errors, no failed requests');
    }
    sink.problems.push(`${record.href}${record.state === 'default' ? '' : ` [${record.state}]`} — ${diagnosis.join('; ')}`);
    sink.results.push({ ...record, status: 'blank', diagnosis });
    return false;
  }

  /* A screenshot of the whole page, clipped to the viewport: dialogs and
     sheets are what the states exist to show, and they are viewport-bound. */
  await page.screenshot({ path: file, fullPage: false });
  sink.results.push({ ...record, status: 'captured', file: path.basename(file) });
  return true;
}

/*
 * One browser context, working through the passes it was given.
 *
 * A pass is one (scenario, theme): the target writes the scenario into the
 * page, and every route is then shot against it. Contexts are independent —
 * their own session, their own storage — which is what makes running several
 * of them at once safe.
 */
async function runPasses({ browser, out, passes, filters, sink }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);

  const consoleErrors = [];
  const failedRequests = [];

  page.on('pageerror', (error) => consoleErrors.push(error.message.split('\n')[0]));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().split('\n')[0]);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    failedRequests.push(
      `${request.url().replace(BASE, '')} — ${failure ? failure.errorText : 'failed'}`,
    );
  });

  /* Once per context: whatever the target needs before any route will render —
     a fake session, a project id, nothing at all. */
  const ctx = (await target.prime?.(page, { base: BASE })) ?? {};

  for (const { name, scenario, theme } of passes) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await target.apply(page, { base: BASE, scenario, scenarioName: name, theme, ctx });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }

    for (const route of target.routes) {
      if (filters.route && !filters.route.includes(route.path) && !filters.route.includes(route.name))
        continue;
      if (filters.group && filters.group !== (route.group ?? '')) continue;
      if (route.scenarios && !route.scenarios.includes(name)) continue;

      const href = target.href(route, { ctx, filters, scenarioName: name });
      /* The auth screens are one small card, well under the element count a
         dashboard puts on the page, so the blank check has to be told what
         "rendered" means there. */
      const paint =
        route.paint ?? (route.sparse ? { minBoxes: 8, minChars: 10 } : target.paint);
      const base = {
        scenario: name,
        theme,
        route: route.name,
        href,
        ...(route.pairs ? { pairs: route.pairs } : {}),
        ...(route.note ? { note: route.note } : {}),
      };
      consoleErrors.length = 0;
      failedRequests.length = 0;

      /* One route must never take the run with it, and must never hang it
         either. Recorded against the route, reported at the end, carry on. */
      try {
        await withDeadline(
          (async () => {
            for (let attempt = 0; ; attempt++) {
              try {
                await page.goto(`${BASE}${href}`);
                break;
              } catch (error) {
                if (attempt >= 1) {
                  sink.problems.push(`${href} — ${String(error).split('\n')[0]}`);
                  break;
                }
                await page.waitForTimeout(2000);
              }
            }
            await page.waitForLoadState('networkidle').catch(() => {});

            /* A one-off click that is part of the route itself (the SAML form
               is behind a button) rather than a state of its own. */
            if (route.click) {
              await runStep(page, route.click).catch((error) =>
                sink.problems.push(`${href} — click: ${String(error).split('\n')[0]}`),
              );
            }

            const shot = await capture(page, {
              file: path.join(out, `${name}-${theme}-${route.name}.png`),
              paint,
              record: { ...base, state: 'default' },
              sink,
              consoleErrors,
              failedRequests,
            });

            if (!shot || filters.noStates) return;

            for (const state of route.states ?? []) {
              if (state.scenarios && !state.scenarios.includes(name)) continue;
              const record = { ...base, state: state.name };
              consoleErrors.length = 0;
              failedRequests.length = 0;
              try {
                for (const step of state.steps) await runStep(page, step);
                await capture(page, {
                  file: path.join(out, `${name}-${theme}-${route.name}--${state.name}.png`),
                  paint,
                  record,
                  sink,
                  consoleErrors,
                  failedRequests,
                });
              } catch (error) {
                const why = String(error).split('\n')[0];
                sink.problems.push(`${href} [${state.name}] — ${why}`);
                sink.results.push({ ...record, status: 'blank', diagnosis: [`state step failed: ${why}`] });
              }
              /* Back to the resting page for the next state, whatever this one
                 left open — a dialog, a sheet, a menu. */
              if (route.states.length > 1) {
                await page.keyboard.press('Escape').catch(() => {});
                await page.goto(`${BASE}${href}`).catch(() => {});
                await page.waitForLoadState('networkidle').catch(() => {});
              }
            }
          })(),
          ROUTE_DEADLINE,
          href,
        );
      } catch (error) {
        const why = String(error).split('\n')[0];
        sink.problems.push(`${href} — ${why}`);
        sink.results.push({ ...base, state: 'default', status: 'blank', diagnosis: [why] });
        if (page.isClosed()) {
          sink.problems.push('the page closed; the rest of this context was skipped');
          return;
        }
        await target.recover?.(page, { base: BASE, ctx }).catch(() => {});
      }
    }
  }

  await context.close();
}

async function main() {
  const out = path.resolve(flag('out', 'screenshots'));
  /*
   * A run replaces the directory, so two runs never mix. `--keep` is the
   * exception for repairing one route: the earlier manifest is read, its rows
   * for the routes shot now are dropped, and the rest survive untouched.
   */
  const keep = has('keep');
  let previous = [];
  if (keep) {
    previous = await readFile(path.join(out, 'manifest.json'), 'utf8')
      .then((text) => JSON.parse(text).results ?? [])
      .catch(() => []);
  } else {
    await rm(out, { recursive: true, force: true });
  }
  await mkdir(out, { recursive: true });

  const onlyScenario = flag('scenario');
  const wantsAll = has('all');
  const strict = has('strict');
  const filters = {
    route: flag('route')?.split(','),
    group: flag('group'),
    strict,
    noStates: has('no-states'),
  };
  /*
   * Default one context. Against the Vite dev server, three contexts were
   * SLOWER than one (585s vs 427s): a cold load pulls thousands of unbundled
   * modules over HTTP, so the dev server, not the CPU, is the ceiling. Raise
   * this when the run serves a built bundle.
   */
  const workers = Math.max(1, Number(flag('workers', '1')));

  const review = target.reviewScenarios ?? Object.keys(target.scenarios);
  const chosen = Object.entries(target.scenarios).filter(([name]) => {
    if (onlyScenario) return onlyScenario.split(',').includes(name);
    if (wantsAll) return true;
    return review.includes(name);
  });

  const passes = chosen.flatMap(([name, scenario]) =>
    THEMES.map((theme) => ({ name, scenario, theme })),
  );

  if (passes.length === 0) {
    process.stdout.write('no scenarios matched\n');
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });

  const problems = [];
  const results = [];
  const gaps = new Set();
  const shapeErrors = new Set();
  const sink = { problems, results, gaps, shapeErrors };

  const lanes = Math.min(workers, passes.length);
  const shards = Array.from({ length: lanes }, (_, index) =>
    passes.filter((_, position) => position % lanes === index),
  );
  process.stdout.write(
    `    ${target.name}: ${passes.length} pass(es) over ${lanes} context(s)` +
      `${wantsAll || onlyScenario ? '' : ' — review set, --all for every scenario'}\n`,
  );

  await Promise.all(
    shards.map((shard) =>
      runPasses({ browser, out, passes: shard, filters, sink }).catch((error) =>
        problems.push(`a context failed — ${String(error).split('\n')[0]}`),
      ),
    ),
  );

  await browser.close();

  if (keep) {
    const shot = new Set(results.map((result) => `${result.scenario}|${result.theme}|${result.route}`));
    for (const row of previous) {
      if (!shot.has(`${row.scenario}|${row.theme}|${row.route}`)) results.push(row);
    }
  }

  /* Stable order regardless of which context finished first, so two runs of
     the same matrix produce the same manifest. */
  results.sort(
    (a, b) =>
      a.scenario.localeCompare(b.scenario) ||
      a.theme.localeCompare(b.theme) ||
      a.route.localeCompare(b.route) ||
      a.state.localeCompare(b.state),
  );

  await writeFile(
    path.join(out, 'manifest.json'),
    `${JSON.stringify(
      {
        target: target.name,
        base: BASE,
        finishedAt: new Date().toISOString(),
        captured: results.filter((result) => result.status === 'captured').length,
        blank: results.filter((result) => result.status === 'blank').length,
        unfixturedEndpoints: [...gaps].sort(),
        fixtureShapeErrors: [...shapeErrors].sort(),
        results,
      },
      null,
      2,
    )}\n`,
  );

  if (shapeErrors.size > 0) {
    process.stdout.write(`\n${shapeErrors.size} fixture(s) do not match their schema:\n`);
    [...shapeErrors].sort().forEach((gap) => process.stdout.write(`  ${gap}\n`));
  }

  if (gaps.size > 0) {
    process.stdout.write(
      `\n${gaps.size} endpoint(s) have no fixture — the screens that asked for` +
        (strict ? ' them were told so:\n' : ' them were handed a guess:\n'),
    );
    [...gaps].sort().forEach((gap) => process.stdout.write(`  ${gap}\n`));
  }

  if (problems.length > 0) {
    process.stdout.write(`\n${problems.length} page error(s):\n`);
    problems.forEach((problem) => process.stdout.write(`  ${problem}\n`));
    process.exitCode = 1;
  }
}

main();
