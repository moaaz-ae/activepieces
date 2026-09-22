/*
 * The platform admin's Security and Setup screens.
 *
 * API keys, signing keys, OAuth apps, secret managers, audit log, event
 * destinations, project roles, piece sets, templates, invitations, global and
 * platform-wide connections, AI providers and the platform MCP server. None of
 * these had a fixture, so every one of those screens rendered its empty state
 * regardless of the volume axis — which is exactly the state you cannot design
 * a table from.
 *
 * Everything here is derived from the same world as the rest of the app: an
 * audit event is about a flow that exists, performed by a user in the list,
 * in a project you can click through to. The volumes scale with the volume
 * axis, the broken things with the health axis, and the paid features vanish
 * on a community licence.
 */

import {
  AgentActionKind,
  AgentActionOutcome,
  AgentRunSource,
  AIProviderModel,
  AIProviderModelType,
  AIProviderName,
  AIProviderWithoutSensitiveData,
  ApiKeyResponseWithoutValue,
  AppConnectionScope,
  AppConnectionStatus,
  AppConnectionType,
  AppConnectionWithoutSensitiveData,
  ApplicationEvent,
  ApplicationEventName,
  EventDestination,
  EventDestinationScope,
  FlowActionType,
  FlowOperationType,
  FlowRunStatus,
  FlowStatus,
  FlowTriggerType,
  InvitationStatus,
  InvitationType,
  KeyAlgorithm,
  McpOAuthClientKey,
  McpServer,
  McpServerType,
  OAuthApp,
  Permission,
  PieceSelectionMode,
  PieceSet,
  PlatformAppConnectionOwnersResponse,
  PlatformAppConnectionsListItem,
  PlatformRole,
  PopulatedMcpActivity,
  ProjectAIProvider,
  ProjectRole,
  RoleType,
  RunEnvironment,
  SecretManagerConnectionScope,
  SecretManagerConnectionWithStatus,
  SecretManagerConnectionWithStatusSchema,
  SecretManagerProviderId,
  SigningKey,
  Template,
  TemplateStatus,
  TemplateType,
  UserInvitation,
} from '@activepieces/shared';
import { z } from 'zod';

import { page, Query, Route, Shape } from '../routes';
import { failureRateFor, isLicensed, volumeFactorFor } from '../scenario';

import { EDITOR, OPERATOR, OWNER, READ_ONLY } from './access';
import { PIECES } from './catalog';
import { idFrom, isoAgo, rngFor } from './rng';
import { PLATFORM_ID, PROJECT_ID, World } from './world';

/* The first custom piece set. Stable so a route can address its detail page,
   and so `world.ts` can assign a project to it without importing this file. */
export const PIECE_SET_ID = idFrom('piece-set-1');
export const SECOND_PIECE_SET_ID = idFrom('piece-set-2');

/* How many of each thing exists at full volume. Scaled by the volume axis. */
const FULL = {
  apiKeys: 5,
  signingKeys: 2,
  oauthApps: 3,
  secretManagers: 2,
  auditEvents: 120,
  destinations: 3,
  templates: 8,
  invitations: 3,
  globalConnections: 4,
  aiProviders: 3,
  mcpActivity: 48,
};

function sizeOf(kind: keyof typeof FULL, world: World): number {
  const factor = volumeFactorFor(world.scenario.volume);
  if (factor === 0) return 0;
  return Math.max(1, Math.round(FULL[kind] * factor));
}

/*
 * A SeekPage shape for a list endpoint, so the check covers the envelope as
 * well as the rows. Hand-rolled rather than `z.object`, because the row
 * schemas come from two zod flavours (`zod` and `zod/mini`) and only the
 * `safeParse` contract is common to both.
 */
function pageOf(item: Shape): Shape {
  return {
    safeParse: (value: unknown) => {
      const candidate = value as {
        data?: unknown;
        next?: unknown;
        previous?: unknown;
      } | null;
      if (!candidate || !Array.isArray(candidate.data)) {
        return { success: false };
      }
      const cursorOk = (cursor: unknown) =>
        cursor === null || typeof cursor === 'string';
      return {
        success:
          cursorOk(candidate.next) &&
          cursorOk(candidate.previous) &&
          candidate.data.every((row) => item.safeParse(row).success),
      };
    },
  };
}

const pieceName = (name: string) => `@activepieces/piece-${name}`;

const nameOf = (user: { firstName: string; lastName: string }) =>
  `${user.firstName} ${user.lastName}`;

/* ------------------------------------------------------------------------ */
/* Catalogs                                                                  */
/* ------------------------------------------------------------------------ */

/*
 * API keys are named after the thing that holds them, because that is how
 * you find the one to revoke. The long one is here on purpose.
 */
const API_KEY_NAMES = [
  'CI deploy pipeline',
  'Terraform provider',
  'Grafana exporter',
  'Zapier migration script (delete after cutover)',
  "Priya's laptop",
];

const SIGNING_KEY_NAMES = ['Customer portal embed', 'Internal admin console'];

const OAUTH_APPS: { piece: string; clientId: string }[] = [
  { piece: 'slack', clientId: '2210538714.6839021547' },
  {
    piece: 'google-sheets',
    clientId: '812947301152-4h1c9v2nq8ldo7t3.apps.googleusercontent.com',
  },
  { piece: 'github', clientId: 'Iv1.8a2f4c91e03bd7a6' },
];

/*
 * Webhook destinations, with the event mixes a real customer would set up: a
 * SIEM that wants everything security-ish, a Slack channel for a few loud
 * events, and an incident tool that only cares about runs.
 */
const DESTINATIONS: { url: string; events: ApplicationEventName[] }[] = [
  {
    url: 'https://siem.northwind.co/ingest/activepieces',
    events: [
      ApplicationEventName.USER_SIGNED_IN,
      ApplicationEventName.USER_SIGNED_UP,
      ApplicationEventName.USER_PASSWORD_RESET,
      ApplicationEventName.SIGNING_KEY_CREATED,
      ApplicationEventName.PROJECT_ROLE_CREATED,
      ApplicationEventName.PROJECT_ROLE_UPDATED,
      ApplicationEventName.PROJECT_ROLE_DELETED,
      ApplicationEventName.CONNECTION_UPSERTED,
      ApplicationEventName.CONNECTION_DELETED,
      ApplicationEventName.VARIABLE_VALUE_REVEALED,
    ],
  },
  {
    url: 'https://hooks.slack.com/services/T02J4K8L9/B07QX2M1R/9fA3kd82LmzPq',
    events: [
      ApplicationEventName.FLOW_PUBLISHED,
      ApplicationEventName.FLOW_DELETED,
      ApplicationEventName.FLOW_APPROVAL_REQUESTED,
    ],
  },
  {
    url: 'https://events.pagerduty.com/integration/2f8c1a9e0b7d4e3f/enqueue',
    events: [ApplicationEventName.FLOW_RUN_FINISHED],
  },
];

/*
 * Templates: a job to be done, a sentence of summary, and a paragraph of
 * description — the three lengths the card and the detail view each need.
 */
type TemplateSeed = {
  name: string;
  summary: string;
  description: string;
  categories: string[];
  pieces: string[];
  tags: { title: string; color: string }[];
};

