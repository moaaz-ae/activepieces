/*
 * The Infrastructure and Billing screens: health, triggers, workers, usage,
 * plans.
 *
 * These are the screens an admin opens when something is wrong, so the
 * interesting state is the degraded one — one worker on the wrong version, a
 * few stuck jobs, a piece whose triggers failed all day. Everything here is
 * derived from the same world as the rest of the harness: a stuck job names a
 * run that exists, an internal error names a flow that exists, and the
 * per-project credit figures add up to the platform total the billing page
 * already shows.
 */

import {
  FlowRunStatus,
  FlowTriggerType,
  GetSystemHealthChecksResponse,
  InternalErrorImpactItem,
  PlatformMetricsHealthHistory,
  PlatformMetricsLive,
  PlatformMetricsReport,
  PlatformMetricsStatusPoint,
  PopulatedFlow,
  ProjectCreditUsage,
  PurchasablePlan,
  StuckJob,
  TriggerStatusReport,
  WorkerGroupScope,
  WorkerMachineStatus,
  WorkerMachineType,
  WorkerMachineWithStatus,
} from '@activepieces/shared';

import { page, Route } from '../routes';
import {
  capabilitiesFor,
  failureRateFor,
  isCloud,
  isLicensed,
  volumeFactorFor,
} from '../scenario';

import { PIECE_BY_NAME } from './catalog';
import { idFrom, isoAgo, NOW, rngFor } from './rng';
import { World } from './world';

const DAY_MINUTES = 60 * 24;
const CURRENT_VERSION = '0.70.0';
const LATEST_VERSION = '0.70.2';
const STALE_VERSION = '0.68.1';

/* Day keys the way the screens build them: dayjs().format('YYYY-MM-DD') is
   local time, so the fixture must be too or the last column is always empty. */
function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysAgo(count: number): number {
  return NOW - count * DAY_MINUTES * 60_000;
}

/*
 * How many jobs a day the platform does, at full volume. A year-in platform
 * completes a few thousand a day; a day-one one completes a handful.
 */
function dailyJobVolume(world: World): number {
  return Math.round(2_400 * volumeFactorFor(world.scenario.volume));
}

/* One shape for both "how many workers" and "how many are wrong". */
function workerCount(world: World): number {
  const factor = volumeFactorFor(world.scenario.volume);
  return factor === 0 ? 0 : Math.ceil(4 * factor);
}

function systemHealth(world: World): GetSystemHealthChecksResponse {
  const health = world.scenario.health;
  const total = workerCount(world);
  const mismatched = health !== 'clean' && total > 1 ? 1 : 0;
  const connected = total > 0;

  return {
    latestVersion: LATEST_VERSION,
    appCpu: true,
    appRam: health !== 'failing',
    disk: health !== 'failing',
    workerCpu: connected ? true : null,
    workerRam: connected ? health !== 'failing' : null,
    database: true,
    release: {
      current: CURRENT_VERSION,
      workers: {
        total,
        versionMismatched: mismatched,
        mismatchedVersions: mismatched > 0 ? [STALE_VERSION] : [],
      },
    },
  };
}

function healthHistory(world: World): PlatformMetricsHealthHistory {
  const failureRate = failureRateFor(world.scenario.health);
  const volume = dailyJobVolume(world);

  return {
    days: Array.from({ length: 30 }, (_, offset) => {
      const index = 29 - offset;
      const rng = rngFor(`health-day-${index}-${world.scenario.health}`);
      /* Internal errors are rarer than flow failures: a clean platform has
         none, a realistic one has a bad day or two a fortnight, a failing one
         has them most days. */
      const hasErrors = volume > 0 && rng.chance(failureRate * 0.5);
      const internalErrors = hasErrors
        ? Math.max(1, Math.round(volume * failureRate * rng.next() * 0.02))
        : 0;
      return {
        day: localDayKey(daysAgo(index)),
        internalErrors,
        affectedFlows: hasErrors
          ? Math.min(world.flows.length, rng.int(1, 3))
          : 0,
        stuckJobs: hasErrors && rng.chance(0.4) ? rng.int(1, 2) : 0,
      };
    }),
  };
}

