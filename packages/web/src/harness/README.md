# The fixture harness

A development-only layer that runs the whole web app against generated data,
with no backend, and lets you switch what that data *is* at runtime without a
reload.

```
localStorage.setItem('ap-harness', '1')   # or visit /?harness=1
pnpm serve
```

Press **⌥S** for the scenario picker, or click the pill in the bottom-left
corner.

## Why it exists

The redesign is mostly a question of spacing, density and colour, and none of
those can be judged on an empty screen. A table with no rows tells you nothing
about row height; a status column with no failures tells you nothing about
whether the red is too loud. Screenshots of an empty app are a waste of a
review cycle.

Running a real backend solves that and introduces a worse problem: seeding it
takes minutes, the data drifts between runs, and half the screens are behind an
enterprise licence you have to fake anyway. Worst of all, **changing state means
restarting something**, and a loop with a restart in it does not get run.

So: fixtures in the browser, switched in place.

## How it works

Three pieces, and the boundary between them is the point.

**`scenario.ts`** holds the axes and a plain module-level store. Not React
state — the axios adapter is called from outside the tree and has to read the
current scenario synchronously.

**`fixture-adapter.ts`** is an axios adapter. The app makes every HTTP call
through one axios instance, so replacing its adapter is the entire interception
surface: no service worker, no proxy, no recorded traffic. It reads the store on
every call, which is what makes switching work without a reload.

**`harness-panel.tsx`** writes to the store and calls `queryClient.resetQueries()`.
One page load, every state, about a second per switch.

`install.ts` also writes an unsigned JWT into `localStorage`, because the app
reads its identity by decoding the token client-side. That is a complete session
as far as the UI is concerned, and it means no sign-in screen stands between you
and a screenshot.

## The axes

| Axis | Values | What it changes |
| --- | --- | --- |
| **Licence** | community · enterprise · cloud · free | The `EDITION` flag and every `platform.plan.*Enabled` boolean. `free` is the cloud build without paid features: `EDITION` says cloud, the plan says no, so every lock offers "Upgrade plan" and the plans dialog — where community's lock offers "Contact Sales". Two editions because they are two different premium moments. |
| **Who am I** | admin · owner · editor · operator · viewer | The permission list from `/v1/project-members/role` |
| **How much exists** | first run · day one · 30 days · a year in | The size of every list, from zero to full volume |
| **How it is going** | all green · realistic · bad day | The share of runs that failed and connections that expired |

Licence and role are separate on purpose, and the capability model keeps them
separate too: `can` is about the person, `has` is about the licence. They fail
differently — a role you lack is somebody else's job, a feature you lack is a
thing to buy — and a screen should be able to say which.

**Nothing in production code is modified to unlock enterprise.** The licence
axis serves a different flags response and a different plan object, which is
exactly what a real enterprise install does. That also means the *locked* state
is reachable: a lock is a design surface, not an absence, and you can screenshot
both sides of it.

## Fixtures

`fixtures/world.ts` builds one coherent world per scenario and memoises it. The
relationships are real — a run points at a flow that exists, a connection lists
the flows that actually use it, a folder's count is the number of rows you get
when you click it. Fixtures that disagree with each other are worse than none,
because the screen looks right and the decision it supports is wrong.

Everything is seeded (`fixtures/rng.ts`), so the same scenario always produces
the same data. That is what makes a screenshot diff mean something.

Content lives in `fixtures/catalog.ts` and the quality of it is deliberate.
"Test Flow 1" × 20 tells you nothing about how a list feels. The names are ones
a real customer could have, the lengths are uneven so truncation gets
exercised, and the failure messages are the real lengths including the one that
wraps.

### Unmatched endpoints

There are about 150 endpoints and roughly a third are modelled. The rest return
the emptiest shape that keeps a screen rendering and log once:

```
[harness] no fixture for GET /v1/audit-events — returning empty
```

So the console is the to-do list. A harness that crashes on the first unmodelled
endpoint gets abandoned in an afternoon.

One trap worth knowing: the fallback cannot tell from a path whether the caller
wants `[]` or `{ data: [] }`. Endpoints answering with a bare array are listed
explicitly in the route table — getting it wrong surfaces three components deep
as `providers?.find is not a function`.

## Screenshots