const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Slack alert for every new Stripe payment',
    summary: 'Post a message to #revenue the moment a charge succeeds.',
    description:
      'Listens for successful Stripe charges and posts the amount, customer and plan to a Slack channel. Handy for small teams that want to feel the revenue land without opening a dashboard.',
    categories: ['Sales', 'Finance'],
    pieces: ['stripe', 'slack'],
    tags: [{ title: 'Popular', color: '#6e41e2' }],
  },
  {
    name: 'Sync HubSpot deals to a Google Sheet',
    summary:
      'Keep a live sheet of every open deal, updated on every stage change.',
    description:
      'Every time a HubSpot deal changes stage, find or create its row in a Google Sheet and update the amount, owner and close date. Finance gets the sheet they asked for and sales never has to fill it in.',
    categories: ['Sales'],
    pieces: ['hubspot', 'google-sheets'],
    tags: [],
  },
  {
    name: 'Escalate stale Zendesk tickets',
    summary: 'Page the on-call engineer when a ticket has waited 48 hours.',
    description:
      'Runs every hour, finds Zendesk tickets that have not been touched in two days, and posts them to the on-call channel with a link. Nothing gets forgotten under a Friday afternoon.',
    categories: ['Customer support'],
    pieces: ['schedule', 'zendesk', 'slack'],
    tags: [{ title: 'Ops', color: '#0ea5e9' }],
  },
  {
    name: 'Onboard a new employee',
    summary:
      'Create the accounts, send the welcome email, book the intro call.',
    description:
      'Triggered from a Typeform submission by HR. Creates a Slack account, adds them to the right channels, sends a Gmail welcome sequence and books a Calendly intro with their manager.',
    categories: ['HR', 'Internal tools'],
    pieces: ['typeform', 'slack', 'gmail', 'calendly'],
    tags: [],
  },
  {
    name: 'Create a Linear issue from a GitHub bug report',
    summary: 'Turn issues labelled "bug" into triaged Linear tickets.',
    description:
      'Watches a GitHub repository for issues labelled bug, asks OpenAI for a one-line summary and a severity guess, then files a Linear issue in the triage project with a link back.',
    categories: ['Engineering'],
    pieces: ['github', 'openai', 'linear'],
    tags: [{ title: 'AI', color: '#f59e0b' }],
  },
  {
    name: 'Weekly churn digest',
    summary: 'A Monday-morning summary of who cancelled and why.',
    description:
      'Pulls the week of cancellations from Postgres, groups them by reason, and emails the summary to the leadership list. The kind of report that gets read because it is short.',
    categories: ['Finance', 'Analytics'],
    pieces: ['schedule', 'postgres', 'gmail'],
    tags: [],
  },
  {
    name: 'Tag high-value customers in Intercom',
    summary: 'Mark anyone over the spend threshold so support sees it first.',
    description:
      'When a Shopify order pushes a customer past a lifetime spend threshold, add a VIP tag in Intercom so the next conversation is routed to the senior queue.',
    categories: ['Customer support', 'Commerce'],
    pieces: ['shopify', 'intercom'],
    tags: [],
  },
  {
    name: 'Publish the changelog to Notion and Slack',
    summary: 'One webhook from your release tool, two places it needs to be.',
    description:
      'Accepts a webhook from the release pipeline, writes a formatted page in the Notion changelog database, and posts the highlights to #announcements with a link.',
    categories: ['Engineering', 'Marketing'],
    pieces: ['webhook', 'notion', 'slack'],
    tags: [{ title: 'New', color: '#22c55e' }],
  },
];

const TEMPLATE_CATEGORIES = [
  ...new Set(TEMPLATES.flatMap((template) => template.categories)),
];

const INVITATIONS: {
  email: string;
  type: InvitationType;
  platformRole: PlatformRole | null;
}[] = [
  {
    email: 'lena.marsh@northwind.co',
    type: InvitationType.PLATFORM,
    platformRole: PlatformRole.MEMBER,
  },
  {
    email: 'j.okafor@brightpath-consulting.io',
    type: InvitationType.PLATFORM,
    platformRole: PlatformRole.ADMIN,
  },
  {
    email: 'finance-bot@northwind.co',
    type: InvitationType.PROJECT,
    platformRole: null,
  },
];

/* Global connections: the shared ones an admin sets up once for everyone. */
const GLOBAL_CONNECTIONS: {
  piece: string;
  displayName: string;
  everyProject: boolean;
}[] = [
  {
    piece: 'slack',
    displayName: 'Northwind Slack (company)',
    everyProject: true,
  },
  { piece: 'openai', displayName: 'OpenAI (shared key)', everyProject: true },
  { piece: 'hubspot', displayName: 'HubSpot (sales org)', everyProject: false },
  {
    piece: 'postgres',
    displayName: 'Warehouse read replica',
    everyProject: false,
  },
];

const AI_MODELS: Record<string, { id: string; name: string }[]> = {
  openai: [
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-5-mini', name: 'GPT-5 mini' },
    { id: 'gpt-4.1', name: 'GPT-4.1' },
    { id: 'o3', name: 'o3' },
  ],
  anthropic: [
    { id: 'claude-opus-4-1', name: 'Claude Opus 4.1' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  ],
  google: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  ],
};

/* Built-in MCP tool names, weighted the way a real session uses them: lots
   of reading, a little building, the odd destructive call. */
const MCP_TOOLS = [
  'ap_list_flows',
  'ap_list_flows',
  'ap_flow_structure',
  'ap_flow_structure',
  'ap_read_step_settings',
  'ap_research_pieces',
  'ap_search_actions',
  'ap_get_piece_props',
  'ap_list_connections',
  'ap_list_runs',
  'ap_get_run',
  'ap_list_tables',
  'ap_find_records',
  'ap_validate_flow',
  'ap_build_flow',
  'ap_add_step',
  'ap_update_step',
  'ap_lock_and_publish',
  'ap_insert_records',
  'ap_delete_flow',
];

const MCP_CLIENTS: McpOAuthClientKey[] = [
  'claude',
  'claude',
  'claude-code',
  'claude-code',
  'cursor',
  'chatgpt',
  'vscode',
  'codex',
];

const MCP_ERRORS = [
  'Flow not found: the id may belong to another project.',
  'Validation failed: step "step_2" has no connection selected.',
  'Rate limited by Slack; retry after 30 seconds.',
  'Table "Refund requests" has no field named "amount_usd".',
];

/* ------------------------------------------------------------------------ */
/* Generators                                                                */
/* ------------------------------------------------------------------------ */

function apiKeys(world: World): ApiKeyResponseWithoutValue[] {
  return API_KEY_NAMES.slice(0, sizeOf('apiKeys', world)).map(
    (displayName, index) => {
      const rng = rngFor(`api-key-${index}`);
      const created = isoAgo(rng.int(60 * 24 * 5, 60 * 24 * 300));
      return {
        id: idFrom(`api-key-${index}`),
        created,
        updated: created,
        platformId: PLATFORM_ID,
        displayName,
        truncatedValue: idFrom(`api-key-tail-${index}`).slice(0, 4),
        /* The one nobody has used is the one to worry about. */
        lastUsedAt: index === 3 ? null : isoAgo(rng.agoMinutes(20)),
      };
    },
  );
}

function signingKeys(world: World): SigningKey[] {
  if (!isLicensed(world.scenario)) return [];
  return SIGNING_KEY_NAMES.slice(0, sizeOf('signingKeys', world)).map(
    (displayName, index) => {
      const created = isoAgo(60 * 24 * (90 + index * 40));
      const body = Array.from({ length: 6 }, (_, line) =>
        idFrom(`signing-key-${index}-${line}`).repeat(3).slice(0, 64),
      ).join('\n');
      return {
        id: idFrom(`signing-key-${index}`),
        created,
        updated: created,
        platformId: PLATFORM_ID,
        displayName,
        algorithm: KeyAlgorithm.RSA,
        publicKey: `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`,
      };
    },
  );
}