const CHARTED_STATUSES = [
  FlowRunStatus.SUCCEEDED,
  FlowRunStatus.FAILED,
  FlowRunStatus.INTERNAL_ERROR,
  FlowRunStatus.CANCELED,
];

function runMetrics(
  world: World,
  createdAfter: string,
  createdBefore: string,
): PlatformMetricsReport {
  const failureRate = failureRateFor(world.scenario.health);
  const volume = dailyJobVolume(world);
  const start = new Date(createdAfter).getTime() || daysAgo(30);
  const end = Math.min(new Date(createdBefore).getTime() || NOW, NOW);
  const dayCount = Math.max(
    0,
    Math.floor((end - start) / (DAY_MINUTES * 60_000)) + 1,
  );

  const statusTimeseries: PlatformMetricsStatusPoint[] = [];
  let completed = 0;
  let succeeded = 0;

  for (let index = 0; index < dayCount; index++) {
    const timestamp = start + index * DAY_MINUTES * 60_000;
    if (timestamp > NOW) break;
    const day = localDayKey(timestamp);
    const rng = rngFor(`run-metrics-${day}-${world.scenario.health}`);
    /* Weekdays are busier; the dip at the weekend is what makes a line chart
       read as real traffic rather than noise. */
    const weekend = [0, 6].includes(new Date(timestamp).getDay());
    const total = Math.round(
      volume * (weekend ? 0.35 : 1) * (0.8 + rng.next() * 0.4),
    );
    const failed = Math.round(total * failureRate * (0.7 + rng.next() * 0.6));
    const internal = Math.round(failed * 0.12);
    const canceled = Math.round(total * 0.01 * rng.next());
    const success = Math.max(0, total - failed - canceled);

    completed += success + failed;
    succeeded += success;

    const counts: Record<string, number> = {
      [FlowRunStatus.SUCCEEDED]: success,
      [FlowRunStatus.FAILED]: failed - internal,
      [FlowRunStatus.INTERNAL_ERROR]: internal,
      [FlowRunStatus.CANCELED]: canceled,
    };
    CHARTED_STATUSES.forEach((status) => {
      statusTimeseries.push({ day, status, count: counts[status] ?? 0 });
    });
  }

  const successRate = completed > 0 ? (succeeded / completed) * 100 : 0;
  const previousRng = rngFor(`run-metrics-previous-${world.scenario.health}`);

  return {
    summary: {
      completed,
      successRate: Number(successRate.toFixed(1)),
      previousCompleted: Math.round(
        completed * (0.85 + previousRng.next() * 0.2),
      ),
      previousSuccessRate:
        completed > 0
          ? Number(
              Math.min(
                100,
                successRate + (previousRng.next() - 0.4) * 4,
              ).toFixed(1),
            )
          : 0,
    },
    statusTimeseries,
    internalErrors: internalErrors(world),
    nextRefreshAt: isoAgo(-15),
  };
}

function internalErrors(world: World): InternalErrorImpactItem[] {
  const failureRate = failureRateFor(world.scenario.health);
  if (failureRate === 0 || world.flows.length === 0) return [];
  const rng = rngFor(`internal-errors-${world.scenario.health}`);
  const affected = rng.some(
    world.flows,
    Math.min(world.flows.length, failureRate > 0.5 ? 6 : 2),
  );
  const project = world.projects[0];

  return affected
    .map((flow) => ({
      projectId: project.id,
      projectName: project.displayName,
      flowId: flow.id,
      flowName: flow.version.displayName,
      count: rng.int(1, failureRate > 0.5 ? 40 : 6),
    }))
    .sort((left, right) => right.count - left.count);
}

