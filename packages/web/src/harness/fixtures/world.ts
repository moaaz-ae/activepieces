/*
 * The world, built from a scenario.
 *
 * One pure function per entity family, all seeded from the scenario, and the
 * whole thing memoised on the scenario key — so switching an axis rebuilds
 * everything once and every screen agrees about what exists.
 *
 * Relationships are real: a run points at a flow that exists, a connection
 * lists the flows that actually use it, a folder's count matches its flows.
 * Fixtures that disagree with each other are worse than no fixtures, because
 * the screen looks right and the design decision it supports is wrong.
 */

import {
  AppConnectionScope,
  AppConnectionStatus,
  AppConnectionType,
  AppConnectionWithoutSensitiveData,
  BranchExecutionType,
  BranchOperator,
  ColorName,
  FlowRun,
  FlowRunStatus,
  FlowActionType,
  FlowStatus,
  FlowTriggerType,
  AgentIcon,
  AgentSummary,
  AgentVisibility,
  FlowVersionState,
  FolderDto,
  PlatformRole,
  PlatformWithoutSensitiveData,
  PopulatedFlow,
  ProjectType,
  ProjectWithLimits,
  RouterExecutionType,
  RunEnvironment,
  UserStatus,
  UserWithMetaInformation,
} from '@activepieces/shared';

import {
  capabilitiesFor,
  failureRateFor,
  isCloud,
  isLicensed,
  Scenario,
  volumeFactorFor,
} from '../scenario';

import {
  AGENT_NAMES,
  CODE_STEPS,
  FAILURE_MESSAGES,
  FLOW_NAMES,
  FOLDER_NAMES,
  PEOPLE,
  PIECE_ACTIONS,
  PIECE_BY_NAME,
  PIECES,
  PROJECT_NAMES,
  TABLE_NAMES,
} from './catalog';
import { idFrom, isoAgo, rngFor } from './rng';

export const PLATFORM_ID = idFrom('platform');
export const PROJECT_ID = idFrom('project-0');
export const USER_ID = idFrom('user-0');
/* The flow a screenshot run opens in the builder. Its id is seeded from the
   index alone, so it is the same flow in every scenario that has one. */
export const FLOW_ID = idFrom('flow-0');

const STRIPE = '@activepieces/piece-stripe';

export type World = {
  scenario: Scenario;
  user: UserWithMetaInformation;
  users: UserWithMetaInformation[];
  platform: PlatformWithoutSensitiveData;
  projects: ProjectWithLimits[];
  folders: FolderDto[];
  flows: PopulatedFlow[];
  runs: FlowRun[];
  connections: AppConnectionWithoutSensitiveData[];
  agents: AgentFixture[];
  tables: TableFixture[];
};

export type AgentFixture = AgentSummary;

export type TableFixture = {
  id: string;
  name: string;
  projectId: string;
  externalId: string;
  created: string;
  updated: string;
};

/* How many of each thing exists at full volume. Scaled by the volume axis. */
const FULL = {
  flows: 30,
  runs: 220,
  connections: 14,
  agents: 7,
  tables: 6,
  users: 8,
  projects: 5,
};

function sizeOf(kind: keyof typeof FULL, scenario: Scenario): number {
  const factor = volumeFactorFor(scenario.volume);
  if (factor === 0) return 0;
  return Math.max(1, Math.round(FULL[kind] * factor));
}

function people(scenario: Scenario): UserWithMetaInformation[] {
  const count = Math.max(1, sizeOf('users', scenario));
  return PEOPLE.slice(0, count).map((person, index) => ({
    id: index === 0 ? USER_ID : idFrom(`user-${index}`),
    email: person.email,
    firstName: person.firstName,
    lastName: person.lastName,
    status: UserStatus.ACTIVE,
    externalId: null,
    platformId: PLATFORM_ID,
    platformRole: index === 0 ? PlatformRole.ADMIN : PlatformRole.MEMBER,
    created: isoAgo(60 * 24 * 400),
    updated: isoAgo(60 * 24 * 3),
    lastActiveDate: isoAgo(rngFor(`active-${index}`).agoMinutes(7)),
    imageUrl: null,
  }));
}

