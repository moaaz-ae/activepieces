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
  steps: ['role=button[name=/^Upgrade/]'],
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

/*
 * The builder, and the one flow it opens.
 *
 * `{flowId}` is resolved from the session the harness wrote, the same way
 * `{pieceSetId}` is, so the script never re-derives a seeded id.
 */
const BUILDER_PATH = 'project:/flows/{flowId}';
const BUILDER = [
  ['builder', BUILDER_PATH, { scenarios: ['typical'] }],
  [
    'builder-trigger',
    BUILDER_PATH,
    { scenarios: ['typical'], click: 'text="New Stripe event"' },
  ],
  [
    'builder-step',
    BUILDER_PATH,
    { scenarios: ['typical'], click: 'text="Look up the customer"' },
  ],
  /* The code step opens Monaco, which brings its own theme rather than the
     app's tokens — the one surface in the builder that can be left behind by
     a palette change without anything else looking wrong. */
  [
    'builder-code',
    BUILDER_PATH,
    { scenarios: ['typical'], click: 'text="Normalise the payload"' },
  ],
  [
    'builder-router',
    BUILDER_PATH,
    { scenarios: ['typical'], click: 'text="Split by plan"' },
  ],
];

/*
 * Project settings: a dialog, not a page.
 *
 * Opened from the team-members button in the project header (the gear beside
 * it carries no accessible name, so there is nothing to address it by). That
 * button lands on the Members tab; the rest are one more click down the left
 * nav, whose items are plain rows rather than tabs, hence the text locators.
 */
const OPEN_PROJECT_SETTINGS = 'role=button[name=/team member/i]';
const PROJECT_SETTINGS_STATES = [
  { name: 'settings-members', scenarios: ['typical'], steps: [OPEN_PROJECT_SETTINGS] },
  {
    name: 'settings-general',
    scenarios: ['typical'],
    steps: [OPEN_PROJECT_SETTINGS, 'nav >> text="General"'],
  },
  {
    name: 'settings-alerts',
    scenarios: ['typical'],
    steps: [OPEN_PROJECT_SETTINGS, 'nav >> text="Alert Emails"'],
  },
  {
    name: 'settings-pieces',
    scenarios: ['typical'],
    steps: [OPEN_PROJECT_SETTINGS, 'nav >> text="Pieces"'],
  },
  /* Cmd-K. The handler takes either modifier, so this works off a Mac too. */
  { name: 'search', scenarios: ['typical'], steps: [{ press: 'Meta+k' }] },
];

const ROUTES = [
  /* ---------------------------------------------------------- the product */
  ['chat', '/chat'],
  ['agents', '/agents'],
  ['impact', '/impact'],
  ['mcp', '/mcp-server'],
  /* The MCP tabs are path segments here, unlike the platform-side MCP page. */
  ['mcp-pieces', '/mcp-server/pieces'],
  ['mcp-connections', '/mcp-server/connections'],
  [
    'mcp-activity',
    '/mcp-server/activity',
    {
      /* The only Sheet in the whole matrix: a right-hand drawer, which is a
         ground no dialog shot covers. */
      states: [
        { name: 'detail', scenarios: ['typical'], steps: ['table tbody tr'] },
      ],
    },
  ],
  ['templates', '/templates'],
  /* `/v1/templates/:id` falls back to the first row, so any id resolves. */
  ['template', '/templates/harness-template'],
  ['not-found', '/404', { paint: { minBoxes: 3, minChars: 20 } }],
  /*
   * `project:/flows` and `project:/tables` used to be here. Both render
   * `<Navigate to="/automations">`, so both were duplicates of the
   * `automations` shot — 32 screenshots of a redirect.
   */
  ['automations', 'project:/automations', { states: PROJECT_SETTINGS_STATES }],
  ['runs', 'project:/runs'],
  [
    'connections',
    'project:/connections',
    {
      states: [
        /* The picker: every connectable piece as a grid of logos. */
        { name: 'new', scenarios: ['typical'], steps: ['role=button[name=/new connection/i]'] },
        /*
         * The dynamic form behind it. PostgreSQL declares BASIC_AUTH in the
         * fixture registry, so the property renderer draws real fields rather
         * than the single OAuth button every other piece would give.
         */
        {
          name: 'create',
          scenarios: ['typical'],
          steps: ['role=button[name=/new connection/i]', 'text="PostgreSQL"'],
        },
        /* The same dialog for an OAuth2 piece — a different shape entirely. */
        {
          name: 'create-oauth',
          scenarios: ['typical'],
          steps: ['role=button[name=/new connection/i]', 'text="Slack"'],
        },
      ],
    },
  ],
  ['approvals', 'project:/approvals'],
  /*
   * ------------------------------------------------------------ the builder
   *
   * One flow, opened five ways. The canvas is the app's densest screen and
   * none of the list routes say anything about it: step cards on a dotted
   * ground, the connectors between them, a router's two branch labels, and —
   * behind a click — the settings panel, which is the only place in the
   * product a form sits on a panel over a canvas.
   *
   * The clicks address steps by the name a person reads on the card, which is
   * why flow 0's graph is hand-written in the fixtures rather than seeded:
   * these five literals are its labels.
   *
   * Scenarios are deliberately few. The canvas does not change with volume or
   * health — it is one flow either way — so shooting it in six worlds is six
   * copies of the same picture. `empty` is excluded for the opposite reason:
   * that world has flows too (the volume floor is 1), but nothing about the
   * builder is an empty state.
   */
  ...BUILDER,
  ['releases', 'project:/releases'],
  /*
   * `project:/settings` used to be here. It renders `SettingsRerouter`, which
   * navigates to `/settings/team` — a route nothing registers — so the shot
   * fell through the catch-all onto the default page and reviewed nothing.
   * Project settings is a dialog; it is photographed as
   * `automations__*__settings-*` above.
   */

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
    '/platform/billing',
    {
      ...ADMIN,
      states: [
        {
          name: 'plans',
          scenarios: ['typical', 'free', 'cloud'],
          steps: ['role=button[name=/explore plans|upgrade plan/i]'],
        },
        { name: 'credits', scenarios: ['cloud'], steps: ['text="Usage breakdown"'] },
        {
          name: 'seats',
          scenarios: ['cloud'],
          steps: ['role=button[name=/manage seats|add seats/i]'],
        },
        {
          name: 'auto-recharge',
          scenarios: ['cloud'],
          steps: ['role=button[name=/^edit$/i]'],
        },
      ],
    },
  ],
  /*
   * The three money dialogs live on the billing page, not the usage page —
   * the usage tab is only `FeatureUsageCards` plus a project table, and the
   * cards that own these buttons (credits, seats, auto-recharge) are rendered
   * by `/platform/billing`.
   */
  ['platform-usage', '/platform/usage', ADMIN],
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
    const flowId = await page.evaluate(() => localStorage.getItem('ap-harness-flow-id'));
    return { projectId, pieceSetId, flowId };
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
    )
      .replace('{pieceSetId}', ctx.pieceSetId ?? '')
      .replace('{flowId}', ctx.flowId ?? '');
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
