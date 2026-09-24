/*
 * The fixture adapter.
 *
 * Every HTTP call the web app makes goes through one axios instance, so one
 * adapter is the whole interception surface — no service worker, no request
 * recording, no backend. It reads `scenarioStore` on every call rather than
 * closing over a snapshot, which is what lets the picker change the world
 * without a reload.
 *
 * Unmatched routes do not throw. They return the emptiest shape that keeps a
 * screen rendering — a SeekPage for anything plural, `{}` otherwise — and log
 * once, so the console doubles as the to-do list of endpoints still to
 * fixture. A harness that crashes on the first unmodelled endpoint gets
 * abandoned in an afternoon.
 */

import {
  FlowVersionState,
  PlatformAnalyticsReport,
} from '@activepieces/shared';
import { AxiosAdapter, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';

import { projectRoleFor } from './fixtures/access';
import {
  adminOperationsRoutes,
  platformCreditsUsed,
} from './fixtures/admin-operations';
import { adminSecurityRoutes } from './fixtures/admin-security';
import { analyticsFor } from './fixtures/analytics';
import { flagsFor } from './fixtures/flags';
import { pieceFor, piecesFor } from './fixtures/pieces';
import { NOW } from './fixtures/rng';
import { PLATFORM_ID, PROJECT_ID, worldFor } from './fixtures/world';
import { page, Query, Route } from './routes';
import { isCloud, isLicensed, scenarioStore } from './scenario';

/*
 * The gaps this page load ran into, and whether to guess at them.
 *
 * 23 endpoints are modelled; the app calls about 114. The rest used to be
 * answered by `fallbackFor` — a regex on the last letter of the path — and a
 * guess that violates the caller's contract does not fail, it fabricates. That
 * is one root cause behind two long-standing mysteries: /impact got a SeekPage
 * where a report was declared and threw on `report.flows`, and /invitation got
 * `{}` where a boolean was declared, read it as false and navigated away. Both
 * showed up only as a blank screenshot.
 *
 * So every gap is now recorded where a tool can read it, and `?strict=1` stops
 * the guessing altogether: the request fails honestly, the screen renders its
 * error state, and the run reports which endpoint was missing. Lenient stays
 * the default, because a harness that dies on the first unmodelled endpoint
 * gets abandoned in an afternoon — but an automated run should never be handed
 * a guess.
 */
declare global {
  interface Window {
    __AP_HARNESS_GAPS__?: string[];
    __AP_HARNESS_SHAPE_ERRORS__?: string[];
  }
}

function recordGap(key: string): void {
  window.__AP_HARNESS_GAPS__ = window.__AP_HARNESS_GAPS__ ?? [];
  if (!window.__AP_HARNESS_GAPS__.includes(key)) {
    window.__AP_HARNESS_GAPS__.push(key);
  }
}

function recordShapeError(key: string): void {
  window.__AP_HARNESS_SHAPE_ERRORS__ = window.__AP_HARNESS_SHAPE_ERRORS__ ?? [];
  if (!window.__AP_HARNESS_SHAPE_ERRORS__.includes(key)) {
    window.__AP_HARNESS_SHAPE_ERRORS__.push(key);
  }
}

function isStrict(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get('strict');
    if (asked === '1') localStorage.setItem('ap-harness-strict', '1');
    if (asked === '0') localStorage.removeItem('ap-harness-strict');
    return localStorage.getItem('ap-harness-strict') === '1';
  } catch {
    return false;
  }
}

/*
 * The route table.
 *
 * Ordered: the first pattern that matches wins, so a literal segment must be
 * registered before the `:id` pattern that would also swallow it.
 */