/*
 * The licence, as the app actually reads it.
 *
 * Every EE lock in the web app resolves to one of these booleans or to the
 * EDITION flag, which is why the harness can unlock enterprise without a
 * single change to production code — and, more usefully, why it can show the
 * *locked* state too. A locked screen is a design surface, not an absence.
 */
function platform(scenario: Scenario): PlatformWithoutSensitiveData {
  const { has } = capabilitiesFor(scenario);
  const licensed = isLicensed(scenario);

  return {
    id: PLATFORM_ID,
    created: isoAgo(60 * 24 * 400),
    updated: isoAgo(60 * 24),
    ownerId: USER_ID,
    name: 'Northwind',
    primaryColor: '#6e41e2',
    logoIconUrl: 'https://cdn.activepieces.com/brand/logo.svg',
    fullLogoUrl: 'https://cdn.activepieces.com/brand/full-logo.png',
    favIconUrl: 'https://cdn.activepieces.com/brand/favicon.ico',
    cloudAuthEnabled: true,
    googleAuthEnabled: true,
    enforceAllowedAuthDomains: false,
    allowedAuthDomains: [],
    allowedEmbedOrigins: [],
    ssoDomain: null,
    ssoDomainVerification: null,
    emailAuthEnabled: true,
    autoCreatePersonalProjects: true,
    pinnedPieces: ['@activepieces/piece-slack', '@activepieces/piece-gmail'],
    pieceSelectorConfig: null,
    federatedAuthProviders: null,
    billingEnforced: isCloud(scenario),
    plan: {
      plan: licensed ? 'enterprise' : null,
      includedCredits: licensed ? 50_000 : 1_000,
      tablesEnabled: true,
      eventStreamingEnabled: has.eventStreaming,
      environmentsEnabled: has.environments,
      analyticsEnabled: has.analytics,
      showPoweredBy: !licensed,
      auditLogEnabled: has.auditLog,
      embeddingEnabled: has.embedding,
      aiProvidersEnabled: true,
      chatEnabled: true,
      agentsEnabled: true,
      workerGroupsEnabled: has.workerGroups,
      managePiecesEnabled: has.managePieces,
      manageTemplatesEnabled: has.manageTemplates,
      customAppearanceEnabled: has.customAppearance,
      billedTeamProjectsLimit: null,
      usersLimit: licensed ? null : 5,
      scheduledUsersLimit: null,
      projectRolesEnabled: has.projectRoles,
      globalConnectionsEnabled: has.globalConnections,
      customRolesEnabled: has.customRoles,
      apiKeysEnabled: has.apiKeys,
      ssoEnabled: has.sso,
      secretManagersEnabled: has.secretManagers,
      scimEnabled: has.scim,
      licenseKey: licensed ? 'ap-ee-fixture-key' : null,
      licenseExpiresAt: licensed ? isoAgo(-60 * 24 * 300) : null,
      projectsLimit: has.manyProjects ? null : 1,
      activeFlowsLimit: null,
      dedicatedWorkers: null,
      canary: false,
      customDomainsEnabled: licensed,
      workerGroupId: null,
    },
  };
}

