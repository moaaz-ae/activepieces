/*
 * The shipping app, described for `shoot.mjs`.
 *
 * Everything the engine needs to know about this app and nothing about how to
 * drive a browser: which scenarios exist and how to switch them, which routes
 * to visit and how to address them, and the fake session the fixture harness
 * installs. The redesign has a file of the same shape at
 * `concept/scripts/shoot.target.mjs`; the two are shot by the same engine and
 * paired by the same names, which is what makes the contact sheet honest.
 *
 * Selectors in `states` are Playwright locator strings written against what a
 * person sees — a button's label, a tab's name — never against markup, so a
 * restyle does not silently turn a dialog shot into a resting-page shot.
 */

/*
 * The states worth having a picture of.
 *
 * Not the cross product — that is 108 shots nobody looks at. These disagree
 * with each other: nothing yet, a normal day, a bad day, everything at volume,
 * the same screens without a licence (self-hosted, so the answer is "talk to
 * sales"), and the same screens on the free cloud tier (where the answer is an
 * upgrade you can buy on the spot). The last two are how the premium
 * experience gets photographed.
 */
const SCENARIOS = {
  empty: { edition: 'enterprise', role: 'admin', volume: 'first-run', health: 'clean' },
  typical: { edition: 'enterprise', role: 'admin', volume: 'established', health: 'mixed' },
  failing: { edition: 'enterprise', role: 'admin', volume: 'established', health: 'failing' },
  heavy: { edition: 'enterprise', role: 'admin', volume: 'mature', health: 'mixed' },
  community: { edition: 'community', role: 'admin', volume: 'established', health: 'mixed' },
  free: { edition: 'free', role: 'admin', volume: 'established', health: 'mixed' },
  viewer: { edition: 'enterprise', role: 'viewer', volume: 'established', health: 'mixed' },
  cloud: { edition: 'cloud', role: 'admin', volume: 'established', health: 'mixed' },
};

/* Reviewing a change does not need every scenario. Nothing-yet and a normal
   day in both themes catch nearly everything; the rest is a sweep, behind
   --all or --scenario. */
const REVIEW_SCENARIOS = ['typical', 'empty'];

/* The scenarios in which a plan-locked screen shows its lock. Community is a
   self-hosted install without a licence; free is the cloud tier below every
   paid feature. */
const LOCKED = ['community', 'free'];

/* The premium moment: a locked screen's one button. On the open-source build
   "Contact Sales" opens a new tab at the website, so there is nothing to
   photograph after the click; only the cloud tier has an in-app dialog. */
const UPGRADE = {
  name: 'upgrade',
  scenarios: ['free'],
  steps: ['role=button[name="Upgrade plan"]'],
};

/* Signed-out screens do not vary by volume or health, only by edition. */
const AUTH = {
  signedOut: true,
  sparse: true,
  group: 'auth',
  scenarios: ['typical', 'community', 'cloud'],
};

/* Every admin route carries this. `--group admin` shoots them and nothing
   else, in every scenario. */
const ADMIN = { group: 'admin' };