function oauthApps(world: World): OAuthApp[] {
  return OAUTH_APPS.slice(0, sizeOf('oauthApps', world)).map((app, index) => {
    const created = isoAgo(60 * 24 * (200 - index * 30));
    return {
      id: idFrom(`oauth-app-${index}`),
      created,
      updated: isoAgo(60 * 24 * (20 + index * 7)),
      platformId: PLATFORM_ID,
      pieceName: pieceName(app.piece),
      clientId: app.clientId,
    };
  });
}

function secretManagers(world: World): SecretManagerConnectionWithStatus[] {
  if (!isLicensed(world.scenario)) return [];
  const count = sizeOf('secretManagers', world);
  const failing = world.scenario.health === 'failing';
  const projects = world.projects.slice(0, 2).map((project) => project.id);

  const all: SecretManagerConnectionWithStatus[] = [
    {
      id: idFrom('secret-manager-0'),
      created: isoAgo(60 * 24 * 160),
      updated: isoAgo(60 * 24 * 9),
      platformId: PLATFORM_ID,
      providerId: SecretManagerProviderId.HASHICORP,
      name: 'Vault (production)',
      scope: SecretManagerConnectionScope.PLATFORM,
      connection: { configured: true, connected: !failing },
    },
    {
      id: idFrom('secret-manager-1'),
      created: isoAgo(60 * 24 * 30),
      updated: isoAgo(60 * 24 * 2),
      platformId: PLATFORM_ID,
      providerId: SecretManagerProviderId.AWS,
      name: 'AWS Secrets Manager — finance',
      scope: SecretManagerConnectionScope.PROJECT,
      projectIds: projects,
      /* Configured but not yet reachable: the state the status column
         exists to show. */
      connection: {
        configured: true,
        connected: world.scenario.health === 'clean',
      },
    },
  ];
  return all.slice(0, count);
}

function eventDestinations(world: World): EventDestination[] {
  if (!isLicensed(world.scenario)) return [];
  return DESTINATIONS.slice(0, sizeOf('destinations', world)).map(
    (destination, index) => ({
      id: idFrom(`event-destination-${index}`),
      created: isoAgo(60 * 24 * (120 - index * 35)),
      updated: isoAgo(60 * 24 * (3 + index)),
      platformId: PLATFORM_ID,
      scope: EventDestinationScope.PLATFORM,
      url: destination.url,
      events: destination.events,
    }),
  );
}

/*
 * Piece sets: the default one that includes everything, a restrictive one
 * for a regulated team, and a broad one with a few exclusions. Between them
 * they exercise both selection modes and the per-piece action picker.
 */
function pieceSets(world: World): PieceSet[] {
  const factor = volumeFactorFor(world.scenario.volume);
  const licensed = isLicensed(world.scenario);
  const sets: PieceSet[] = [
    {
      id: idFrom('piece-set-0'),
      created: isoAgo(60 * 24 * 400),
      updated: isoAgo(60 * 24 * 400),
      platformId: PLATFORM_ID,
      name: 'All pieces',
      key: null,
      isDefault: true,
      generatedForProjectId: null,
      config: {
        pieces: { mode: PieceSelectionMode.INCLUDE_ALL, exceptions: [] },
        selectedActions: {},
        selectedTriggers: {},
      },
    },
  ];
  if (!licensed || factor === 0) return sets;

  sets.push({
    id: PIECE_SET_ID,
    created: isoAgo(60 * 24 * 90),
    updated: isoAgo(60 * 24 * 4),
    platformId: PLATFORM_ID,
    name: 'Finance approved',
    key: 'finance',
    isDefault: false,
    generatedForProjectId: null,
    config: {
      pieces: {
        mode: PieceSelectionMode.EXCLUDE_ALL,
        exceptions: [
          'stripe',
          'google-sheets',
          'slack',
          'postgres',
          'gmail',
          'schedule',
          'webhook',
          'http',
        ].map(pieceName),
      },
      selectedActions: {
        [pieceName('slack')]: ['send_channel_message', 'send_direct_message'],
        [pieceName('gmail')]: ['send_email'],
      },
      selectedTriggers: {
        [pieceName('stripe')]: ['new_payment', 'payment_failed'],
      },
    },
  });

  if (factor >= 1) {
    sets.push({
      id: SECOND_PIECE_SET_ID,
      created: isoAgo(60 * 24 * 40),
      updated: isoAgo(60 * 24 * 1),
      platformId: PLATFORM_ID,
      name: 'Support tooling (no AI, no databases)',
      key: 'support',
      isDefault: false,
      generatedForProjectId: null,
      config: {
        pieces: {
          mode: PieceSelectionMode.INCLUDE_ALL,
          exceptions: ['openai', 'anthropic', 'postgres'].map(pieceName),
        },
        selectedActions: {},
        selectedTriggers: {},
      },
    });
  }
  return sets;
}

/*
 * Project roles. The four defaults always exist — they ship with the product
 * — and the custom ones only on a licence that allows them. User counts are
 * a split of the real user list so the column adds up to something true.
 */
const DEFAULT_ROLES: { name: string; permissions: Permission[] }[] = [
  { name: 'Admin', permissions: OWNER },
  { name: 'Editor', permissions: EDITOR },
  { name: 'Operator', permissions: OPERATOR },
  { name: 'Viewer', permissions: READ_ONLY },
];

const CUSTOM_ROLES: { name: string; permissions: Permission[] }[] = [
  {
    name: 'Finance approver',
    permissions: [
      ...READ_ONLY,
      Permission.WRITE_RUN,
      Permission.WRITE_TABLE,
      Permission.PUBLISH_SENSITIVE_FLOW_ACCESS,
    ],
  },
  {
    name: 'Support agent (tables and connections only)',
    permissions: [
      Permission.READ_PROJECT,
      Permission.READ_TABLE,
      Permission.WRITE_TABLE,
      Permission.READ_APP_CONNECTION,
      Permission.WRITE_APP_CONNECTION,
      Permission.READ_RUN,
    ],
  },
];

function projectRoles(world: World): ProjectRole[] {
  const users = world.users.length;
  const custom =
    isLicensed(world.scenario) && volumeFactorFor(world.scenario.volume) > 0
      ? CUSTOM_ROLES
      : [];
  /* Admins are few, editors are most people, and a custom role has a
     handful; a viewer with nobody in it is realistic too. */
  const counts = [
    Math.max(1, Math.round(users * 0.25)),
    Math.max(0, Math.round(users * 0.5)),
    Math.max(0, Math.round(users * 0.15)),
    0,
    Math.min(users, 2),
    Math.min(users, 1),
  ];

  return [
    ...DEFAULT_ROLES.map((role, index) => ({
      id: `role-${role.name.toLowerCase()}`,
      created: new Date(0).toISOString(),
      updated: new Date(0).toISOString(),
      name: role.name,
      permissions: role.permissions,
      platformId: PLATFORM_ID,
      type: RoleType.DEFAULT,
      userCount: counts[index],
    })),
    ...custom.map((role, index) => ({
      id: idFrom(`custom-role-${index}`),
      created: isoAgo(60 * 24 * (60 - index * 20)),
      updated: isoAgo(60 * 24 * (5 + index)),
      name: role.name,
      permissions: role.permissions,
      platformId: PLATFORM_ID,
      type: RoleType.CUSTOM,
      userCount: counts[DEFAULT_ROLES.length + index],
    })),
  ];
}