function projects(scenario: Scenario): ProjectWithLimits[] {
  const { has } = capabilitiesFor(scenario);
  const count = has.manyProjects
    ? Math.max(1, sizeOf('projects', scenario))
    : 1;
  const colors = Object.values(ColorName);

  return PROJECT_NAMES.slice(0, Math.max(1, count)).map((name, index) => {
    const id = index === 0 ? PROJECT_ID : idFrom(`project-${index}`);
    return {
      id,
      created: isoAgo(60 * 24 * 300),
      updated: isoAgo(60 * 24),
      ownerId: USER_ID,
      displayName: name,
      platformId: PLATFORM_ID,
      maxConcurrentJobs: null,
      type: index === 0 ? ProjectType.TEAM : ProjectType.PERSONAL,
      icon: { color: colors[index % colors.length] },
      externalId: null,
      releasesEnabled: has.environments,
      notifyFlowOwnerOnFailure: true,
      metadata: null,
      poolId: null,
      /* Two projects on custom piece sets, so the piece-set screens have a
         project to list. The ids match `admin-security.ts`, spelled out here
         rather than imported so the world stays at the bottom of the graph. */
      pieceSetId:
        index === 1
          ? idFrom('piece-set-1')
          : index === 3
          ? idFrom('piece-set-2')
          : null,
      /* One project on a dedicated group, so the worker-groups screen has a
         card with something in it. Its name matches the fixture machines. */
      workerGroupId: has.workerGroups && index === 1 ? 'finance_eu' : null,
      executionDataRetentionDays: 30,
      sensitive: false,
      plan: {
        id: idFrom(`project-plan-${index}`),
        created: isoAgo(60 * 24 * 300),
        updated: isoAgo(60 * 24),
        projectId: id,
        locked: false,
        name: 'free',
        piecesFilterType:
          'NONE' as ProjectWithLimits['plan']['piecesFilterType'],
        pieces: [],
        activeFlowsLimit: null,
      },
      analytics: {
        totalUsers: PEOPLE.length,
        activeUsers: Math.max(1, Math.round(PEOPLE.length * 0.6)),
        totalFlows: sizeOf('flows', scenario),
        activeFlows: Math.round(sizeOf('flows', scenario) * 0.7),
      },
    } as ProjectWithLimits;
  });
}

function folders(scenario: Scenario, flowCount: number): FolderDto[] {
  if (flowCount === 0) return [];
  const count = Math.min(
    FOLDER_NAMES.length,
    Math.max(1, Math.ceil(flowCount / 7)),
  );
  return FOLDER_NAMES.slice(0, count).map((name, index) => ({
    id: idFrom(`folder-${index}`),
    created: isoAgo(60 * 24 * 200),
    updated: isoAgo(60 * 24 * 5),
    displayName: name,
    displayOrder: index,
    externalId: null,
    projectId: PROJECT_ID,
    /* Filled in by `build` once the flows exist, so the number next to a
       folder is the number of rows you get when you click it. */
    numberOfFlows: 0,
    numberOfTables: 0,
  }));
}

/*
 * The steps inside a flow.
 *
 * The lists only ever read a flow's name and status, so until the builder was
 * shot every fixture flow was a lone trigger with nothing after it. That is a
 * fine row and a useless canvas: the builder's whole subject is the column of
 * step cards, the connectors between them and the branch that splits them, and
 * a one-node canvas photographs none of it.
 *
 * So a flow now has a body: a piece action, sometimes a code step, sometimes a
 * router with two branches under it, and a last piece action after the join.
 * Seeded from the flow's own index, so flow-3 has the same shape in every run
 * and a screenshot diff is the design changing.
 */
function pieceStep({
  name,
  created,
  pieceName,
  actionName,
  displayName,
  nextAction,
}: {
  name: string;
  created: string;
  pieceName: string;
  actionName: string;
  displayName: string;
  nextAction?: unknown;
}): unknown {
  return {
    name,
    valid: true,
    displayName,
    type: FlowActionType.PIECE,
    lastUpdatedDate: created,
    settings: {
      pieceName,
      pieceVersion: '0.1.0',
      pieceType: 'OFFICIAL',
      packageType: 'REGISTRY',
      actionName,
      input: {},
      inputUiInfo: {},
      propertySettings: {},
      errorHandlingOptions: {
        continueOnFailure: { value: false },
        retryOnFailure: { value: false },
      },
    },
    nextAction,
  };
}

function randomPieceStep({
  rng,
  name,
  created,
  nextAction,
}: {
  rng: ReturnType<typeof rngFor>;
  name: string;
  created: string;
  nextAction?: unknown;
}): unknown {
  const piece = rng.pick(PIECES);
  const action = rng.pick(PIECE_ACTIONS);
  return pieceStep({
    name,
    created,
    pieceName: `@activepieces/piece-${piece.name}`,
    actionName: action.name,
    displayName: action.displayName,
    nextAction,
  });
}