function queueMetrics(world: World): PlatformMetricsLive {
  const running = world.runs.filter(
    (run) => run.status === FlowRunStatus.RUNNING,
  );
  const queued = world.runs.filter(
    (run) => run.status === FlowRunStatus.QUEUED,
  );
  /* A stuck job is a running one that has been running too long. Take the
     oldest running ones, which is exactly what the real query does. */
  const stuckCount =
    world.scenario.health === 'clean'
      ? 0
      : world.scenario.health === 'mixed'
      ? 1
      : 3;
  const project = world.projects[0];
  const stuckJobs: StuckJob[] = [...running]
    .reverse()
    .slice(0, stuckCount)
    .map((run) => ({
      flowRunId: run.id,
      flowId: run.flowId,
      flowName: run.flowVersion?.displayName ?? 'Untitled flow',
      projectId: project.id,
      projectName: project.displayName,
      status: run.status,
    }));

  return {
    running: running.length,
    queued: queued.length,
    stuckJobs,
  };
}

/*
 * Trigger health, per piece.
 *
 * The pieces are the ones the world's flows are actually triggered by, so the
 * list matches what a click on any flow would show. Polling pieces run every
 * few minutes and dominate the counts; the webhook ones are quiet.
 */
function triggerPieceName(flow: PopulatedFlow): string | null {
  const trigger = flow.version.trigger;
  return trigger.type === FlowTriggerType.PIECE
    ? trigger.settings.pieceName
    : null;
}

function triggerStatus(world: World): TriggerStatusReport {
  const failureRate = failureRateFor(world.scenario.health);
  const pieceNames = Array.from(
    new Set(
      world.flows
        .map(triggerPieceName)
        .filter((name): name is string => name !== null),
    ),
  );
  /* One piece has a genuinely bad fortnight, so the "fault" row exists. */
  const worstPiece = pieceNames[1];

  const pieces: TriggerStatusReport['pieces'] = {};
  pieceNames.forEach((pieceName) => {
    const piece = PIECE_BY_NAME.get(pieceName);
    const rng = rngFor(`trigger-${pieceName}-${world.scenario.health}`);
    const polling = piece ? !['webhook', 'http'].includes(piece.name) : true;
    const flowsOnPiece = world.flows.filter(
      (flow) => triggerPieceName(flow) === pieceName,
    ).length;
    const perDay = polling ? 288 * flowsOnPiece : rng.int(2, 30) * flowsOnPiece;
    const pieceFailureRate =
      pieceName === worstPiece && failureRate > 0
        ? Math.min(1, failureRate * 2.5)
        : failureRate * 0.3;

    const dailyStats: Record<string, { success: number; failure: number }> = {};
    let totalRuns = 0;
    for (let index = 0; index < 14; index++) {
      const runs = Math.round(perDay * (0.85 + rng.next() * 0.3));
      const failure = rng.chance(Math.min(1, pieceFailureRate * 3))
        ? Math.round(runs * pieceFailureRate * (0.5 + rng.next()))
        : 0;
      const success = Math.max(0, runs - failure);
      dailyStats[localDayKey(daysAgo(index))] = { success, failure };
      totalRuns += runs;
    }
    pieces[pieceName] = { dailyStats, totalRuns };
  });

  return { pieces };
}

const WORKER_GROUPS = [
  { label: 'finance_eu', slots: 8 },
  { label: 'data_pipelines', slots: 16 },
];

const WORKER_HOSTS = [
  { ip: '10.0.12.4', cores: 4, ramGb: 8, diskGb: 80 },
  { ip: '10.0.12.9', cores: 4, ramGb: 8, diskGb: 80 },
  { ip: '10.0.14.21', cores: 8, ramGb: 16, diskGb: 120 },
  { ip: '10.0.14.22', cores: 2, ramGb: 4, diskGb: 40 },
];

