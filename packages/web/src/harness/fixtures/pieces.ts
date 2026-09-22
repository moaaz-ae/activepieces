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
  PieceMetadataModelSummary,
  PropertyType,
} from '@activepieces/pieces-framework';
import { PackageType, PieceCategory, PieceType } from '@activepieces/shared';

import { PIECES } from './catalog';
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
