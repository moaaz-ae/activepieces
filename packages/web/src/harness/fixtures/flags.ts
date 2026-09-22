/*
 * The flags response.
 *
 * `EDITION` is the one flag most of the EE gating in the web app reads, so it
 * is the other half of the licence switch — the platform plan booleans cover
 * the rest.
 */

import { ApEdition, ApFlagId } from '@activepieces/shared';

import { isLicensed, Scenario } from '../scenario';

import { PLATFORM_ID } from './world';

const EDITION_BY_AXIS: Record<Scenario['edition'], ApEdition> = {
  community: ApEdition.COMMUNITY,
  enterprise: ApEdition.ENTERPRISE,
  cloud: ApEdition.CLOUD,
  /* The free tier is the cloud build without paid features: the EDITION flag
     says cloud, the plan booleans say no. */
  free: ApEdition.CLOUD,
};

export function flagsFor(scenario: Scenario): Record<string, unknown> {
  const licensed = isLicensed(scenario);

  return {
    [ApFlagId.EDITION]: EDITION_BY_AXIS[scenario.edition],
    [ApFlagId.ENVIRONMENT]: 'prod',
    [ApFlagId.CURRENT_VERSION]: '0.70.0',
    [ApFlagId.PUBLIC_URL]: window.location.origin,
    [ApFlagId.WEBHOOK_URL_PREFIX]: `${window.location.origin}/api/v1/webhooks`,
    [ApFlagId.USER_CREATED]: true,
    [ApFlagId.EMAIL_AUTH_ENABLED]: true,
    [ApFlagId.EMAIL_CODE_AUTH_ENABLED]: false,
    [ApFlagId.CLOUD_AUTH_ENABLED]: true,
    [ApFlagId.AGENTS_CONFIGURED]: true,
    [ApFlagId.SHOW_COMMUNITY]: !licensed,
    [ApFlagId.SHOW_POWERED_BY_IN_FORM]: !licensed,
    [ApFlagId.SHOW_ALERTS]: licensed,
    [ApFlagId.SHOW_PROJECT_MEMBERS]: licensed,
    [ApFlagId.SMTP_CONFIGURED]: licensed,
    [ApFlagId.PRIVATE_PIECES_ENABLED]: licensed,
    [ApFlagId.TOOL_SEARCH_ENABLED]: true,
    [ApFlagId.PGVECTOR_AVAILABLE]: true,
    [ApFlagId.ALLOW_NPM_PACKAGES_IN_CODE_STEP]: true,
    [ApFlagId.ENABLE_FLOW_ON_PUBLISH]: true,
    [ApFlagId.PROJECT_RATE_LIMITER_ENABLED]: false,
    [ApFlagId.EXECUTION_DATA_RETENTION_DAYS]: 30,
    [ApFlagId.FLOW_RUN_TIME_SECONDS]: 600,
    [ApFlagId.FLOW_RUN_MEMORY_LIMIT_KB]: 1_048_576,
    [ApFlagId.FLOW_RUN_LOG_SIZE_LIMIT_MB]: 10,
    [ApFlagId.TRIGGER_TIMEOUT_SECONDS]: 3600,
    [ApFlagId.WEBHOOK_TIMEOUT_SECONDS]: 30,
    [ApFlagId.PAUSED_FLOW_TIMEOUT_DAYS]: 30,
    [ApFlagId.MAX_RECORDS_PER_TABLE]: 10_000,
    [ApFlagId.MAX_FIELDS_PER_TABLE]: 50,
    [ApFlagId.MAX_FILE_SIZE_MB]: 25,
    [ApFlagId.MAX_MCPS_PER_PROJECT]: 10,
    [ApFlagId.DEFAULT_CONCURRENT_JOBS_LIMIT]: 10,
    [ApFlagId.PIECES_SYNC_MODE]: 'NONE',
    [ApFlagId.SUPPORTED_APP_WEBHOOKS]: {},
    [ApFlagId.TEMPLATES_PROJECT_ID]: PLATFORM_ID,
    [ApFlagId.TEMPLATES_CATEGORIES]: [],
    [ApFlagId.PRIVACY_POLICY_URL]: 'https://activepieces.com/privacy',
    [ApFlagId.TERMS_OF_SERVICE_URL]: 'https://activepieces.com/terms',
    /* A licensed platform is the one with SSO configured, so the sign-in
       screen shows its SAML and Google buttons there and only there. */
    [ApFlagId.THIRD_PARTY_AUTH_PROVIDERS_TO_SHOW_MAP]: licensed
      ? { google: true, saml: true }
      : {},
    [ApFlagId.THIRD_PARTY_AUTH_PROVIDER_REDIRECT_URL]: licensed
      ? `${window.location.origin}/redirect`
      : '',
    [ApFlagId.FRONTEND_SENTRY_DSN]: undefined,
    [ApFlagId.TURNSTILE_SITE_KEY]: undefined,
    [ApFlagId.SAML_AUTH_ACS_URL]: licensed
      ? `${window.location.origin}/api/v1/authn/saml/acs`
      : '',
    [ApFlagId.ALLOWED_EMBED_ORIGINS]: [],
    [ApFlagId.THEME]: {
      websiteName: 'Activepieces',
      logos: {
        fullLogoUrl: 'https://cdn.activepieces.com/brand/full-logo.png',
        favIconUrl: 'https://cdn.activepieces.com/brand/favicon.ico',
        logoIconUrl: 'https://cdn.activepieces.com/brand/logo.svg',
      },
      /* `light` and `dark` are the pre-redesign theme provider's shape. They
         cost nothing here and mean the same harness can be cherry-picked onto
         an older commit to screenshot what the redesign replaced. */
      colors: {
        avatar: '#515151',
        'blue-link': '#1890ff',
        danger: '#dc2626',
        selection: '#eee5ff',
        primary: {
          default: '#6e41e2',
          dark: '#5a34bb',
          light: '#eee5ff',
          medium: '#8f6cf0',
        },
        warn: { default: '#f78a3b', light: '#fff6e4', dark: '#cc8805' },
        success: { default: '#14ae5c', light: '#3cad71' },
      },
    },
  };
}