function workerMachines(world: World): WorkerMachineWithStatus[] {
  const count = workerCount(world);
  const { has } = capabilitiesFor(world.scenario);
  const cloud = isCloud(world.scenario);
  const health = world.scenario.health;
  const gib = 1024 ** 3;

  return WORKER_HOSTS.slice(0, count).map((host, index) => {
    const rng = rngFor(`worker-${index}-${health}`);
    /* The last machine is the one that went away on a bad day; on a realistic
       day it is merely on the previous release. */
    const offline = health === 'failing' && index === count - 1 && count > 1;
    const stale = health !== 'clean' && index === 1 && count > 1;
    /* Busy is the point: a bar at 8% tells you nothing about the colour ramp,
       one at 87% does. */
    const cpu = offline ? 0 : rng.int(12, 91) + rng.next();
    const ram = offline ? 0 : rng.int(35, 88) + rng.next();
    const diskPercentage = rng.int(22, 74) + rng.next();
    const diskTotal = host.diskGb * gib;
    const diskUsed = Math.round(diskTotal * (diskPercentage / 100));
    const concurrency = host.cores * 5;
    /* The back half of the fleet is on dedicated groups, so even a two-machine
       platform has one shared and one grouped worker. */
    const groupedFrom = Math.ceil(count / 2);
    const group =
      has.workerGroups && index >= groupedFrom
        ? WORKER_GROUPS[(index - groupedFrom) % WORKER_GROUPS.length]
        : undefined;
    const busySandboxes = offline ? 0 : rng.int(0, Math.min(concurrency, 6));

    return {
      id: idFrom(`worker-machine-${index}`),
      created: isoAgo(DAY_MINUTES * rng.int(20, 200)),
      updated: offline ? isoAgo(rng.int(35, 240)) : isoAgo(0),
      status: offline
        ? WorkerMachineStatus.OFFLINE
        : WorkerMachineStatus.ONLINE,
      type:
        cloud && !isLicensed(world.scenario)
          ? WorkerMachineType.SHARED
          : WorkerMachineType.DEDICATED,
      workerGroupId: group?.label,
      workerGroupScope: group
        ? WorkerGroupScope.PROJECT
        : cloud && !isLicensed(world.scenario)
        ? undefined
        : WorkerGroupScope.PLATFORM,
      information: {
        workerId: `worker-${host.ip.split('.').slice(2).join('-')}`,
        ip: host.ip,
        cpuUsagePercentage: Number(cpu.toFixed(1)),
        ramUsagePercentage: Number(ram.toFixed(1)),
        totalAvailableRamInBytes: host.ramGb * gib,
        totalCpuCores: host.cores,
        serverPingMs: offline ? undefined : rng.int(2, 38),
        diskInfo: {
          total: diskTotal,
          used: diskUsed,
          free: diskTotal - diskUsed,
          percentage: Number(diskPercentage.toFixed(1)),
        },
        workerProps: {
          EXECUTION_MODE: 'SANDBOX_CODE_ONLY',
          WORKER_CONCURRENCY: String(concurrency),
          SANDBOX_MEMORY_LIMIT: '1048576',
          REUSE_SANDBOX: 'true',
          version: stale ? STALE_VERSION : CURRENT_VERSION,
        },
        sandboxes: Array.from({ length: concurrency }, (_, boxId) => ({
          sandboxId: idFrom(`sandbox-${index}-${boxId}`),
          boxId,
          busy: boxId < busySandboxes,
          memoryUsageBytes:
            boxId < busySandboxes ? rng.int(90, 640) * 1024 * 1024 : 0,
        })),
      },
    };
  });
}

function workerGroupCapacity(world: World): {
  groups: { label: string; slots: number }[];
  sharedSlots: number;
} {
  const machines = workerMachines(world);
  const online = machines.filter(
    (machine) => machine.status === WorkerMachineStatus.ONLINE,
  );
  const slotsOf = (machine: WorkerMachineWithStatus) =>
    Number(machine.information.workerProps.WORKER_CONCURRENCY ?? 1);
  const groups = WORKER_GROUPS.filter((group) =>
    online.some((machine) => machine.workerGroupId === group.label),
  ).map((group) => ({
    label: group.label,
    slots: online
      .filter((machine) => machine.workerGroupId === group.label)
      .reduce((sum, machine) => sum + slotsOf(machine), 0),
  }));
  const sharedSlots = online
    .filter((machine) => machine.workerGroupScope !== WorkerGroupScope.PROJECT)
    .reduce((sum, machine) => sum + slotsOf(machine), 0);
  return { groups, sharedSlots };
}

/*
 * Credits per project, adding up to the platform total that
 * `/v1/platform-billing/info` reports — the usage page shows both, one above
 * the other, and a reviewer will add them up.
 */
export function platformCreditsUsed(world: World): number {
  return isLicensed(world.scenario) ? 18_400 : 240;
}

