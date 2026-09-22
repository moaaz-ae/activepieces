/*
 * What the current role may do, in the app's own vocabulary.
 *
 * The role axis is only worth having if it actually gates the UI, and the web
 * app gates on a permission list handed back by `/v1/project-members/role`.
 * So the axis maps onto real permissions rather than onto a boolean the
 * harness invents — a viewer here sees exactly what a viewer sees in
 * production, including which buttons disappear and which merely disable.
 */

import { Permission, ProjectRole, RoleType } from '@activepieces/shared';

import { Role, Scenario } from '../scenario';

import { PLATFORM_ID } from './world';

export const READ_ONLY: Permission[] = [
  Permission.READ_APP_CONNECTION,
  Permission.READ_FLOW,
  Permission.READ_RUN,
  Permission.READ_FOLDER,
  Permission.READ_PROJECT,
  Permission.READ_PROJECT_MEMBER,
  Permission.READ_INVITATION,
  Permission.READ_ALERT,
  Permission.READ_MCP,
  Permission.READ_TABLE,
  Permission.READ_VARIABLE,
  Permission.READ_AGENT,
  Permission.READ_KNOWLEDGE_BASE,
  Permission.READ_PROJECT_RELEASE,
];

/* An operator runs and answers things but cannot change how they work — the
   distinction the approvals queue exists for. */
export const OPERATOR: Permission[] = [...READ_ONLY, Permission.WRITE_RUN];

export const EDITOR: Permission[] = [
  ...OPERATOR,
  Permission.WRITE_FLOW,
  Permission.UPDATE_FLOW_STATUS,
  Permission.WRITE_FOLDER,
  Permission.WRITE_APP_CONNECTION,
  Permission.WRITE_TABLE,
  Permission.WRITE_VARIABLE,
  Permission.WRITE_AGENT,
  Permission.WRITE_MCP,
  Permission.WRITE_KNOWLEDGE_BASE,
];

export const OWNER: Permission[] = [
  ...EDITOR,
  Permission.WRITE_PROJECT,
  Permission.WRITE_PROJECT_MEMBER,
  Permission.WRITE_INVITATION,
  Permission.WRITE_ALERT,
  Permission.WRITE_PROJECT_RELEASE,
  Permission.PUBLISH_SENSITIVE_FLOW_ACCESS,
];

const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  admin: OWNER,
  owner: OWNER,
  editor: EDITOR,
  operator: OPERATOR,
  viewer: READ_ONLY,
};

const NAME_BY_ROLE: Record<Role, string> = {
  admin: 'Admin',
  owner: 'Admin',
  editor: 'Editor',
  operator: 'Operator',
  viewer: 'Viewer',
};

export function projectRoleFor(scenario: Scenario): ProjectRole {
  return {
    id: `role-${scenario.role}`,
    created: new Date(0).toISOString(),
    updated: new Date(0).toISOString(),
    name: NAME_BY_ROLE[scenario.role],
    permissions: PERMISSIONS_BY_ROLE[scenario.role],
    platformId: PLATFORM_ID,
    type: RoleType.DEFAULT,
  };
}