function codeStep({
  name,
  created,
  displayName,
  nextAction,
}: {
  name: string;
  created: string;
  displayName: string;
  nextAction?: unknown;
}): unknown {
  return {
    name,
    valid: true,
    displayName,
    type: FlowActionType.CODE,
    lastUpdatedDate: created,
    settings: {
      sourceCode: {
        code: 'export const code = async (inputs) => {\n  return inputs;\n};\n',
        packageJson: '{}',
      },
      input: {},
      inputUiInfo: {},
      errorHandlingOptions: {
        continueOnFailure: { value: false },
        retryOnFailure: { value: false },
      },
    },
    nextAction,
  };
}

function randomCodeStep({
  rng,
  name,
  created,
  nextAction,
}: {
  rng: ReturnType<typeof rngFor>;
  name: string;
  created: string;
  nextAction?: unknown;
}): unknown {
  return codeStep({
    name,
    created,
    displayName: rng.pick(CODE_STEPS).displayName,
    nextAction,
  });
}

/* Two branches, because one is not a fork. The fallback is the second one:
   that is how the product words "otherwise", and the canvas draws its label
   differently. */
function routerStep({
  name,
  created,
  children,
  nextAction,
}: {
  name: string;
  created: string;
  children: unknown[];
  nextAction?: unknown;
}): unknown {
  return {
    name,
    valid: true,
    displayName: 'Split by plan',
    type: FlowActionType.ROUTER,
    lastUpdatedDate: created,
    settings: {
      executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
      branches: [
        {
          branchType: BranchExecutionType.CONDITION,
          branchName: 'Enterprise',
          conditions: [
            [
              {
                operator: BranchOperator.TEXT_CONTAINS,
                firstValue: '{{trigger.plan}}',
                secondValue: 'enterprise',
                caseSensitive: false,
              },
            ],
          ],
        },
        { branchType: BranchExecutionType.FALLBACK, branchName: 'Otherwise' },
      ],
      inputUiInfo: {},
    },
    children,
    nextAction,
  };
}

/*
 * The flow the screenshots open.
 *
 * Hand-written rather than seeded, because a screenshot script has to click a
 * step and the only handle a canvas node offers a person is its name. Seeded
 * names are stable run to run but unknowable from outside the app, so the
 * script would be addressing markup instead. This one reads as the flow it is
 * named after — a Stripe payment fanning out by plan — and every label in it
 * is a literal a target file can name.
 */
function curatedSteps(created: string): unknown {
  return pieceStep({
    name: 'step_1',
    created,
    pieceName: '@activepieces/piece-stripe',
    actionName: 'get_customer',
    displayName: 'Look up the customer',
    nextAction: codeStep({
      name: 'step_2',
      created,
      /* A code step is in the curated flow on purpose: selecting it opens
         Monaco, whose own theme is the one surface in the builder that does
         not read the app's tokens, so it has to be photographed. */
      displayName: 'Normalise the payload',
      nextAction: routerStep({
        name: 'step_3',
        created,
        children: [
          pieceStep({
            name: 'step_4',
            created,
            pieceName: '@activepieces/piece-slack',
            actionName: 'send_message',
            displayName: 'Post to #revenue',
          }),
          pieceStep({
            name: 'step_5',
            created,
            pieceName: '@activepieces/piece-gmail',
            actionName: 'send_email',
            displayName: 'Email the finance inbox',
          }),
        ],
        nextAction: pieceStep({
          name: 'step_6',
          created,
          pieceName: '@activepieces/piece-google-sheets',
          actionName: 'add_row',
          displayName: 'Append a row to the ledger',
        }),
      }),
    }),
  });
}

function stepsFor({
  rng,
  created,
  branching,
}: {
  rng: ReturnType<typeof rngFor>;
  created: string;
  branching: boolean;
}): unknown {
  if (!branching) {
    return randomPieceStep({
      rng,
      name: 'step_1',
      created,
      nextAction: randomCodeStep({
        rng,
        name: 'step_2',
        created,
        nextAction: randomPieceStep({ rng, name: 'step_3', created }),
      }),
    });
  }

  return randomPieceStep({
    rng,
    name: 'step_1',
    created,
    nextAction: routerStep({
      name: 'step_2',
      created,
      children: [
        randomPieceStep({ rng, name: 'step_3', created }),
        randomPieceStep({ rng, name: 'step_4', created }),
      ],
      nextAction: randomPieceStep({ rng, name: 'step_5', created }),
    }),
  });
}