function templates(world: World): Template[] {
  if (!isLicensed(world.scenario)) return [];
  return TEMPLATES.slice(0, sizeOf('templates', world)).map((seed, index) => {
    const rng = rngFor(`template-${index}`);
    const [triggerPiece, ...actionPieces] = seed.pieces;
    const created = isoAgo(rng.int(60 * 24 * 10, 60 * 24 * 200));

    /* A trigger with a chain of piece actions behind it, because the Pieces
       column walks `flows[0].trigger` to find the logos to show. */
    const nextAction = actionPieces.reduceRight<unknown>(
      (next, piece, step) => ({
        name: `step_${step + 1}`,
        valid: true,
        displayName: `${
          PIECES.find((p) => p.name === piece)?.displayName ?? piece
        } action`,
        type: FlowActionType.PIECE,
        lastUpdatedDate: created,
        settings: {
          pieceName: pieceName(piece),
          pieceVersion: '~0.1.0',
          actionName: 'run',
          input: {},
          propertySettings: {},
          errorHandlingOptions: {},
        },
        nextAction: next,
      }),
      undefined,
    );

    return {
      id: idFrom(`template-${index}`),
      created,
      updated: isoAgo(rng.agoMinutes(30)),
      name: seed.name,
      type: TemplateType.CUSTOM,
      summary: seed.summary,
      description: seed.description,
      tags: seed.tags,
      blogUrl: index % 3 === 0 ? 'https://www.activepieces.com/blog' : null,
      metadata: null,
      author: nameOf(world.users[index % world.users.length]),
      categories: seed.categories,
      pieces: seed.pieces.map(pieceName),
      platformId: PLATFORM_ID,
      status: index === 5 ? TemplateStatus.ARCHIVED : TemplateStatus.PUBLISHED,
      flows: [
        {
          displayName: seed.name,
          description: seed.summary,
          valid: true,
          schemaVersion: '1',
          trigger: {
            name: 'trigger',
            valid: true,
            displayName: `New ${
              PIECES.find((p) => p.name === triggerPiece)?.displayName ??
              triggerPiece
            } event`,
            type: FlowTriggerType.PIECE,
            lastUpdatedDate: created,
            settings: {
              pieceName: pieceName(triggerPiece),
              pieceVersion: '~0.1.0',
              triggerName: 'new_event',
              input: {},
              propertySettings: {},
            },
            nextAction,
          },
        },
      ],
    } as unknown as Template;
  });
}

function invitations(world: World): UserInvitation[] {
  const editor = projectRoles(world).find((role) => role.name === 'Editor');
  return INVITATIONS.slice(0, sizeOf('invitations', world)).map(
    (invitation, index) => ({
      id: idFrom(`invitation-${index}`),
      created: isoAgo(60 * (6 + index * 30)),
      updated: isoAgo(60 * (6 + index * 30)),
      email: invitation.email,
      status: InvitationStatus.PENDING,
      type: invitation.type,
      platformId: PLATFORM_ID,
      platformRole: invitation.platformRole,
      projectId: invitation.type === InvitationType.PROJECT ? PROJECT_ID : null,
      projectRoleId:
        invitation.type === InvitationType.PROJECT ? editor?.id ?? null : null,
      projectRole:
        invitation.type === InvitationType.PROJECT ? editor ?? null : null,
    }),
  );
}

function globalConnections(world: World): AppConnectionWithoutSensitiveData[] {
  if (!isLicensed(world.scenario)) return [];
  const failureRate = failureRateFor(world.scenario.health);
  const owner = world.user;

  return GLOBAL_CONNECTIONS.slice(0, sizeOf('globalConnections', world)).map(
    (seed, index) => {
      const rng = rngFor(`global-connection-${index}-${world.scenario.health}`);
      const projectIds = seed.everyProject
        ? world.projects.map((project) => project.id)
        : world.projects
            .filter((_, position) => position % 2 === index % 2)
            .map((project) => project.id);
      const broken = index === 3 && rng.chance(failureRate * 2);

      return {
        id: idFrom(`global-connection-${index}`),
        created: isoAgo(rng.int(60 * 24 * 30, 60 * 24 * 300)),
        updated: isoAgo(rng.agoMinutes(40)),
        externalId: `global-${seed.piece}`,
        displayName: seed.displayName,
        type:
          seed.piece === 'postgres'
            ? AppConnectionType.BASIC_AUTH
            : seed.piece === 'openai'
            ? AppConnectionType.SECRET_TEXT
            : AppConnectionType.OAUTH2,
        pieceName: pieceName(seed.piece),
        projectIds,
        platformId: PLATFORM_ID,
        scope: AppConnectionScope.PLATFORM,
        status: broken ? AppConnectionStatus.ERROR : AppConnectionStatus.ACTIVE,
        ownerId: owner.id,
        owner,
        metadata: null,
        flowIds: [],
        pieceVersion: '0.1.0',
        preSelectForNewProjects: index === 0,
        usingSecretManager: index === 3,
      } as AppConnectionWithoutSensitiveData;
    },
  );
}

/*
 * The platform-wide connections list: every project's connections in one
 * table. The world only builds connections for the first project, so they
 * are dealt out across the projects here — the column exists to show
 * "which project is this from", and one project in every row does not show
 * it.
 */
function platformConnections(world: World): PlatformAppConnectionsListItem[] {
  const projectInfo = (id: string) => {
    const project = world.projects.find((candidate) => candidate.id === id);
    return project
      ? { id: project.id, displayName: project.displayName, type: project.type }
      : null;
  };

  const local = world.connections.map((connection, index) => {
    const project = world.projects[index % world.projects.length];
    const owner = world.users[index % world.users.length];
    return {
      ...connection,
      projectIds: [project.id],
      ownerId: owner.id,
      owner,
      projects: [
        {
          id: project.id,
          displayName: project.displayName,
          type: project.type,
        },
      ],
    };
  });

  const global = globalConnections(world).map((connection) => ({
    ...connection,
    projects: connection.projectIds
      .map(projectInfo)
      .filter((info): info is NonNullable<typeof info> => info !== null),
  }));

  return [...global, ...local].sort(
    (left, right) =>
      new Date(right.updated).getTime() - new Date(left.updated).getTime(),
  );
}

function aiProviders(world: World): AIProviderWithoutSensitiveData[] {
  const count = sizeOf('aiProviders', world);
  const health = world.scenario.health;
  const all: AIProviderWithoutSensitiveData[] = [
    {
      id: idFrom('ai-provider-openai'),
      name: 'OpenAI (production)',
      provider: AIProviderName.OPENAI,
      config: {},
      enabledForChat: true,
      modelScope: 'all',
      modelIds: [],
      projectScope: 'all',
      projectIds: [],
      status: 'active',
      statusReason: null,
      statusUpdated: isoAgo(35),
    },
    {
      id: idFrom('ai-provider-anthropic'),
      name: 'Anthropic',
      provider: AIProviderName.ANTHROPIC,
      config: {},
      enabledForChat: false,
      modelScope: 'selected',
      modelIds: ['claude-sonnet-4-5', 'claude-opus-4-1'],
      projectScope: 'selected',
      projectIds: world.projects.slice(0, 2).map((project) => project.id),
      status: 'active',
      statusReason: null,
      statusUpdated: isoAgo(60 * 3),
    },
    {
      id: idFrom('ai-provider-google'),
      name: 'Gemini (growth experiments)',
      provider: AIProviderName.GOOGLE,
      config: {},
      enabledForChat: false,
      modelScope: 'all',
      modelIds: [],
      projectScope: 'except',
      projectIds: world.projects.slice(0, 1).map((project) => project.id),
      /* The key that ran dry, on any day that is not all green. */
      status:
        health === 'clean'
          ? 'active'
          : health === 'failing'
          ? 'rejected'
          : 'out_of_credits',
      statusReason:
        health === 'clean'
          ? null
          : health === 'failing'
          ? 'API key not valid. Please pass a valid API key.'
          : 'You exceeded your current quota. Check your plan and billing details.',
      statusUpdated: isoAgo(60 * 14),
    },
  ];
  return all.slice(0, count);
}

