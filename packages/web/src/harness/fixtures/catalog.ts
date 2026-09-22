/*
 * The content the fixtures are built from.
 *
 * Quality matters more here than anywhere else in the harness. "Test Flow 1"
 * times twenty tells you nothing about how a list *feels* — whether names wrap,
 * whether the column is wide enough, whether two rows are distinguishable at a
 * glance. Every name below is one a real customer could plausibly have, and the
 * lengths are deliberately uneven so truncation gets exercised.
 */

export type PieceRef = {
  name: string;
  displayName: string;
  /* Real CDN paths, so the logos actually load and colour lands on the screen
     the way it will in production. */
  logoUrl: string;
  auth: boolean;
};

export const PIECES: PieceRef[] = [
  { name: 'slack', displayName: 'Slack', auth: true },
  { name: 'gmail', displayName: 'Gmail', auth: true },
  { name: 'google-sheets', displayName: 'Google Sheets', auth: true },
  { name: 'hubspot', displayName: 'HubSpot', auth: true },
  { name: 'salesforce', displayName: 'Salesforce', auth: true },
  { name: 'stripe', displayName: 'Stripe', auth: true },
  { name: 'shopify', displayName: 'Shopify', auth: true },
  { name: 'zendesk', displayName: 'Zendesk', auth: true },
  { name: 'notion', displayName: 'Notion', auth: true },
  { name: 'airtable', displayName: 'Airtable', auth: true },
  { name: 'github', displayName: 'GitHub', auth: true },
  { name: 'linear', displayName: 'Linear', auth: true },
  { name: 'intercom', displayName: 'Intercom', auth: true },
  { name: 'jira-cloud', displayName: 'Jira Cloud', auth: true },
  { name: 'openai', displayName: 'OpenAI', auth: true },
  { name: 'anthropic', displayName: 'Anthropic', auth: true },
  { name: 'postgres', displayName: 'PostgreSQL', auth: true },
  { name: 'twilio', displayName: 'Twilio', auth: true },
  { name: 'mailchimp', displayName: 'Mailchimp', auth: true },
  { name: 'typeform', displayName: 'Typeform', auth: true },
  { name: 'calendly', displayName: 'Calendly', auth: true },
  { name: 'webhook', displayName: 'Webhook', auth: false },
  { name: 'schedule', displayName: 'Schedule', auth: false },
  { name: 'http', displayName: 'HTTP', auth: false },
].map((piece) => ({
  ...piece,
  logoUrl: `https://cdn.activepieces.com/pieces/${piece.name}.png`,
}));

export const PIECE_BY_NAME = new Map(
  PIECES.map((piece) => [`@activepieces/piece-${piece.name}`, piece]),
);

/*
 * Flow names, as a job to be done rather than a noun.
 *
 * Long ones are here on purpose: "Escalate Zendesk tickets…" is 63 characters
 * and is what tells you whether a table column truncates gracefully or shoves
 * the next column off screen.
 */
export const FLOW_NAMES: string[] = [
  'New Stripe payment → Slack #revenue',
  'Sync HubSpot deals to Google Sheets',
  'Escalate Zendesk tickets older than 48h to the on-call engineer',
  'Weekly churn digest',
  'Onboard new employee',
  'Shopify order → warehouse',
  'Refund request approval',
  'Enrich inbound leads from Typeform',
  'Nightly Postgres backup check',
  'Notify #support when CSAT drops below 4',
  'Create Linear issue from GitHub bug report',
  'Invoice chaser',
  'Route enterprise trials to sales',
  'Daily standup reminder',
  'Archive closed Jira epics',
  'Send NPS survey 14 days after signup',
  'Deduplicate Salesforce contacts',
  'Slack alert on failed payment retry',
  'Tag high-value customers in Intercom',
  'Publish changelog to Notion and Slack',
  'Expense report approval chain',
  'Reconcile Stripe payouts with the ledger',
  'Cancel trial reminders once someone converts',
  'Watch the status page and page on-call',
  'Monthly board metrics pack',
  'Welcome email sequence',
  'Sync Airtable roadmap to Linear',
  'Escalate unanswered sales emails',
  'Backfill missing customer regions',
  'Quarantine suspicious signups',
];

export const FOLDER_NAMES: string[] = [
  'Revenue',
  'Support',
  'Internal',
  'Data hygiene',
  'Experiments',
];

export const AGENT_NAMES: { name: string; description: string }[] = [
  {
    name: 'Support triage',
    description:
      'Reads an incoming ticket, decides how urgent it is, and routes it to the right queue.',
  },
  {
    name: 'Refund decider',
    description:
      'Checks the order, the policy and the customer history, then approves or escalates.',
  },
  {
    name: 'Lead researcher',
    description:
      'Looks up an inbound company, summarises what they do, and scores the fit.',
  },
  {
    name: 'Invoice reader',
    description: 'Pulls line items out of a PDF invoice and files them.',
  },
  {
    name: 'Changelog writer',
    description:
      'Turns a week of merged pull requests into something a customer would read.',
  },
  {
    name: 'On-call summariser',
    description: 'Condenses an incident channel into a handover note.',
  },
  {
    name: 'Contract reviewer',
    description: 'Flags the clauses legal has asked to see every time.',
  },
];

export const PEOPLE: { firstName: string; lastName: string; email: string }[] =
  [
    { firstName: 'Moaaz', lastName: 'Zaki', email: 'moaaz@activepieces.com' },
    { firstName: 'Amelia', lastName: 'Okonkwo', email: 'amelia@northwind.co' },
    { firstName: 'Daniel', lastName: 'Ferreira', email: 'daniel@northwind.co' },
    { firstName: 'Priya', lastName: 'Raghavan', email: 'priya@northwind.co' },
    { firstName: 'Tomas', lastName: 'Novak', email: 'tomas@northwind.co' },
    { firstName: 'Yuki', lastName: 'Tanaka', email: 'yuki@northwind.co' },
    { firstName: 'Sarah', lastName: 'Lindqvist', email: 'sarah@northwind.co' },
    { firstName: 'Omar', lastName: 'Haddad', email: 'omar@northwind.co' },
  ];

export const PROJECT_NAMES: string[] = [
  'Northwind Trading',
  'Support operations',
  'Growth experiments',
  'Finance automation',
  'Partner integrations',
];

export const TABLE_NAMES: string[] = [
  'Customers',
  'Refund requests',
  'Churn signals',
  'Onboarding checklist',
  'Vendor contacts',
  'Feature requests',
];

/*
 * Failure messages, in the words the thing that broke would use.
 *
 * "Request failed" tells a designer nothing about how much room an error needs.
 * These are the real lengths, including the one that wraps to three lines.
 */
export const FAILURE_MESSAGES: string[] = [
  'Slack returned 429 Too Many Requests. The workspace is over its rate limit for the next 26 seconds.',
  'The refresh token was revoked. Google does this when the account password changes.',
  'Timed out after 30s waiting for the HubSpot API.',
  'Property "deal_stage" does not exist on this object.',
  'Connection refused by postgres://prod-replica:5432.',
  'The step returned undefined where an object was expected.',
  'Stripe: No such customer: cus_QXm2r8kLp0.',
];