function flows(scenario: Scenario, folderList: FolderDto[]): PopulatedFlow[] {
  const count = sizeOf('flows', scenario);
  const failureRate = failureRateFor(scenario.health);

  return Array.from({ length: count }, (_, index) => {
    const rng = rngFor(`flow-${index}-${scenario.volume}`);
    const name = FLOW_NAMES[index % FLOW_NAMES.length];
    const id = idFrom(`flow-${index}`);
    const versionId = idFrom(`flow-version-${index}`);
    /* Flow 0 is the one the screenshots open, so its trigger is pinned to the
       piece its name promises. The pick still happens, so every other flow
       keeps the world it had. */
    const picked = rng.pick(PIECES);
    const piece = index === 0 ? PIECE_BY_NAME.get(STRIPE) ?? picked : picked;
    const folder = folderList.length > 0 ? rng.pick(folderList) : undefined;
    /* Most flows in a real project are on; the disabled ones are the ones
       somebody paused after it misbehaved, so they cluster with failures. */
    const enabled = rng.next() > 0.18 + failureRate * 0.2;
    const created = isoAgo(rng.int(60 * 24 * 7, 60 * 24 * 300));
    /* Every third flow forks. Enough that a branch is never more than a few
       flows away, rare enough that the plain linear canvas is still the one
       most screenshots land on — which is also true of real projects. */
    const steps =
      index === 0
        ? curatedSteps(created)
        : stepsFor({
            rng: rngFor(`flow-steps-${index}`),
            created,
            branching: index % 3 === 0,
          });

    return {
      id,
      created,
      updated: isoAgo(rng.agoMinutes(20)),
      projectId: PROJECT_ID,
      externalId: id,
      ownerId: USER_ID,
      folderId: folder?.id ?? null,
      status: enabled ? FlowStatus.ENABLED : FlowStatus.DISABLED,
      publishedVersionId: enabled ? versionId : null,
      metadata: null,
      operationStatus: 'NONE',
      timeSavedPerRun: rng.chance(0.4) ? rng.int(2, 25) : null,
      templateId: null,
      createdBy: null,
      version: {
        id: versionId,
        created,
        updated: isoAgo(rng.agoMinutes(20)),
        flowId: id,
        displayName: name,
        updatedBy: USER_ID,
        valid: true,
        schemaVersion: '1',
        agentIds: [],
        state: enabled ? FlowVersionState.LOCKED : FlowVersionState.DRAFT,
        connectionIds: [],
        backupFiles: null,
        notes: [],
        trigger: {
          name: 'trigger',
          valid: true,
          displayName: `New ${piece.displayName} event`,
          type: FlowTriggerType.PIECE,
          lastUpdatedDate: created,
          settings: {
            pieceName: `@activepieces/piece-${piece.name}`,
            pieceVersion: '0.1.0',
            pieceType: 'OFFICIAL',
            packageType: 'REGISTRY',
            triggerName: 'new_event',
            input: {},
            inputUiInfo: {},
            propertySettings: {},
          },
          nextAction: steps,
        },
      },
    } as unknown as PopulatedFlow;
  });
}

/*
 * Run statuses.
 *
 * Weighted so the list looks like a real one: mostly succeeded, a few running
 * or queued at the top because those are the recent ones, and failures at
 * whatever rate the health axis asks for. A uniform spread across eleven
 * statuses is a legend, not a list.
 */