function aiProvidersForProject(
  world: World,
  projectId: string,
): ProjectAIProvider[] {
  return aiProviders(world)
    .filter(
      (config) =>
        config.projectScope === 'all' ||
        (config.projectScope === 'selected' &&
          config.projectIds.includes(projectId)) ||
        (config.projectScope === 'except' &&
          !config.projectIds.includes(projectId)),
    )
    .map((config) => ({
      provider: config.provider,
      name: config.name,
      enabledForChat: config.enabledForChat,
      keys: [{ id: config.id, name: config.name }],
    }));
}

function aiModelsFor(provider: string, modelIds: string[]): AIProviderModel[] {
  const models = AI_MODELS[provider] ?? [];
  return models
    .filter((model) => modelIds.length === 0 || modelIds.includes(model.id))
    .map((model) => ({
      id: model.id,
      name: model.name,
      type: AIProviderModelType.TEXT,
      metadata: {
        contextTokens: 200_000,
        supportsToolCalling: true,
        supportsVision: !model.id.includes('mini'),
      },
    }));
}

function mcpServer(): McpServer {
  return {
    id: idFrom('platform-mcp-server'),
    created: isoAgo(60 * 24 * 120),
    updated: isoAgo(60 * 24 * 6),
    platformId: PLATFORM_ID,
    projectId: null,
    type: McpServerType.PLATFORM,
    token: idFrom('platform-mcp-token'),
    /* The destructive ones off, which is what a careful admin does first. */
    disabledTools: ['ap_delete_flow', 'ap_delete_table', 'ap_delete_records'],
  };
}

function mcpActivity(world: World): PopulatedMcpActivity[] {
  const count = sizeOf('mcpActivity', world);
  const failureRate = failureRateFor(world.scenario.health);
  const authPieces = PIECES.filter((piece) => piece.auth);

  return Array.from({ length: count }, (_, index): PopulatedMcpActivity => {
    const rng = rngFor(`mcp-activity-${index}-${world.scenario.health}`);
    const member = rng.pick(world.users);
    const platformWide = rng.chance(0.2);
    const project = platformWide ? null : rng.pick(world.projects);
    const failed = rng.chance(failureRate);
    const toolName = rng.pick(MCP_TOOLS);
    /* A piece-backed call every so often, so the piece and connection
       columns have something in them. */
    const viaPiece = rng.chance(0.25);
    const piece = viaPiece ? rng.pick(authPieces) : null;
    const connection = piece
      ? world.connections.find((c) => c.pieceName === pieceName(piece.name))
      : undefined;

    return {
      id: idFrom(`mcp-activity-${index}`),
      created: isoAgo(rng.agoMinutes(12)),
      status: failed ? 'FAILED' : 'SUCCEEDED',
      toolName: piece ? 'ap_run_action' : toolName,
      clientKey: rng.pick(MCP_CLIENTS),
      member,
      projectId: project?.id ?? null,
      projectName: project?.displayName ?? null,
      pieceName: piece ? pieceName(piece.name) : null,
      actionName: piece ? 'send_message' : null,
      connectionExternalId: connection?.externalId ?? null,
      connectionDisplayName: connection?.displayName ?? null,
      errorMessage: failed ? rng.pick(MCP_ERRORS) : null,
      durationMs: rng.int(120, failed ? 30_000 : 6_500),
      hasPayload: rng.chance(0.8),
    };
  }).sort(
    (left, right) =>
      new Date(right.created).getTime() - new Date(left.created).getTime(),
  );
}

/* ------------------------------------------------------------------------ */
/* The audit log                                                             */
/* ------------------------------------------------------------------------ */

/*
 * Weighted the way a real log is: runs dominate, edits are frequent,
 * sign-ins are steady, and the security-relevant events — role changes,
 * signing keys, revealed secrets — are rare enough that they stand out.
 */
const EVENT_WEIGHTS: [ApplicationEventName, number][] = [
  [ApplicationEventName.FLOW_RUN_FINISHED, 18],
  [ApplicationEventName.FLOW_RUN_STARTED, 10],
  [ApplicationEventName.FLOW_UPDATED, 16],
  [ApplicationEventName.USER_SIGNED_IN, 12],
  [ApplicationEventName.FLOW_CREATED, 5],
  [ApplicationEventName.FLOW_PUBLISHED, 5],
  [ApplicationEventName.FLOW_ACTIVATED, 3],
  [ApplicationEventName.FLOW_DEACTIVATED, 2],
  [ApplicationEventName.FLOW_DELETED, 2],
  [ApplicationEventName.CONNECTION_UPSERTED, 6],
  [ApplicationEventName.CONNECTION_DELETED, 1],
  [ApplicationEventName.FOLDER_CREATED, 2],
  [ApplicationEventName.FOLDER_UPDATED, 1],
  [ApplicationEventName.AGENT_ACTION_EXECUTED, 5],
  [ApplicationEventName.AGENT_PUBLISHED, 1],
  [ApplicationEventName.AGENT_UPDATED, 2],
  [ApplicationEventName.VARIABLE_UPSERTED, 2],
  [ApplicationEventName.VARIABLE_VALUE_REVEALED, 1],
  [ApplicationEventName.USER_SIGNED_UP, 1],
  [ApplicationEventName.USER_PASSWORD_RESET, 1],
  [ApplicationEventName.SIGNING_KEY_CREATED, 1],
  [ApplicationEventName.PROJECT_ROLE_CREATED, 1],
  [ApplicationEventName.PROJECT_ROLE_UPDATED, 1],
  [ApplicationEventName.FLOW_PIECES_UPGRADED, 1],
  [ApplicationEventName.FLOW_APPROVAL_REQUESTED, 1],
  [ApplicationEventName.FLOW_APPROVAL_GRANTED, 1],
  [ApplicationEventName.FLOW_APPROVAL_REJECTED, 1],
];

const EVENT_TOTAL = EVENT_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

function pickEvent(roll: number): ApplicationEventName {
  let remaining = roll * EVENT_TOTAL;
  for (const [name, weight] of EVENT_WEIGHTS) {
    remaining -= weight;
    if (remaining <= 0) return name;
  }
  return ApplicationEventName.USER_SIGNED_IN;
}

const IPS = [
  '81.2.69.142',
  '81.2.69.142',
  '81.2.69.160',
  '185.199.108.153',
  '34.142.77.9',
  '2a02:8109:9c40:1e2c:4d3a:9f0e:1b2c:7d8e',
  '203.0.113.42',
];

const VARIABLE_NAMES = [
  'STRIPE_WEBHOOK_SECRET',
  'slack_alerts_channel',
  'warehouse_dsn',
  'ZENDESK_SLA_HOURS',
];

