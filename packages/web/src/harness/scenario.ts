/*
 * What am I looking at, and who am I?
 *
 * The product changes shape along several axes at once — the licence, the
 * person's role, how much history exists, and whether anything is currently
 * broken. Designing against one combination is how a product ends up with a
 * beautiful populated state and a broken first run, or an enterprise screen a
 * community user can reach and cannot use.
 *
 * So the axes are explicit and switchable at runtime, with no reload: the
 * fixture adapter reads this store on every request, and the provider resets
 * the react-query cache when it changes. One page load, every state.
 *
 * This is a development tool. It is compiled out of production builds — see
 * `enabled.ts`.
 */

export type Edition = 'community' | 'free' | 'enterprise' | 'cloud';
export type Role = 'admin' | 'owner' | 'editor' | 'operator' | 'viewer';
export type Volume = 'first-run' | 'day-one' | 'established' | 'mature';
export type Health = 'clean' | 'mixed' | 'failing';
export type Theme = 'system' | 'light' | 'dark';

export type Scenario = {
  edition: Edition;
  role: Role;
  volume: Volume;
  health: Health;
  selfHosted: boolean;
  theme: Theme;
};

export const DEFAULT_SCENARIO: Scenario = {
  edition: 'enterprise',
  role: 'admin',
  volume: 'established',
  health: 'mixed',
  selfHosted: true,
  theme: 'system',
};

export const EDITIONS: { id: Edition; label: string; note: string }[] = [
  {
    id: 'community',
    label: 'Community',
    note: 'Open source. No SSO, audit log, project roles or releases.',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    note: 'Every feature, on your own machines.',
  },
  {
    id: 'cloud',
    label: 'Cloud',
    note: 'Every feature except infrastructure. We run the machines.',
  },
  {
    id: 'free',
    label: 'Cloud, free tier',
    note: 'Our machines, no paid features. Every lock offers an upgrade to buy.',
  },
];

/*
 * Two questions the fixtures keep asking, answered once.
 *
 * `isLicensed`: does this install have the paid features? Community is the
 * open-source build without a licence; free is the cloud tier below every paid
 * feature. Both see the locks — but a self-hosted lock says "talk to sales"
 * and a cloud lock says "upgrade", which is why they are different editions
 * rather than one.
 *
 * `isCloud`: do we run the machines? Decides whether billing is enforced and
 * whether there is infrastructure to configure.
 */
export const isLicensed = (scenario: Scenario): boolean =>
  scenario.edition === 'enterprise' || scenario.edition === 'cloud';
export const isCloud = (scenario: Scenario): boolean =>
  scenario.edition === 'cloud' || scenario.edition === 'free';

export const ROLES: { id: Role; label: string; note: string }[] = [
  {
    id: 'admin',
    label: 'Platform admin',
    note: 'Runs the installation. Sees the platform section.',
  },
  {
    id: 'owner',
    label: 'Project owner',
    note: 'Runs one project, including its members.',
  },
  { id: 'editor', label: 'Editor', note: 'Builds and changes automations.' },
  {
    id: 'operator',
    label: 'Operator',
    note: 'Runs things and answers approvals. Cannot build.',
  },
  { id: 'viewer', label: 'Viewer', note: 'Reads everything. Changes nothing.' },
];

export const VOLUMES: { id: Volume; label: string; note: string }[] = [
  {
    id: 'first-run',
    label: 'First run',
    note: 'Nothing exists yet. Every empty state.',
  },
  {
    id: 'day-one',
    label: 'Day one',
    note: 'A few flows, a little history. Lists that fit on screen.',
  },
  {
    id: 'established',
    label: '30 days',
    note: 'A working project with history.',
  },
  {
    id: 'mature',
    label: 'A year in',
    note: 'Full volume. Pagination, long names, overflow.',
  },
];