const ROUTES: Route[] = [
  /*
   * The admin screens' endpoints live in their own files, grouped the way the
   * sidebar groups the screens, so a fixture is found next to the ones it
   * shares a world with. They come first: a literal segment registered here
   * would otherwise be swallowed by a `:id` pattern below.
   */
  ...adminSecurityRoutes,
  ...adminOperationsRoutes,

  ['GET', '/v1/flags', () => flagsFor(scenarioStore.get())],

  ['GET', '/v1/users/me', ({ world }) => world.user],
  ['GET', '/v1/users/projects', ({ world }) => world.projects],
  ['GET', '/v1/users/:id', ({ world }) => world.user],
  ['GET', '/v1/users', ({ world, query }) => page(world.users, query)],

  /*
   * Endpoints that answer with a bare array rather than a page.
   *
   * They need naming explicitly: the fallback cannot tell from a path whether
   * the caller wants `[]` or `{ data: [] }`, and handing back the wrong one
   * fails as `providers?.find is not a function` three components deep.
   */
  [
    'GET',
    '/v1/platforms',
    ({ world }) => [
      { platformName: world.platform.name, projects: world.projects },
    ],
  ],
  ['GET', '/v1/platforms/:id', ({ world }) => world.platform],
  [
    'GET',
    '/v1/analytics',
    ({ world }) => analyticsFor(world),
    PlatformAnalyticsReport,
  ],
  ['GET', '/v1/ai-tools', () => []],
  ['GET', '/v1/knowledge-base/files', () => []],
  ['GET', '/v1/fields', () => []],
  [
    'GET',
    '/v1/platform-configurations',
    () => ({
      id: 'platform-configuration',
      created: new Date(0).toISOString(),
      updated: new Date(0).toISOString(),
      platformId: PLATFORM_ID,
      isProductTelemetryEnabled: false,
      isInfraSetupTelemetryEnabled: false,
    }),
  ],

  /*
   * Billing.
   *
   * Modelled rather than stubbed because half the platform screens read
   * `usage` and crash on an empty object — and because "how close am I to the
   * limit" is a bar somebody has to design, which needs a number that is
   * neither zero nor maxed.
   */
  [
    'GET',
    '/v1/platform-billing/info',
    ({ world }) => {
      const licensed = isLicensed(world.scenario);
      return {
        plan: {
          ...world.platform.plan,
          id: 'platform-plan',
          platformId: PLATFORM_ID,
          created: world.platform.created,
          updated: world.platform.updated,
        },
        usage: {
          creditsUsed: platformCreditsUsed(world),
          creditsRemaining:
            world.platform.plan.includedCredits - platformCreditsUsed(world),
          creditsNextResetAt: new Date(
            NOW + 1000 * 60 * 60 * 24 * 11,
          ).toISOString(),
          appSumoAiCreditsUsed: null,
          appSumoAiCreditsRemaining: null,
          activeFlows: world.flows.filter((flow) => flow.status === 'ENABLED')
            .length,
          teamProjects: world.projects.length,
          users: world.users.length,
          activeUsers: world.users.length,
          invitedSeats: 0,
        },
        creditsResetInterval: 'month',
        planInterval: 'month',
        autumnPlanName: licensed ? 'enterprise' : null,
        scheduledPlanName: null,
        nextBillingDate: new Date(NOW + 1000 * 60 * 60 * 24 * 11).toISOString(),
        nextBillingAmount: licensed ? 1200 : 0,
        cancelAt: null,
        trialEndsAt: null,
        creditsFeature: null,
        appSumoCreditsFeature: null,
        seatsFeature: null,
        billingPortalAvailable: false,
        billingEnforced: isCloud(world.scenario),
        billingUnavailable: !isCloud(world.scenario),
        includedSeats: licensed ? 25 : 5,
        additionalSeats: 0,
      };
    },
  ],

  ['GET', '/v1/projects', ({ world, query }) => page(world.projects, query)],
  [
    'GET',
    '/v1/projects/:id',
    ({ world, params }) =>
      world.projects.find((project) => project.id === params.id) ??
      world.projects[0],
  ],

  ['GET', '/v1/folders', ({ world, query }) => page(world.folders, query)],

  ['GET', '/v1/flows/count', ({ world }) => world.flows.length],
  [
    'GET',
    '/v1/flows',
    ({ world, query }) => {
      let flows = world.flows;
      if (query.folderId) {
        flows = flows.filter((flow) => flow.folderId === query.folderId);
      }
      if (query.status) {
        flows = flows.filter((flow) => flow.status === query.status);
      }
      if (query.name) {
        const needle = query.name.toLowerCase();
        flows = flows.filter((flow) =>
          flow.version.displayName.toLowerCase().includes(needle),
        );
      }
      return page(flows, query);
    },
  ],
  /*
   * The builder's own read of a flow.
   *
   * It answers with the draft version rather than the locked one the lists
   * carry, which is what the real endpoint does too: the builder opens the
   * version you are editing. The distinction is load-bearing here — the
   * builder treats a LOCKED version as read-only and hides the step settings
   * panel, the add-step buttons and the test widget, so a locked fixture
   * photographs an inert canvas and none of the surfaces worth reviewing.
   */
  [
    'GET',
    '/v1/flows/:id',
    ({ world, params }) => {
      const flow =
        world.flows.find((entry) => entry.id === params.id) ?? world.flows[0];
      return {
        ...flow,
        version: { ...flow.version, state: FlowVersionState.DRAFT },
      };
    },
  ],

  [
    'GET',
    '/v1/flow-runs/count-by-status',
    ({ world }) => {
      const counts: Record<string, number> = {};
      world.runs.forEach((run) => {
        counts[run.status] = (counts[run.status] ?? 0) + 1;
      });
      return counts;
    },
  ],
  [
    'GET',
    '/v1/flow-runs',
    ({ world, query }) => {
      let runs = world.runs;
      if (query.flowId) {
        runs = runs.filter((run) => run.flowId === query.flowId);
      }
      if (query.status) {
        runs = runs.filter((run) => run.status === query.status);
      }
      return page(runs, query);
    },
  ],
  [
    'GET',
    '/v1/flow-runs/:id',
    ({ world, params }) =>
      world.runs.find((run) => run.id === params.id) ?? world.runs[0],
  ],

  [
    'GET',
    '/v1/app-connections/owners',
    ({ world, query }) =>
      page(
        world.users.map((user) => ({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        })),
        query,
      ),
  ],
  [
    'GET',
    '/v1/app-connections',
    ({ world, query }) => page(world.connections, query),
  ],

  ['GET', '/v1/agents', ({ world, query }) => page(world.agents, query)],
  [
    'GET',
    '/v1/agents/:id',
    ({ world, params }) =>
      world.agents.find((agent) => agent.id === params.id) ?? world.agents[0],
  ],

  ['GET', '/v1/pieces', ({ query }) => piecesFor(query)],
  ['GET', '/v1/pieces/registry', ({ query }) => piecesFor(query)],
  /*
   * Two segments, not one: a piece is named `@activepieces/piece-slack`, so
   * the slash inside the name lands in the path and a `:name` pattern never
   * matches it.
   */
  [
    'GET',
    '/v1/pieces/:scope/:name',
    ({ params }) => pieceFor(`${params.scope}/${params.name}`) ?? {},
  ],

  /* The builder asks for each step's last test result before it renders. No
     fixture flow has been tested, so the honest answer is nothing. */
  ['GET', '/v1/sample-data', () => ({})],
  ['GET', '/v1/step-run', () => ({})],

  ['GET', '/v1/tables/count', ({ world }) => world.tables.length],
  ['GET', '/v1/tables', ({ world, query }) => page(world.tables, query)],

  [
    'GET',
    '/v1/project-members/role',
    () => projectRoleFor(scenarioStore.get()),
  ],
  [
    'GET',
    '/v1/project-members',
    ({ world, query }) =>
      page(
        world.users.map((user) => ({
          id: user.id,
          created: user.created,
          updated: user.updated,
          user,
          projectId: PROJECT_ID,
          platformId: PLATFORM_ID,
          projectRole: {
            id: 'admin-role',
            name: 'Admin',
            permissions: [],
            platformId: PLATFORM_ID,
            type: 'DEFAULT',
          },
        })),
        query,
      ),
  ],
];