```
pnpm serve                       # in one terminal
node scripts/shoot.mjs --out before
node scripts/shoot.mjs --out after --scenario typical
node scripts/shoot.mjs --group admin --all       # every admin screen, every scenario
```

Walks routes × scenarios × themes and writes a PNG each, plus `manifest.json`.
Scenarios are set by writing `localStorage` and reloading rather than by
driving the panel — the panel is for a person, and a script that operates the
UI it is meant to be reviewing breaks every time that UI changes.

`shoot.mjs` is an app-agnostic engine; everything about *this* app — the
scenarios, the routes, the fake session — is in `scripts/shoot.target.mjs`,
and `--target <file>` points it at another app's description (the redesign
concept has one). A route may declare `states`: named click sequences shot as
`route--state.png` — the invite dialog, the upgrade prompt on a locked screen.
Selectors are written against what a person sees (`role=button[name=/invite/i]`),
never against markup. The hub's `bin/ap-shoot` runs all of this for every side
and builds the contact sheet.

### Admin fixtures

The admin screens' endpoints live in `fixtures/admin-security.ts` and
`fixtures/admin-operations.ts`, wired into the route table ahead of everything
else. `shoot.mjs --group admin --strict` is how the list of what they still lack
was produced, and how to re-check it.

If Playwright's own browser download is missing, point at a system one:

```
CHROMIUM_PATH=/usr/lib64/chromium-browser/chromium-browser node scripts/shoot.mjs
```

## It is not in the production bundle

Two entry points, both behind a condition made only of values Vite replaces at
build time — `import.meta.env.DEV` and `VITE_HARNESS` — so an ordinary build
folds them away and emits nothing:

- `main.tsx` imports `./harness/install` dynamically inside that condition.
- `harness-mount.tsx` puts the panel's `lazy(() => import(...))` behind the
  same condition, as a ternary that falls to `null`.

**It has to be the condition itself, not `isHarnessEnabled()`.** That is a
function call, Rollup will not inline it, and the imports behind it stay
reachable. Both entry points used to be written that way, and a production
build shipped four fixture chunks — the whole seeded world, plus the panel.
Verified by building with and without the flag and counting chunks; if you
touch either entry point, verify the same way:

```
npx vite build --outDir ../../dist/leak-check --emptyOutDir
ls ../../dist/leak-check/assets | grep -cE '^(scenario|world|fixture|harness)-'   # want 0
```

The runtime checks still decide whether to *run*; the build condition decides
whether the code is *there*.

## Making a run faster — where to pick this up

Shooting a built bundle instead of the dev server is already in: `ap-shoot
--built` builds each side into its own `dist/harness-web` and serves it with
`vite preview`. That took per shot from about 13s to about 3.3s, because a
cold load against the dev server is thousands of unbundled module requests
rather than a handful of chunks.

The next lever is parallelism, and it is **deliberately left off** —
`shoot.mjs` takes `--workers N` and shards (scenario, theme) passes across
that many browser contexts, but defaults to 1.

Measured against the **dev server**, three contexts were slower than one (585s
vs 427s) and killed pages outright with `ERR_INSUFFICIENT_RESOURCES`: parallel
contexts multiply the module waterfall, and the dev server, not the CPU, was
the ceiling. That reasoning does not apply to `--built`, where each load is a
few chunks — so parallelism should finally pay off there, and nobody has
measured it yet.

Whoever picks this up:

1. Run `ap-shoot --built --workers 3` against a quiet machine and compare
   wall-clock with `--workers 1`. Both write `manifest.json`, so compare
   captured counts too, not just time.
2. Watch memory, which is the binding constraint and not the core count. Each
   context is roughly 200MB on top of a preview server; this was measured on a
   6GB box where a 4GB-heap build already needed care, and RAM was on order.
3. If contexts still die, the symptom to look for is `ERR_INSUFFICIENT_RESOURCES`
   in a route's `diagnosis` in the manifest. That is resource exhaustion, not
   a bug in the page.
4. The remaining per-shot costs, in rough order: a full page load per shot
   (client-side navigation within one boot would avoid re-mounting React and
   regenerating the fixture world each time), `settle`'s 600ms quiet window,
   `hasPaint` calling `getBoundingClientRect()` on every element, and
   `deviceScaleFactor: 2` doubling encode time.