function auditEvents(world: World): ApplicationEvent[] {
  if (!isLicensed(world.scenario)) return [];
  const count = sizeOf('auditEvents', world);
  if (world.flows.length === 0) return [];
  const failureRate = failureRateFor(world.scenario.health);
  const roles = projectRoles(world);
  const keys = signingKeys(world);

  const projectFor = (projectId: string) =>
    world.projects.find((project) => project.id === projectId) ??
    world.projects[0];

  const events = Array.from({ length: count }, (_, index) => {
    const rng = rngFor(`audit-${index}-${world.scenario.health}`);
    const action = pickEvent(rng.next());
    const user = rng.pick(world.users);
    const project = rng.pick(world.projects);
    const flow = rng.pick(world.flows);
    const minutesAgo = rng.agoMinutes(30);
    const created = isoAgo(minutesAgo);

    const base = {
      id: idFrom(`audit-event-${index}`),
      created,
      updated: created,
      platformId: PLATFORM_ID,
      projectId: project.id,
      projectDisplayName: project.displayName,
      userId: user.id,
      userEmail: user.email,
      ip: rng.pick(IPS),
    };
    const flowRef = {
      id: flow.id,
      externalId: flow.externalId,
      created: flow.created,
      updated: flow.updated,
    };
    const versionRef = {
      id: flow.version.id,
      displayName: flow.version.displayName,
      flowId: flow.id,
      created: flow.version.created,
      updated: flow.version.updated,
    };
    const projectRef = {
      displayName: projectFor(flow.projectId).displayName,
      externalId: null,
    };

    switch (action) {
      case ApplicationEventName.FLOW_RUN_STARTED:
      case ApplicationEventName.FLOW_RUN_FINISHED: {
        const finished = action === ApplicationEventName.FLOW_RUN_FINISHED;
        const duration = rng.int(400, 38_000);
        const failed = finished && rng.chance(failureRate);
        return {
          ...base,
          /* Runs are the system's doing, not a person's. */
          userId: undefined,
          userEmail: undefined,
          ip: undefined,
          action,
          data: {
            flowRun: {
              id: idFrom(`audit-run-${index}`),
              startTime: created,
              finishTime: finished
                ? isoAgo(minutesAgo - duration / 60_000)
                : null,
              duration: finished ? duration : undefined,
              triggeredBy: rng.chance(0.3) ? user.id : undefined,
              environment: RunEnvironment.PRODUCTION,
              flowId: flow.id,
              flowVersionId: flow.version.id,
              flowDisplayName: flow.version.displayName,
              status: finished
                ? failed
                  ? FlowRunStatus.FAILED
                  : FlowRunStatus.SUCCEEDED
                : FlowRunStatus.RUNNING,
            },
            project: { displayName: projectRef.displayName },
          },
        } satisfies ApplicationEvent;
      }
      case ApplicationEventName.FLOW_CREATED:
        return {
          ...base,
          action,
          data: { flow: flowRef, project: projectRef },
        } satisfies ApplicationEvent;
      case ApplicationEventName.FLOW_UPDATED: {
        const request = rng.pick([
          {
            type: FlowOperationType.CHANGE_NAME as const,
            request: { displayName: `${flow.version.displayName} (v2)` },
          },
          {
            type: FlowOperationType.CHANGE_STATUS as const,
            request: {
              status: rng.chance(0.7)
                ? FlowStatus.ENABLED
                : FlowStatus.DISABLED,
            },
          },
          {
            type: FlowOperationType.LOCK_AND_PUBLISH as const,
            request: {},
          },
          {
            type: FlowOperationType.CHANGE_FOLDER as const,
            request: {
              folderId:
                world.folders.length > 0 ? rng.pick(world.folders).id : null,
            },
          },
          {
            type: FlowOperationType.UPDATE_METADATA as const,
            request: { metadata: null },
          },
          {
            type: FlowOperationType.DELETE_ACTION as const,
            request: { names: ['step_3'] },
          },
        ]);
        return {
          ...base,
          action,
          data: {
            flow: flowRef,
            flowVersion: versionRef,
            request,
            project: projectRef,
          },
        } as ApplicationEvent;
      }
      case ApplicationEventName.FLOW_DELETED:
      case ApplicationEventName.FLOW_PUBLISHED:
      case ApplicationEventName.FLOW_ACTIVATED:
      case ApplicationEventName.FLOW_DEACTIVATED:
        return {
          ...base,
          action,
          data: { flow: flowRef, flowVersion: versionRef, project: projectRef },
        } satisfies ApplicationEvent;
      case ApplicationEventName.FLOW_PIECES_UPGRADED:
        return {
          ...base,
          action,
          data: {
            flowId: flow.id,
            flowVersionId: flow.version.id,
            steps: [
              {
                stepName: 'trigger',
                actionOrTriggerName: 'new_event',
                decision: 'UPGRADED' as const,
                prevVersion: '0.9.4',
                newVersion: '0.10.1',
              },
              {
                stepName: 'step_1',
                actionOrTriggerName: 'send_channel_message',
                decision: 'KEPT' as const,
                prevVersion: '0.7.2',
                newVersion: null,
              },
            ],
          },
        } satisfies ApplicationEvent;
      case ApplicationEventName.CONNECTION_UPSERTED:
      case ApplicationEventName.CONNECTION_DELETED: {
        const connection =
          world.connections.length > 0
            ? rng.pick(world.connections)
            : undefined;
        const piece = rng.pick(PIECES.filter((p) => p.auth));
        return {
          ...base,
          action,
          data: {
            connection: {
              id: connection?.id ?? idFrom(`audit-connection-${index}`),
              displayName: connection?.displayName ?? piece.displayName,
              externalId: connection?.externalId ?? `${piece.name}-${index}`,
              pieceName: connection?.pieceName ?? pieceName(piece.name),
              status: connection?.status ?? AppConnectionStatus.ACTIVE,
              type: connection?.type ?? AppConnectionType.OAUTH2,
              created: connection?.created ?? created,
              updated: created,
            },
            project: { displayName: project.displayName },
          },
        } satisfies ApplicationEvent;
      }
      case ApplicationEventName.FOLDER_CREATED:
      case ApplicationEventName.FOLDER_UPDATED: {
        const folder =
          world.folders.length > 0 ? rng.pick(world.folders) : undefined;
        return {
          ...base,
          action,
          data: {
            folder: {
              id: folder?.id ?? idFrom(`audit-folder-${index}`),
              displayName: folder?.displayName ?? 'Archive',
              created: folder?.created ?? created,
              updated: created,
            },
            project: { displayName: project.displayName },
          },
        } satisfies ApplicationEvent;
      }
      case ApplicationEventName.AGENT_ACTION_EXECUTED: {
        const agent = world.agents.length > 0 ? rng.pick(world.agents) : null;
        const piece = rng.pick(PIECES.filter((p) => p.auth));
        const failed = rng.chance(failureRate);
        return {
          ...base,
          action,
          data: {
            source: rng.pick([
              AgentRunSource.CHAT,
              AgentRunSource.FLOW_STEP,
              AgentRunSource.AGENT_BUILDER,
            ]),
            agent: agent
              ? { id: agent.id, displayName: agent.displayName }
              : undefined,
            action: {
              kind: AgentActionKind.PIECE as const,
              pieceName: pieceName(piece.name),
              pieceDisplayName: piece.displayName,
              actionName: 'search',
              displayName: `Search ${piece.displayName}`,
            },
            outcome: failed
              ? AgentActionOutcome.FAILED
              : AgentActionOutcome.SUCCEEDED,
            connection: {
              externalId: `${piece.name}-0`,
              label: `${piece.displayName} (production)`,
            },
          },
        } satisfies ApplicationEvent;
      }
      case ApplicationEventName.AGENT_PUBLISHED:
      case ApplicationEventName.AGENT_UPDATED: {
        const agent = world.agents.length > 0 ? rng.pick(world.agents) : null;
        return {
          ...base,
          action,
          data: {
            agent: {
              id: agent?.id ?? idFrom(`audit-agent-${index}`),
              displayName: agent?.displayName ?? 'Support triage',
              publishedDigest:
                action === ApplicationEventName.AGENT_PUBLISHED
                  ? idFrom(`agent-digest-${index}`).slice(0, 12)
                  : undefined,
              publishedToolNames:
                action === ApplicationEventName.AGENT_PUBLISHED
                  ? agent?.toolPieceNames ?? []
                  : undefined,
            },
          },
        } satisfies ApplicationEvent;
      }
      case ApplicationEventName.VARIABLE_UPSERTED:
      case ApplicationEventName.VARIABLE_VALUE_REVEALED: {
        const name = rng.pick(VARIABLE_NAMES);
        return {
          ...base,
          action,
          data: {
            variable: {
              id: idFrom(`variable-${name}`),
              name,
              created: isoAgo(60 * 24 * 60),
              updated: created,
            },
            project: { displayName: project.displayName },
          },
        } satisfies ApplicationEvent;
      }
      case ApplicationEventName.USER_SIGNED_UP:
        return {
          ...base,
          action,
          data: {
            source: rng.pick(['credentials', 'sso'] as const),
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            },
          },
        } satisfies ApplicationEvent;
      case ApplicationEventName.USER_PASSWORD_RESET:
        return {
          ...base,
          projectId: undefined,
          projectDisplayName: undefined,
          action,
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            },
          },
        } satisfies ApplicationEvent;
      case ApplicationEventName.SIGNING_KEY_CREATED: {
        const key = keys.length > 0 ? rng.pick(keys) : null;
        return {
          ...base,
          projectId: undefined,
          projectDisplayName: undefined,
          action,
          data: {
            signingKey: {
              id: key?.id ?? idFrom(`audit-signing-key-${index}`),
              displayName: key?.displayName ?? 'Customer portal embed',
              created: key?.created ?? created,
              updated: created,
            },
          },
        } satisfies ApplicationEvent;
      }
      case ApplicationEventName.PROJECT_ROLE_CREATED:
      case ApplicationEventName.PROJECT_ROLE_UPDATED: {
        const role =
          roles.find((candidate) => candidate.type === RoleType.CUSTOM) ??
          roles[1];
        return {
          ...base,
          projectId: undefined,
          projectDisplayName: undefined,
          action,
          data: {
            projectRole: {
              id: role.id,
              created: role.created,
              updated: created,
              name: role.name,
              permissions: role.permissions,
              platformId: PLATFORM_ID,
            },
          },
        } satisfies ApplicationEvent;
      }
      case ApplicationEventName.FLOW_APPROVAL_REQUESTED:
      case ApplicationEventName.FLOW_APPROVAL_GRANTED:
      case ApplicationEventName.FLOW_APPROVAL_REJECTED:
        return {
          ...base,
          action,
          data: {
            approvalRequestId: idFrom(`approval-${flow.id}`),
            flowId: flow.id,
            flowVersionId: flow.version.id,
            flowDisplayName: flow.version.displayName,
            rejectionReason:
              action === ApplicationEventName.FLOW_APPROVAL_REJECTED
                ? 'Writes to the production ledger need a second reviewer from finance.'
                : null,
          },
        } satisfies ApplicationEvent;
      case ApplicationEventName.USER_SIGNED_IN:
      default:
        return {
          ...base,
          projectId: undefined,
          projectDisplayName: undefined,
          action: ApplicationEventName.USER_SIGNED_IN,
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            },
          },
        } satisfies ApplicationEvent;
    }
  });

  return events.sort(
    (left, right) =>
      new Date(right.created).getTime() - new Date(left.created).getTime(),
  );
}