function matchPath(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index++) {
    const expected = patternParts[index];
    const actual = pathParts[index];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

const reported = new Set<string>();

function fallbackFor(path: string, query: Query): unknown {
  /* Anything the app asks for in the plural gets an empty page rather than an
     error, so a screen renders its empty state instead of its error state. */
  return path.match(/s$/) ? page([], query) : {};
}

export const fixtureAdapter: AxiosAdapter = async (
  config: InternalAxiosRequestConfig,
) => {
  const raw = config.url ?? '';
  const url = new URL(raw, window.location.origin);
  const path = url.pathname.replace(/^\/api/, '');
  const method = (config.method ?? 'get').toUpperCase();

  const query: Query = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  Object.entries(config.params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) query[key] = String(value);
  });

  const world = worldFor(scenarioStore.get());

  let data: unknown;
  let matched = false;

  for (const [routeMethod, pattern, handler, shape] of ROUTES) {
    if (routeMethod !== method) continue;
    const params = matchPath(pattern, path);
    if (!params) continue;
    data = handler({ method, path, params, query, body: config.data, world });
    matched = true;
    if (shape && !shape.safeParse(data).success) {
      const key = `${method} ${path}`;
      recordShapeError(key);
      // eslint-disable-next-line no-console
      console.error(`[harness] fixture for ${key} does not match its schema`);
    }
    break;
  }

  if (!matched) {
    const key = `${method} ${path}`;
    recordGap(key);
    if (!reported.has(key)) {
      reported.add(key);
      // eslint-disable-next-line no-console
      console.info(`[harness] no fixture for ${key}`);
    }
    if (isStrict()) {
      /* Honest failure beats a fabricated shape: the screen renders its error
         state, and the run names the endpoint instead of reporting a blank. */
      throw Object.assign(new Error(`[harness] no fixture for ${key}`), {
        isAxiosError: true,
        config,
        response: {
          data: { code: 'HARNESS_NO_FIXTURE', message: key },
          status: 501,
          statusText: 'Not Implemented',
          headers: new AxiosHeaders(),
          config,
        },
      });
    }
    /* A write the harness does not model succeeds silently. Nothing is
       persisted, but the optimistic update lands and the screen behaves. */
    data = method === 'GET' ? fallbackFor(path, query) : {};
  }

  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
  };
};