const ROUTES = [
  /* ---------------------------------------------------------- the product */
  ['chat', '/chat'],
  ['agents', '/agents'],
  ['impact', '/impact'],
  ['mcp', '/mcp-server'],
  ['automations', 'project:/automations'],
  ['flows', 'project:/flows'],
  ['runs', 'project:/runs'],
  ['connections', 'project:/connections'],
  ['tables', 'project:/tables'],
  ['approvals', 'project:/approvals'],
  ['releases', 'project:/releases'],
  ['settings', 'project:/settings'],

  /* ------------------------------------------------------------ the admin */
  /*
   * Names are shared with the redesign's target where the screen is the same
   * screen, so the contact sheet pairs them without a lookup table. Where the
   * redesign merged or moved a screen, ITS route says which of these it
   * replaces (`pairs`), because the redesign is the side that knows.
   */
  [
    'platform-projects',
    '/platform/projects',
    {
      ...ADMIN,
      /* Not plan-locked here: the fixture leaves `billedTeamProjectsLimit`
         open on every edition, so there is no upgrade prompt to shoot. */
      states: [{ name: 'new', scenarios: ['typical'], steps: ['role=button[name=/new project/i]'] }],
    },
  ],
  [
    'platform-users',
    '/platform/users',
    { ...ADMIN, states: [{ name: 'new', scenarios: ['typical'], steps: ['role=button[name=/invite/i]'] }] },
  ],
  ['platform-connections', '/platform/connections', ADMIN],
  [
    'platform-global-connections',
    '/platform/setup/connections',
    {
      ...ADMIN,
      states: [
        { name: 'new', scenarios: ['typical'], steps: ['role=button[name=/new connection/i]'] },
        UPGRADE,
      ],
    },
  ],
  [
    'platform-secret-managers',
    '/platform/security/secret-managers',
    {
      ...ADMIN,
      states: [
        { name: 'new', scenarios: ['typical'], steps: ['role=button[name=/new connection/i]'] },
        UPGRADE,
      ],
    },
  ],
  [
    'platform-pieces',
    '/platform/setup/pieces',
    {
      ...ADMIN,
      /* Its lock is an inline banner whose one button is "Contact Sales" on
         every edition — a new tab, not a dialog — so there is no upgrade
         state to shoot. */
      states: [{ name: 'new', scenarios: ['typical'], steps: ['role=button[name=/install piece/i]'] }],
    },
  ],
  [
    'platform-piece-sets',
    '/platform/setup/pieces',
    {
      ...ADMIN,
      query: { tab: 'piece-sets' },
      /* Locked, the page shows one lock and no tabs — the same picture as
         `platform-pieces`, so this one is not shot there. */
      scenarios: ['empty', 'typical', 'heavy'],
      states: [{ name: 'new', scenarios: ['typical'], steps: ['role=button[name=/new piece set/i]'] }],
    },
  ],
  [
    'platform-piece-set',
    '/platform/setup/pieces/piece-sets/{pieceSetId}',
    { ...ADMIN, scenarios: ['typical', 'heavy'] },
  ],
  [
    'platform-piece-selector',
    '/platform/setup/pieces',
    {
      ...ADMIN,
      scenarios: ['typical'],
      click: 'role=button[name=/customize selector/i]',
    },
  ],
  [
    'platform-templates',
    '/platform/setup/templates',
    {
      ...ADMIN,
      states: [
        { name: 'new', scenarios: ['typical'], steps: ['role=button[name=/new template/i]'] },
        UPGRADE,
      ],
    },
  ],
  [
    'platform-ai',
    '/platform/setup/ai',
    {
      ...ADMIN,
      states: [
        /* "Connect a provider" on an empty list, plain "Connect" once one
           exists. */
        { name: 'new', scenarios: ['typical'], steps: ['role=button[name=/^connect/i]'] },
      ],
    },
  ],
  ['platform-ai-capabilities', '/platform/setup/ai', { ...ADMIN, query: { tab: 'capabilities' } }],
  [
    'platform-sso',
    '/platform/security/sso',
    {
      ...ADMIN,
      states: [
        { name: 'new', scenarios: ['typical'], steps: ['role=button[name=/configure|enable|edit/i]'] },
        UPGRADE,
      ],
    },
  ],
  [
    'platform-roles',
    '/platform/security/project-roles',
    {
      ...ADMIN,
      states: [
        { name: 'new', scenarios: ['typical'], steps: ['role=button[name=/new role/i]'] },
        UPGRADE,
      ],
    },
  ],
  [
    'platform-api-keys',
    '/platform/security/api-keys',
    {
      ...ADMIN,
      states: [
        { name: 'new', scenarios: ['typical'], steps: ['role=button[name=/new api key/i]'] },
        UPGRADE,
      ],
    },
  ],
  ['platform-audit-logs', '/platform/security/audit-logs', { ...ADMIN, states: [UPGRADE] }],
  [
    'platform-event-destinations',
    '/platform/infrastructure/event-destinations',
    {
      ...ADMIN,
      states: [
        { name: 'new', scenarios: ['typical'], steps: ['role=button[name=/new destination/i]'] },
        UPGRADE,
      ],
    },
  ],
  ['platform-embed', '/platform/security/embed', { ...ADMIN, states: [UPGRADE] }],
  ['platform-mcp', '/platform/setup/mcp', ADMIN],
  /* The MCP tabs are not in the URL, so they are reached by clicking. */
  ['platform-mcp-tools', '/platform/setup/mcp', { ...ADMIN, click: 'role=tab[name="Tools"]' }],
  ['platform-mcp-activity', '/platform/setup/mcp', { ...ADMIN, click: 'role=tab[name="Activity"]' }],
  ['platform-workers', '/platform/infrastructure/workers', ADMIN],
  [
    'platform-worker-groups',
    '/platform/infrastructure/workers',
    { ...ADMIN, query: { tab: 'worker-groups' }, states: [UPGRADE] },
  ],
  ['platform-configurations', '/platform/infrastructure/configurations', ADMIN],
  ['platform-health', '/platform/infrastructure/health', ADMIN],
  ['platform-health-runs', '/platform/infrastructure/health', { ...ADMIN, query: { tab: 'runs' } }],
  ['platform-health-queue', '/platform/infrastructure/health', { ...ADMIN, query: { tab: 'queue' } }],
  ['platform-triggers', '/platform/infrastructure/triggers', ADMIN],
  [
    'platform-billing',
    '/platform/setup/billing',
    {
      ...ADMIN,
      states: [
        {
          name: 'plans',
          scenarios: ['typical', 'free', 'cloud'],
          steps: ['role=button[name=/explore plans|upgrade plan/i]'],
        },
      ],
    },
  ],
  ['platform-usage', '/platform/setup/usage', ADMIN],
  ['platform-general', '/platform/setup/general', ADMIN],

  /* ------------------------------------------------------------ signed out */
  ['sign-in', '/sign-in', AUTH],
  /* The in-page SAML form is a cloud affordance. Self-hosted sends the
     browser to the API instead, so clicking it there would only capture a
     navigation away from the app. */
  [
    'sign-in-saml',
    '/sign-in',
    { ...AUTH, scenarios: ['cloud'], click: 'button:has-text("SAML")' },
  ],
  ['sign-up', '/sign-up', AUTH],
  ['forget-password', '/forget-password', AUTH],
  ['reset-password', '/reset-password', { ...AUTH, query: { token: 'fixture-token' } }],
  ['verify-email', '/verify-email', AUTH],
  /* No token on purpose. With one the page accepts the invitation and then
     navigates, so there is no page left to photograph. Without one it renders
     the invalid-link message — a single line of text, hence the lower bar. */
  ['invitation', '/invitation', { ...AUTH, paint: { minBoxes: 3, minChars: 20 } }],
  ['create-platform', '/create-platform', AUTH],
].map(([name, path, options = {}]) => ({ name, path, ...options }));