/* ------------------------------------------------------------------------ */
/* Memo                                                                      */
/* ------------------------------------------------------------------------ */

/*
 * Built once per world. The world is itself memoised on the scenario, so
 * keying on the object is keying on the scenario — and a panel switch that
 * rebuilds the world rebuilds these with it.
 */
type AdminSecurity = {
  apiKeys: ApiKeyResponseWithoutValue[];
  signingKeys: SigningKey[];
  oauthApps: OAuthApp[];
  secretManagers: SecretManagerConnectionWithStatus[];
  eventDestinations: EventDestination[];
  pieceSets: PieceSet[];
  projectRoles: ProjectRole[];
  templates: Template[];
  invitations: UserInvitation[];
  globalConnections: AppConnectionWithoutSensitiveData[];
  platformConnections: PlatformAppConnectionsListItem[];
  aiProviders: AIProviderWithoutSensitiveData[];
  mcpServer: McpServer;
  mcpActivity: PopulatedMcpActivity[];
  auditEvents: ApplicationEvent[];
};

const memo = new WeakMap<World, AdminSecurity>();

function securityFor(world: World): AdminSecurity {
  const cached = memo.get(world);
  if (cached) return cached;
  const built: AdminSecurity = {
    apiKeys: apiKeys(world),
    signingKeys: signingKeys(world),
    oauthApps: oauthApps(world),
    secretManagers: secretManagers(world),
    eventDestinations: eventDestinations(world),
    pieceSets: pieceSets(world),
    projectRoles: projectRoles(world),
    templates: templates(world),
    invitations: invitations(world),
    globalConnections: globalConnections(world),
    platformConnections: platformConnections(world),
    aiProviders: aiProviders(world),
    mcpServer: mcpServer(),
    mcpActivity: mcpActivity(world),
    auditEvents: auditEvents(world),
  };
  memo.set(world, built);
  return built;
}

/* Query values that may arrive as `a,b` or as a single value. */
function list(value: string | undefined): string[] | null {
  if (!value) return null;
  return value.split(',').filter(Boolean);
}

function contains(haystack: string, query: Query, key: string): boolean {
  const needle = query[key]?.toLowerCase();
  return !needle || haystack.toLowerCase().includes(needle);
}

/* ------------------------------------------------------------------------ */
/* Routes                                                                    */
/* ------------------------------------------------------------------------ */