function statusFor(
  rng: ReturnType<typeof rngFor>,
  failureRate: number,
): FlowRunStatus {
  if (rng.chance(failureRate)) {
    return rng.pick([
      FlowRunStatus.FAILED,
      FlowRunStatus.FAILED,
      FlowRunStatus.FAILED,
      FlowRunStatus.TIMEOUT,
      FlowRunStatus.INTERNAL_ERROR,
      FlowRunStatus.QUOTA_EXCEEDED,
      FlowRunStatus.MEMORY_LIMIT_EXCEEDED,
    ]);
  }
  if (rng.chance(0.06)) return FlowRunStatus.RUNNING;
  if (rng.chance(0.04)) return FlowRunStatus.QUEUED;
  if (rng.chance(0.03)) return FlowRunStatus.PAUSED;
  return FlowRunStatus.SUCCEEDED;
}

function runs(scenario: Scenario, flowList: PopulatedFlow[]): FlowRun[] {
  if (flowList.length === 0) return [];
  const count = sizeOf('runs', scenario);
  const failureRate = failureRateFor(scenario.health);

  return Array.from({ length: count }, (_, index) => {
    const rng = rngFor(`run-${index}-${scenario.health}-${scenario.volume}`);
    const flow = rng.pick(flowList);
    const status = statusFor(rng, failureRate);
    const startedMinutesAgo = rng.agoMinutes(14);
    const durationMs = rng.int(180, 42_000);
    const failed = [
      FlowRunStatus.FAILED,
      FlowRunStatus.INTERNAL_ERROR,
      FlowRunStatus.TIMEOUT,
      FlowRunStatus.QUOTA_EXCEEDED,
      FlowRunStatus.MEMORY_LIMIT_EXCEEDED,
    ].includes(status);
    const finished =
      status !== FlowRunStatus.RUNNING && status !== FlowRunStatus.QUEUED;

    return {
      id: idFrom(`run-${index}`),
      created: isoAgo(startedMinutesAgo),
      updated: isoAgo(startedMinutesAgo),
      projectId: PROJECT_ID,
      flowId: flow.id,
      failParentOnFailure: true,
      flowVersionId: flow.version.id,
      flowVersion: { displayName: flow.version.displayName },
      logsFileId: null,
      status,
      startTime: isoAgo(startedMinutesAgo),
      finishTime: finished
        ? isoAgo(startedMinutesAgo - durationMs / 60_000)
        : null,
      environment: RunEnvironment.PRODUCTION,
      steps: null,
      failedStep: failed
        ? {
            name: 'step_2',
            displayName: 'Send message',
            message: rng.pick(FAILURE_MESSAGES),
          }
        : undefined,
      archivedAt: null,
      stepsCount: rng.int(2, 9),
      tags: [],
    } as unknown as FlowRun;
  }).sort(
    (left, right) =>
      new Date(right.startTime ?? right.created).getTime() -
      new Date(left.startTime ?? left.created).getTime(),
  );
}

function connections(
  scenario: Scenario,
  flowList: PopulatedFlow[],
  owner: UserWithMetaInformation,
): AppConnectionWithoutSensitiveData[] {
  const count = sizeOf('connections', scenario);
  const failureRate = failureRateFor(scenario.health);
  const authPieces = PIECES.filter((piece) => piece.auth);

  return Array.from({ length: count }, (_, index) => {
    const rng = rngFor(`connection-${index}-${scenario.health}`);
    const piece = authPieces[index % authPieces.length];
    /* One broken connection is the interesting case even on a good day — it is
       the thing the connections screen exists to surface. */
    const broken =
      index === 1 ? scenario.health !== 'clean' : rng.chance(failureRate * 0.5);
    const usedBy = rng.some(flowList, rng.int(0, 4));

    return {
      id: idFrom(`connection-${index}`),
      created: isoAgo(rng.int(60 * 24 * 10, 60 * 24 * 300)),
      updated: isoAgo(rng.agoMinutes(30)),
      externalId: `${piece.name}-${index}`,
      displayName:
        index % 4 === 0
          ? `${piece.displayName} (production)`
          : piece.displayName,
      type:
        piece.name === 'postgres'
          ? AppConnectionType.BASIC_AUTH
          : AppConnectionType.OAUTH2,
      pieceName: `@activepieces/piece-${piece.name}`,
      projectIds: [PROJECT_ID],
      platformId: PLATFORM_ID,
      scope: AppConnectionScope.PROJECT,
      status: broken ? AppConnectionStatus.ERROR : AppConnectionStatus.ACTIVE,
      ownerId: owner.id,
      owner,
      metadata: null,
      flowIds: usedBy.map((flow) => flow.id),
      pieceVersion: '0.1.0',
      preSelectForNewProjects: false,
      usingSecretManager: false,
    } as AppConnectionWithoutSensitiveData;
  });
}