export default {
  name: 'baseline',
  scenarios: SCENARIOS,
  reviewScenarios: REVIEW_SCENARIOS,
  themes: ['light', 'dark'],
  routes: ROUTES,

  /*
   * One priming load to install the fake session, so every later goto lands
   * inside the app rather than bouncing to /sign-in. The project id comes
   * from the session the harness wrote, so the script never has to know it;
   * it is written by a dynamic import that can land just after the load
   * event, so this polls rather than reading once.
   */
  async prime(page, { base }) {
    await page.goto(`${base}/?harness=1&signedOut=0`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const projectId = await page
      .waitForFunction(() => localStorage.getItem('projectId'), null, { timeout: 20_000 })
      .then((handle) => handle.jsonValue());
    const pieceSetId = await page.evaluate(() => localStorage.getItem('ap-harness-piece-set-id'));
    return { projectId, pieceSetId };
  },

  /*
   * Scenarios are switched by writing localStorage and reloading rather than
   * by clicking the panel: the panel exists for a person, and a script that
   * drives a UI to configure itself breaks every time the UI it is testing
   * changes. Coming home signed in first: a previous route may have navigated
   * off-origin, where localStorage is denied.
   */
  async apply(page, { base, scenario, theme }) {
    await page.goto(`${base}/?harness=1&signedOut=0`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.evaluate(
      ([value, themeValue]) => {
        localStorage.setItem('ap-harness-scenario', JSON.stringify(value));
        localStorage.setItem('vite-ui-theme', themeValue);
        localStorage.setItem('ap-harness-hide-panel', '1');
      },
      [scenario, theme],
    );
  },

  /*
   * `project:` routes live under `/projects/<id>/…`. Whether to withhold the
   * session travels in the URL rather than in localStorage: a route whose
   * button navigates off-origin leaves the page somewhere `localStorage`
   * throws on. The harness reads the params on load.
   */
  href(route, { ctx, filters }) {
    const path = (
      route.path.startsWith('project:')
        ? `/projects/${ctx.projectId}${route.path.slice('project:'.length)}`
        : route.path
    ).replace('{pieceSetId}', ctx.pieceSetId ?? '');
    const params = new URLSearchParams({
      signedOut: route.signedOut ? '1' : '0',
      strict: filters.strict ? '1' : '0',
      ...(route.query ?? {}),
    });
    return `${path}?${params}`;
  },

  /* A deadline leaves whatever was in flight still running; come home before
     the next route rather than shooting from wherever it landed. */
  async recover(page, { base }) {
    await page.goto(`${base}/?harness=1&signedOut=0`);
  },
};
