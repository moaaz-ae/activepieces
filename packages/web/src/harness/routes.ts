/*
 * The shape of a fixture route, shared by every fixture file.
 *
 * `fixture-adapter.ts` owns the matching and the fallback; the files under
 * `fixtures/` own the answers. Keeping the type here rather than in the adapter
 * means a fixture file imports nothing that imports it back.
 */

import type { worldFor } from './fixtures/world';

export type Query = Record<string, string>;

export type Context = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Query;
  body: unknown;
  world: ReturnType<typeof worldFor>;
};

export type Handler = (context: Context) => unknown;

/* A response schema, when the endpoint has one. Checked in dev so a fixture
   whose shape the caller's contract forbids fails at the fixture rather than
   three components deep. */
export type Shape = { safeParse: (value: unknown) => { success: boolean } };

/* [method, pattern, handler, schema?]. Patterns are literal segments and
   `:param` segments; the first registered pattern that matches wins. */
export type Route = [string, string, Handler, Shape?];

/* A SeekPage: what every list endpoint answers with. */
export function page<T>(items: T[], query: Query): unknown {
  const limit = Number(query.limit ?? 0) || items.length;
  const cursor = Number(query.cursor ?? 0) || 0;
  const slice = items.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit;
  return {
    data: slice,
    next: nextCursor < items.length ? String(nextCursor) : null,
    previous: cursor > 0 ? String(Math.max(0, cursor - limit)) : null,
  };
}
