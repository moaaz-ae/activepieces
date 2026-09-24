/*
 * Turning the harness on.
 *
 * `import.meta.env.DEV` covers `vite serve`. `VITE_HARNESS=1` covers a build
 * made deliberately for the screenshot run, which is what makes a run fast: a
 * cold page load stops being thousands of unbundled module requests, measured
 * four times faster per shot than the dev server.
 *
 * What this gate does NOT do is keep the harness out of a production bundle.
 * Measured, with this gate and with the older DEV-only one: an ordinary
 * `vite build` still emits the fixture chunks either way, because the check
 * lives behind a function call that Rollup will not inline, so the dynamic
 * imports below stay reachable. The gate makes the harness inert at runtime,
 * not absent. Keeping it out of the bundle needs the call sites gated on a
 * statically-foldable constant, or the directory excluded at the config level.
 *
 * Within dev it is opt-in per browser, because the point of `pnpm serve` is
 * usually to talk to a real backend:
 *
 *   localStorage.setItem('ap-harness', '1')   — on
 *   localStorage.removeItem('ap-harness')     — off
 *
 * or `?harness=1` / `?harness=0` in the URL, which is what the screenshot
 * script uses. `?signedOut=1` / `?signedOut=0` withholds the session the same
 * way, so the auth screens can be reviewed.
 */

import { PrincipalType } from '@activepieces/shared';
import axios from 'axios';

const KEY = 'ap-harness';
const SIGNED_OUT_KEY = 'ap-harness-signed-out';

export function isHarnessEnabled(): boolean {
  if (!import.meta.env.DEV && import.meta.env.VITE_HARNESS !== '1')
    return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('harness');
    if (asked === '1') localStorage.setItem(KEY, '1');
    if (asked === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function base64url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/*
 * A session, without a sign-in.
 *
 * The app reads its identity by decoding the JWT client-side — it never
 * verifies the signature, that is the server's job — so a well-formed
 * unsigned token is a complete session as far as the UI is concerned. The
 * signature segment is the word `fixture` precisely so that anything which
 * did try to verify it fails loudly rather than appearing to work.
 */
function installSession(userId: string, platformId: string, projectId: string) {
  const header = base64url({ alg: 'none', typ: 'JWT' });
  const payload = base64url({
    id: userId,
    type: PrincipalType.USER,
    platform: { id: platformId },
    projectId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
  });
  localStorage.setItem('token', `${header}.${payload}.fixture`);
  localStorage.setItem('projectId', projectId);
}

/*
 * Signed out, but still on fixtures.
 *
 * The auth screens are the one part of the app the session hides: with a token
 * installed every route lands inside the app, so /sign-in redirects away and
 * can never be reviewed. This leaves the fixture adapter in place — the flags
 * those screens read still have to be answered — and only withholds the
 * session.
 */
function isSignedOut(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get('signedOut');
    if (asked === '1') localStorage.setItem(SIGNED_OUT_KEY, '1');
    if (asked === '0') localStorage.removeItem(SIGNED_OUT_KEY);
    return localStorage.getItem(SIGNED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export async function installHarness(): Promise<void> {
  if (!isHarnessEnabled()) return;

  const { fixtureAdapter } = await import('./fixture-adapter');
  const { FLOW_ID, PLATFORM_ID, PROJECT_ID, USER_ID } = await import(
    './fixtures/world'
  );
  const { PIECE_SET_ID } = await import('./fixtures/admin-security');

  /* Ids a screenshot run needs to address detail screens, published where the
     script can read them (it reads `projectId` the same way) rather than
     re-deriving the seeded ids outside the app. */
  localStorage.setItem('ap-harness-piece-set-id', PIECE_SET_ID);
  localStorage.setItem('ap-harness-flow-id', FLOW_ID);

  if (isSignedOut()) {
    localStorage.removeItem('token');
    localStorage.removeItem('projectId');
  } else {
    installSession(USER_ID, PLATFORM_ID, PROJECT_ID);
  }
  axios.defaults.adapter = fixtureAdapter;

  // eslint-disable-next-line no-console
  console.info(
    '[harness] fixtures on — no backend is being contacted. Press ⌥S for the scenario picker.',
  );
}
