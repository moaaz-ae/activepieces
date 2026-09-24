/*
 * The piece registry.
 *
 * Small, but load-bearing: every flow row, run row, connection row and step in
 * the builder resolves its icon through this list. Without it the lists render
 * as grey squares, which is exactly the part of the design that most needs to
 * be honest — a column of twenty coloured logos is a very different visual
 * weight from a column of twenty placeholders.
 */

import {
  PieceMetadataModel,
  PieceMetadataModelSummary,
  PropertyType,
} from '@activepieces/pieces-framework';
import { PackageType, PieceCategory, PieceType } from '@activepieces/shared';

import { PIECE_ACTIONS, PIECE_BY_NAME, PIECES } from './catalog';
import { rngFor } from './rng';

const CATEGORY_BY_PIECE: Record<string, PieceCategory> = {
  slack: PieceCategory.COMMUNICATION,
  gmail: PieceCategory.COMMUNICATION,
  twilio: PieceCategory.COMMUNICATION,
  hubspot: PieceCategory.SALES_AND_CRM,
  salesforce: PieceCategory.SALES_AND_CRM,
  stripe: PieceCategory.ACCOUNTING,
  shopify: PieceCategory.COMMERCE,
  zendesk: PieceCategory.CUSTOMER_SUPPORT,
  intercom: PieceCategory.CUSTOMER_SUPPORT,
  openai: PieceCategory.ARTIFICIAL_INTELLIGENCE,
  anthropic: PieceCategory.ARTIFICIAL_INTELLIGENCE,
};

export function piecesFor(
  query: Record<string, string>,
): PieceMetadataModelSummary[] {
  const pieces = PIECES.map((piece) => {
    const rng = rngFor(`piece-${piece.name}`);
    return {
      id: `piece-${piece.name}`,
      name: `@activepieces/piece-${piece.name}`,
      displayName: piece.displayName,
      logoUrl: piece.logoUrl,
      description: `Work with ${piece.displayName}.`,
      authors: ['activepieces'],
      version: '0.1.0',
      categories: CATEGORY_BY_PIECE[piece.name]
        ? [CATEGORY_BY_PIECE[piece.name]]
        : undefined,
      /*
       * Load-bearing, not decoration.
       *
       * The connections list filters its own rows through
       * `getAuthPropertyForValue(connection.type, piece.auth)` and drops
       * anything whose piece declares no auth — so a registry without this
       * renders the table chrome and zero rows, which reads as an empty state
       * rather than as a missing fixture.
       */
      auth: piece.auth
        ? {
            type:
              piece.name === 'postgres'
                ? PropertyType.BASIC_AUTH
                : PropertyType.OAUTH2,
            displayName: 'Connection',
            required: true,
          }
        : undefined,
      minimumSupportedRelease: '0.0.0',
      maximumSupportedRelease: '99.0.0',
      actions: rng.int(3, 24),
      triggers: rng.int(1, 6),
      /* Drives the "most used" ordering the piece picker leans on, so the
         list is not alphabetical-looking when it is meant to be ranked. */
      projectUsage: rng.int(0, 40),
      pieceType: PieceType.OFFICIAL,
      packageType: PackageType.REGISTRY,
    } as unknown as PieceMetadataModelSummary;
  });

  const needle = (query.searchQuery ?? '').toLowerCase();
  if (!needle) return pieces;
  return pieces.filter(
    (piece) =>
      piece.displayName.toLowerCase().includes(needle) ||
      piece.name.toLowerCase().includes(needle),
  );
}

/*
 * One piece, in full.
 *
 * `/v1/pieces` answers with summaries — enough for a logo in a list. The
 * builder needs the other endpoint: for every step on the canvas it fetches
 * the whole piece and then reads `piece.actions[actionName].displayName`
 * straight off it. A summary there throws on `undefined.displayName` and the
 * canvas renders nothing at all, which is why the builder used to be a blank
 * page rather than a bad-looking one.
 *
 * So every action name the flow fixtures use exists here, with a description,
 * and the trigger the fixtures use exists too. Props are empty: the settings
 * panel then renders its connection picker and its chrome, which is the part
 * a colour review is looking at, without inventing a form no real piece has.
 */
function describe(displayName: string, pieceName: string): string {
  return `${displayName} in ${pieceName}.`;
}

export function pieceFor(name: string): PieceMetadataModel | undefined {
  const piece = PIECE_BY_NAME.get(name);
  if (!piece) return undefined;
  const summary = piecesFor({}).find((entry) => entry.name === name);

  const actions = Object.fromEntries(
    PIECE_ACTIONS.map((action) => [
      action.name,
      {
        name: action.name,
        displayName: action.displayName,
        description: describe(action.displayName, piece.displayName),
        props: {},
        requireAuth: piece.auth,
        errorHandlingOptions: {
          continueOnFailure: { defaultValue: false, hide: false },
          retryOnFailure: { defaultValue: false, hide: false },
        },
      },
    ]),
  );

  return {
    ...summary,
    name,
    displayName: piece.displayName,
    logoUrl: piece.logoUrl,
    description: `Work with ${piece.displayName}.`,
    version: '0.1.0',
    actions,
    triggers: {
      new_event: {
        name: 'new_event',
        displayName: `New ${piece.displayName} event`,
        description: `Fires when something new happens in ${piece.displayName}.`,
        props: {},
        type: 'WEBHOOK',
        sampleData: {},
        requireAuth: piece.auth,
      },
    },
  } as unknown as PieceMetadataModel;
}