/*
 * Agents carry an icon and a colour that the card paints itself from, so the
 * spread across the list is a design decision rather than a detail — seven
 * agents in one colour is a very different page from seven in seven.
 */
const AGENT_ICONS: AgentIcon[] = [
  AgentIcon.MESSAGE,
  AgentIcon.CHART,
  AgentIcon.SEARCH,
  AgentIcon.FILE,
  AgentIcon.BOOK,
  AgentIcon.ZAP,
  AgentIcon.USERS,
];

const AGENT_COLORS: ColorName[] = [
  ColorName.PURPLE,
  ColorName.BLUE,
  ColorName.GREEN,
  ColorName.ORANGE,
  ColorName.PINK,
  ColorName.CYAN,
  ColorName.VIOLET,
];

function agents(scenario: Scenario): AgentFixture[] {
  const count = sizeOf('agents', scenario);
  return AGENT_NAMES.slice(0, count).map((agent, index) => {
    const rng = rngFor(`agent-${index}`);
    const tools = rng.some(PIECES, rng.int(1, 4));
    return {
      id: idFrom(`agent-${index}`),
      created: isoAgo(60 * 24 * 40),
      updated: isoAgo(rng.agoMinutes(20)),
      projectId: PROJECT_ID,
      ownerId: USER_ID,
      externalId: idFrom(`agent-external-${index}`),
      displayName: agent.name,
      description: agent.description,
      icon: AGENT_ICONS[index % AGENT_ICONS.length],
      color: AGENT_COLORS[index % AGENT_COLORS.length],
      /* One restricted agent, so the lock badge on the card is exercised. */
      visibility:
        index === 2 ? AgentVisibility.RESTRICTED : AgentVisibility.PROJECT,
      sharedWithUserIds: [],
      isPublished: index !== 3,
      toolCount: tools.length,
      toolPieceNames: tools.map((piece) => `@activepieces/piece-${piece.name}`),
      projectDisplayName: PROJECT_NAMES[0],
      projectIsPrivate: false,
    };
  });
}

function tables(scenario: Scenario): TableFixture[] {
  const count = sizeOf('tables', scenario);
  return TABLE_NAMES.slice(0, count).map((name, index) => ({
    id: idFrom(`table-${index}`),
    name,
    projectId: PROJECT_ID,
    externalId: `table-${index}`,
    created: isoAgo(60 * 24 * 90),
    updated: isoAgo(60 * 24 * 2),
  }));
}

function build(scenario: Scenario): World {
  const users = people(scenario);
  const owner = users[0];
  const folderList = folders(scenario, sizeOf('flows', scenario));
  const flowList = flows(scenario, folderList);

  folderList.forEach((folder) => {
    folder.numberOfFlows = flowList.filter(
      (flow) => flow.folderId === folder.id,
    ).length;
  });

  return {
    scenario,
    user: owner,
    users,
    platform: platform(scenario),
    projects: projects(scenario),
    folders: folderList,
    flows: flowList,
    runs: runs(scenario, flowList),
    connections: connections(scenario, flowList, owner),
    agents: agents(scenario),
    tables: tables(scenario),
  };
}

/* Only the axes that change data are part of the key — theme does not rebuild
   the world, and rebuilding on it would throw away scroll position for nothing. */
function keyFor(scenario: Scenario): string {
  return [
    scenario.edition,
    scenario.role,
    scenario.volume,
    scenario.health,
    String(scenario.selfHosted),
  ].join('|');
}

let cached: { key: string; world: World } | null = null;

export function worldFor(scenario: Scenario): World {
  const key = keyFor(scenario);
  if (cached?.key !== key) {
    cached = { key, world: build(scenario) };
  }
  return cached.world;
}