function projectsUsage(world: World): ProjectCreditUsage[] {
  if (volumeFactorFor(world.scenario.volume) === 0) return [];
  const total = platformCreditsUsed(world);
  const weights = world.projects.map(
    (project, index) =>
      /* The first project is the team's main one and does most of the work. */
      (index === 0 ? 3 : 1) *
      (0.6 + rngFor(`usage-weight-${project.id}`).next()),
  );
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

  let allocated = 0;
  return world.projects
    .map((project, index) => {
      const rng = rngFor(`usage-${project.id}`);
      const isLast = index === world.projects.length - 1;
      const creditsUsed = isLast
        ? total - allocated
        : Math.round((total * weights[index]) / weightSum);
      allocated += creditsUsed;
      return {
        projectId: project.id,
        projectName: project.displayName,
        creditsUsed,
        aiCreditsUsed: Math.round(creditsUsed * (0.15 + rng.next() * 0.45)),
      };
    })
    .sort((left, right) => right.creditsUsed - left.creditsUsed);
}

/*
 * The plan grid. Names must match `PLAN_CATALOG` in plan-selector-utils
 * once the interval suffix is stripped: Free, Plus, Team — enterprise is a
 * sales conversation and has no purchasable row.
 */
const PLANS: PurchasablePlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For trying things out.',
    price: 0,
    interval: 'month',
    priceDisplay: '$0',
    baseVariantId: null,
    includedSeats: 1,
    includedCredits: 1_000,
    creditsResetInterval: 'month',
  },
  {
    id: 'plus',
    name: 'Plus',
    description: 'For solo builders.',
    price: 25,
    interval: 'month',
    priceDisplay: '$25',
    baseVariantId: 'var_plus_month',
    includedSeats: 1,
    includedCredits: 10_000,
    creditsResetInterval: 'month',
  },
  {
    id: 'plus_annual',
    name: 'Plus (Annual)',
    description: 'For solo builders.',
    price: 250,
    interval: 'year',
    priceDisplay: '$250',
    baseVariantId: 'var_plus_year',
    includedSeats: 1,
    includedCredits: 10_000,
    creditsResetInterval: 'month',
  },
  {
    id: 'team',
    name: 'Team',
    description: 'For teams that collaborate on automations.',
    price: 150,
    interval: 'month',
    priceDisplay: '$150',
    baseVariantId: 'var_team_month',
    includedSeats: 5,
    includedCredits: 50_000,
    creditsResetInterval: 'month',
  },
  {
    id: 'team_annual',
    name: 'Team (Annual)',
    description: 'For teams that collaborate on automations.',
    price: 1_500,
    interval: 'year',
    priceDisplay: '$1,500',
    baseVariantId: 'var_team_year',
    includedSeats: 5,
    includedCredits: 50_000,
    creditsResetInterval: 'month',
  },
];

export const adminOperationsRoutes: Route[] = [
  [
    'GET',
    '/v1/health/system',
    ({ world }) => systemHealth(world),
    GetSystemHealthChecksResponse,
  ],
  [
    'GET',
    '/v1/health/history',
    ({ world }) => healthHistory(world),
    PlatformMetricsHealthHistory,
  ],
  [
    'GET',
    '/v1/health/run-metrics',
    ({ world, query }) =>
      runMetrics(world, query.createdAfter, query.createdBefore),
    PlatformMetricsReport,
  ],
  [
    'GET',
    '/v1/health/queue-metrics',
    ({ world }) => queueMetrics(world),
    PlatformMetricsLive,
  ],
  [
    'GET',
    '/v1/trigger-runs/status',
    ({ world }) => triggerStatus(world),
    TriggerStatusReport,
  ],
  [
    'GET',
    '/v1/worker-machines',
    ({ world }) => workerMachines(world),
    WorkerMachineWithStatus.array(),
  ],
  [
    'GET',
    '/v1/projects/worker-groups',
    ({ world }) => workerGroupCapacity(world),
  ],
  [
    'GET',
    '/v1/platform-billing/projects-usage',
    ({ world, query }) => page(projectsUsage(world), query),
  ],
  ['GET', '/v1/platform-billing/plans', () => PLANS, PurchasablePlan.array()],
];
