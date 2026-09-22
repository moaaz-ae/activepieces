/*
 * The one line of the harness that production sees.
 *
 * The lazy import sits behind a ternary on two values Vite replaces at build
 * time, so an ordinary build folds it to `null` and the panel chunk is never
 * emitted. It cannot be behind `isHarnessEnabled()` instead: that is a
 * function call, Rollup will not inline it, and the import stays reachable —
 * measured, the panel and the fixture world shipped in a production bundle
 * that way. The runtime checks below still decide whether to render.
 */

import { lazy, Suspense } from 'react';

import { isHarnessEnabled } from './install';

const HarnessPanel =
  import.meta.env.DEV || import.meta.env.VITE_HARNESS === '1'
    ? lazy(() =>
        import('./harness-panel').then((module) => ({
          default: module.HarnessPanel,
        })),
      )
    : null;

function isHidden(): boolean {
  /* The screenshot script sets this. A review picture should contain the app
     and nothing else — a floating dev pill in the corner of every frame is
     noise at best and reads as part of the design at worst. */
  try {
    return localStorage.getItem('ap-harness-hide-panel') === '1';
  } catch {
    return false;
  }
}

export function HarnessMount() {
  if (!HarnessPanel || !isHarnessEnabled() || isHidden()) return null;
  return (
    <Suspense fallback={null}>
      <HarnessPanel />
    </Suspense>
  );
}