export const HEALTHS: { id: Health; label: string; note: string }[] = [
  {
    id: 'clean',
    label: 'All green',
    note: 'Nothing failing. No red anywhere.',
  },
  {
    id: 'mixed',
    label: 'Realistic',
    note: 'A handful of failures and one expired connection.',
  },
  {
    id: 'failing',
    label: 'Bad day',
    note: 'Failures everywhere. Every error surface at once.',
  },
];

/*
 * What the scenario is allowed to see and do.
 *
 * Two different words on purpose: `can` is about the person, `has` is about
 * the licence and the deployment. They fail differently — a role you lack is
 * somebody else's job, a feature you lack is a thing to buy — and screens
 * should be able to say which.
 */
export type Capabilities = {
  can: {
    admin: boolean;
    manageProject: boolean;
    build: boolean;
    approve: boolean;
  };
  has: {
    sso: boolean;
    auditLog: boolean;
    projectRoles: boolean;
    customRoles: boolean;
    environments: boolean;
    globalConnections: boolean;
    analytics: boolean;
    apiKeys: boolean;
    secretManagers: boolean;
    scim: boolean;
    managePieces: boolean;
    manageTemplates: boolean;
    customAppearance: boolean;
    embedding: boolean;
    workerGroups: boolean;
    eventStreaming: boolean;
    manyProjects: boolean;
  };
};

export function capabilitiesFor(scenario: Scenario): Capabilities {
  const licensed = isLicensed(scenario);
  const admin = scenario.role === 'admin';
  const owner = admin || scenario.role === 'owner';
  const editor = owner || scenario.role === 'editor';
  const operator = editor || scenario.role === 'operator';

  return {
    can: {
      admin,
      manageProject: owner,
      build: editor,
      approve: operator,
    },
    has: {
      sso: licensed,
      auditLog: licensed,
      projectRoles: licensed,
      customRoles: licensed,
      environments: licensed,
      globalConnections: licensed,
      analytics: licensed,
      apiKeys: licensed,
      secretManagers: licensed,
      scim: licensed,
      managePieces: licensed,
      manageTemplates: licensed,
      customAppearance: licensed,
      embedding: licensed,
      /* Cloud runs the machines, so worker groups are not the customer's to
         configure — the one feature the cloud edition does not get. */
      workerGroups: licensed && !isCloud(scenario),
      eventStreaming: licensed,
      manyProjects: licensed,
    },
  };
}

/* How much of everything exists, as a multiplier on every list's full size. */
export function volumeFactorFor(volume: Volume): number {
  switch (volume) {
    case 'first-run':
      return 0;
    case 'day-one':
      return 0.12;
    case 'established':
      return 0.45;
    case 'mature':
      return 1;
  }
}

/* What share of runs failed. Drives every status colour in the app. */
export function failureRateFor(health: Health): number {
  switch (health) {
    case 'clean':
      return 0;
    case 'mixed':
      return 0.14;
    case 'failing':
      return 0.62;
  }
}

/*
 * The store.
 *
 * Deliberately not React state: the axios adapter is called from outside the
 * tree and must see the current scenario synchronously. The provider mirrors
 * this into React and is the only thing that writes to it.
 */
const KEY = 'ap-harness-scenario';

function read(): Scenario {
  try {
    const saved = localStorage.getItem(KEY);
    return saved
      ? { ...DEFAULT_SCENARIO, ...(JSON.parse(saved) as Partial<Scenario>) }
      : DEFAULT_SCENARIO;
  } catch {
    /* Private windows and blocked site data both throw here. A default is a
       perfectly good answer. */
    return DEFAULT_SCENARIO;
  }
}

let current: Scenario = read();
const listeners = new Set<() => void>();

export const scenarioStore = {
  get(): Scenario {
    return current;
  },
  set(next: Partial<Scenario>): void {
    current = { ...current, ...next };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* Not worth telling anyone about; it still works for this session. */
    }
    listeners.forEach((listener) => listener());
  },
  reset(): void {
    scenarioStore.set(DEFAULT_SCENARIO);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