export const adminSecurityRoutes: Route[] = [
  [
    'GET',
    '/v1/api-keys',
    ({ world, query }) => page(securityFor(world).apiKeys, query),
    pageOf(ApiKeyResponseWithoutValue),
  ],
  [
    'GET',
    '/v1/signing-keys',
    ({ world, query }) => page(securityFor(world).signingKeys, query),
    pageOf(SigningKey),
  ],
  [
    'GET',
    '/v1/oauth-apps',
    ({ world, query }) => page(securityFor(world).oauthApps, query),
    pageOf(OAuthApp),
  ],
  [
    'GET',
    '/v1/secret-managers',
    ({ world, query }) => {
      let managers = securityFor(world).secretManagers;
      if (query.projectId) {
        managers = managers.filter(
          (manager) =>
            manager.scope === SecretManagerConnectionScope.PLATFORM ||
            manager.projectIds.includes(query.projectId),
        );
      }
      return page(managers, query);
    },
    pageOf(SecretManagerConnectionWithStatusSchema),
  ],
  [
    'GET',
    '/v1/event-destinations',
    ({ world, query }) => page(securityFor(world).eventDestinations, query),
    pageOf(EventDestination),
  ],

  [
    'GET',
    '/v1/piece-sets',
    ({ world, query }) => page(securityFor(world).pieceSets, query),
    pageOf(PieceSet),
  ],
  [
    'GET',
    '/v1/piece-sets/:id',
    ({ world, params }) => {
      const sets = securityFor(world).pieceSets;
      return sets.find((set) => set.id === params.id) ?? sets[0];
    },
    PieceSet,
  ],

  [
    'GET',
    '/v1/project-roles',
    ({ world, query }) => page(securityFor(world).projectRoles, query),
    pageOf(ProjectRole),
  ],
  [
    'GET',
    '/v1/project-roles/:id/project-members',
    ({ world, params, query }) => {
      const role = securityFor(world).projectRoles.find(
        (candidate) => candidate.id === params.id,
      );
      const members = world.users
        .slice(0, role?.userCount ?? 0)
        .map((user, index) => ({
          id: idFrom(`role-member-${params.id}-${index}`),
          created: user.created,
          updated: user.updated,
          user,
          projectId: PROJECT_ID,
          platformId: PLATFORM_ID,
          projectRoleId: params.id,
          projectRole: role,
        }));
      return page(members, query);
    },
  ],
  [
    'GET',
    '/v1/project-roles/:id',
    ({ world, params }) =>
      securityFor(world).projectRoles.find((role) => role.id === params.id) ??
      securityFor(world).projectRoles[0],
    ProjectRole,
  ],

  [
    'GET',
    '/v1/templates/categories',
    () => ({ id: 'TEMPLATE_CATEGORIES', value: TEMPLATE_CATEGORIES }),
  ],
  [
    'GET',
    '/v1/templates',
    ({ world, query }) => {
      let rows = securityFor(world).templates;
      if (query.type) rows = rows.filter((row) => row.type === query.type);
      if (query.category) {
        rows = rows.filter((row) => row.categories.includes(query.category));
      }
      const pieces = list(query.pieces);
      if (pieces) {
        rows = rows.filter((row) =>
          pieces.some((piece) => row.pieces.includes(piece)),
        );
      }
      rows = rows.filter(
        (row) =>
          contains(row.name, query, 'search') ||
          contains(row.summary, query, 'search'),
      );
      return page(rows, query);
    },
    pageOf(Template),
  ],
  [
    'GET',
    '/v1/templates/:id',
    ({ world, params }) => {
      const rows = securityFor(world).templates;
      return rows.find((row) => row.id === params.id) ?? rows[0];
    },
    Template,
  ],

  [
    'GET',
    '/v1/user-invitations',
    ({ world, query }) => {
      let rows = securityFor(world).invitations;
      if (query.type) rows = rows.filter((row) => row.type === query.type);
      if (query.projectId) {
        rows = rows.filter((row) => row.projectId === query.projectId);
      }
      if (query.status)
        rows = rows.filter((row) => row.status === query.status);
      return page(rows, query);
    },
    pageOf(UserInvitation),
  ],

  [
    'GET',
    '/v1/global-connections',
    ({ world, query }) => {
      let rows = securityFor(world).globalConnections;
      if (query.status)
        rows = rows.filter((row) => row.status === query.status);
      rows = rows.filter((row) =>
        contains(row.displayName, query, 'displayName'),
      );
      return page(rows, query);
    },
    pageOf(AppConnectionWithoutSensitiveData),
  ],

  [
    'GET',
    '/v1/platform-app-connections/owners',
    ({ world }): PlatformAppConnectionOwnersResponse => ({
      data: world.users.map((user) => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      })),
      truncated: false,
    }),
    PlatformAppConnectionOwnersResponse,
  ],
  [
    'GET',
    '/v1/platform-app-connections',
    ({ world, query }) => {
      let rows = securityFor(world).platformConnections;
      rows = rows.filter((row) =>
        contains(row.displayName, query, 'displayName'),
      );
      if (query.pieceName) {
        rows = rows.filter((row) => row.pieceName === query.pieceName);
      }
      if (query.scope) rows = rows.filter((row) => row.scope === query.scope);
      const statuses = list(query.status);
      if (statuses) rows = rows.filter((row) => statuses.includes(row.status));
      const projectIds = list(query.projectIds);
      if (projectIds) {
        rows = rows.filter((row) =>
          row.projectIds.some((id) => projectIds.includes(id)),
        );
      }
      const ownerIds = list(query.ownerIds);
      if (ownerIds)
        rows = rows.filter((row) => ownerIds.includes(row.ownerId ?? ''));
      return page(rows, query);
    },
    pageOf(PlatformAppConnectionsListItem),
  ],

  /*
   * AI providers answer with bare arrays, not pages — the screen does
   * `providers.filter(...)` on the response directly.
   */
  [
    'GET',
    '/v1/ai-providers/configs/:id/models',
    ({ world, params }) => {
      const config = securityFor(world).aiProviders.find(
        (candidate) => candidate.id === params.id,
      );
      return config ? aiModelsFor(config.provider, []) : [];
    },
    z.array(AIProviderModel),
  ],
  [
    'GET',
    '/v1/ai-providers/configs',
    ({ world }) => securityFor(world).aiProviders,
    z.array(AIProviderWithoutSensitiveData),
  ],
  [
    'GET',
    '/v1/ai-providers/:provider/models',
    ({ world, params, query }) => {
      const config = securityFor(world).aiProviders.find((candidate) =>
        query.configId
          ? candidate.id === query.configId
          : candidate.provider === params.provider,
      );
      return aiModelsFor(
        params.provider,
        config?.modelScope === 'selected' ? config.modelIds : [],
      );
    },
    z.array(AIProviderModel),
  ],
  [
    'GET',
    '/v1/ai-providers',
    ({ world, query }) =>
      aiProvidersForProject(world, query.projectId ?? PROJECT_ID),
    z.array(ProjectAIProvider),
  ],

  [
    'GET',
    '/v1/mcp-server',
    ({ world }) => securityFor(world).mcpServer,
    McpServer,
  ],
  [
    'GET',
    '/v1/mcp-activity/:id/payload',
    ({ world, params }) => {
      const row = securityFor(world).mcpActivity.find(
        (candidate) => candidate.id === params.id,
      );
      return {
        input: row?.pieceName
          ? { channel: '#revenue', text: 'Payment of $1,240.00 received' }
          : { projectId: row?.projectId ?? PROJECT_ID, limit: 20 },
        output:
          row?.status === 'FAILED'
            ? { error: row.errorMessage }
            : { ok: true, count: 7, durationMs: row?.durationMs ?? 0 },
      };
    },
  ],
  [
    'GET',
    '/v1/mcp-activity',
    ({ world, query }) => {
      let rows = securityFor(world).mcpActivity;
      const projectIds = list(query.projectIds);
      if (projectIds) {
        rows = rows.filter((row) =>
          projectIds.includes(row.projectId ?? 'PLATFORM'),
        );
      }
      const memberIds = list(query.memberIds);
      if (memberIds) {
        rows = rows.filter((row) => memberIds.includes(row.member?.id ?? ''));
      }
      const clients = list(query.clientKeys);
      if (clients)
        rows = rows.filter((row) => clients.includes(row.clientKey ?? ''));
      const statuses = list(query.statuses);
      if (statuses) rows = rows.filter((row) => statuses.includes(row.status));
      return page(rows, query);
    },
    pageOf(PopulatedMcpActivity),
  ],

  [
    'GET',
    '/v1/audit-events',
    ({ world, query }) => {
      let rows = securityFor(world).auditEvents;
      const actions = list(query.action);
      if (actions) rows = rows.filter((row) => actions.includes(row.action));
      const projectIds = list(query.projectId);
      if (projectIds) {
        rows = rows.filter((row) => projectIds.includes(row.projectId ?? ''));
      }
      if (query.userId)
        rows = rows.filter((row) => row.userId === query.userId);
      if (query.createdAfter) {
        rows = rows.filter((row) => row.created >= query.createdAfter);
      }
      if (query.createdBefore) {
        rows = rows.filter((row) => row.created <= query.createdBefore);
      }
      return page(rows, query);
    },
    pageOf(ApplicationEvent),
  ],
];
