/*
 * The analytics report behind /impact.
 *
 * `/v1/analytics` had no fixture, and because the path ends in "s" the
 * adapter's fallback handed the page a SeekPage — an object with `data` and no
 * `flows`, which threw on first render and took the whole route out of every
 * screenshot run. The report is derived from the same world as every other
 * screen, so the numbers on /impact agree with the flows and runs listed
 * elsewhere in the scenario.
 */

import { FlowStatus, PlatformAnalyticsReport } from '@activepieces/shared';

import { idFrom, isoAgo, rngFor } from './rng';
import { World } from './world';

export function analyticsFor(world: World): PlatformAnalyticsReport {
  const projectNames = new Map(
    world.projects.map((project) => [project.id, project.displayName]),
  );

  const flows = world.flows.map((flow) => {
    /* Seeded per flow id, so the same scenario always reports the same saving
       and a screenshot diff is never the data moving. */
    const rng = rngFor(`analytics-${flow.id}`);
    const savesTime = rng.int(0, 3) > 0;
    return {
      flowId: flow.id,
      flowName: flow.version.displayName,
      projectId: flow.projectId,
      projectName: projectNames.get(flow.projectId) ?? 'Project',
      status: flow.status ?? FlowStatus.DISABLED,
      timeSavedPerRun: savesTime ? rng.int(2, 45) : null,
      ownerId: world.user.id,
    };
  });

  const runsByDayAndFlow = new Map<string, number>();
  world.runs.forEach((run) => {
    const day = String(run.startTime ?? run.created).slice(0, 10);
    const key = `${day}|${run.flowId}`;
    runsByDayAndFlow.set(key, (runsByDayAndFlow.get(key) ?? 0) + 1);
  });

  const runs = [...runsByDayAndFlow.entries()]
    .map(([key, count]) => {
      const [day, flowId] = key.split('|');
      return { day, flowId, runs: count };
    })
    .sort((left, right) => left.day.localeCompare(right.day));

  return {
    id: idFrom('analytics-report'),
    created: isoAgo(60),
    updated: isoAgo(5),
    cachedAt: isoAgo(5),
    outdated: false,
    platformId: world.platform.id,
    flows,
    runs,
    users: world.users,
  };
}
