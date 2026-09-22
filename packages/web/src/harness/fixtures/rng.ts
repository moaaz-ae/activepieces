/*
 * Deterministic randomness.
 *
 * Every fixture is derived from a seed made of the scenario plus the entity's
 * own name, so the same scenario always produces the same world. That matters
 * for screenshots: a diff between two commits should be the design changing,
 * never the data.
 */

export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  some: <T>(items: readonly T[], count: number) => T[];
  chance: (probability: number) => boolean;
  /* Minutes ago, weighted towards the recent past — real activity is not
     uniform, and a list of evenly spaced timestamps reads as fake. */
  agoMinutes: (maxDays: number) => number;
};

/* mulberry32 — small, fast, and good enough that a list of 200 rows has no
   visible pattern in it. */
export function rngFor(seed: string): Rng {
  let state = hashSeed(seed);

  const next = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number) =>
    Math.floor(next() * (max - min + 1)) + min;

  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];

  return {
    next,
    int,
    pick,
    some: <T>(items: readonly T[], count: number): T[] => {
      const pool = [...items];
      const taken: T[] = [];
      while (taken.length < Math.min(count, pool.length)) {
        taken.push(...pool.splice(int(0, pool.length - 1), 1));
      }
      return taken;
    },
    chance: (probability: number) => next() < probability,
    agoMinutes: (maxDays: number) => {
      const skewed = next() ** 3;
      return Math.max(1, Math.floor(skewed * maxDays * 24 * 60));
    },
  };
}

/*
 * A pinned clock.
 *
 * Every timestamp in the world is "n minutes before now", and if `now` is the
 * wall clock then two screenshot runs ten minutes apart disagree about what
 * "Today, 8:13 PM" says — so a diff between two commits is full of drifting
 * timestamps and the one real change is lost in it.
 *
 * So `now` is the top of the current hour. Relative labels still read
 * correctly ("today", "3 days ago"), and any two runs within the same hour
 * produce byte-identical screens. `ap-harness-now` overrides it when a run has
 * to straddle the boundary.
 */
function pinnedNow(): number {
  try {
    const override = localStorage.getItem('ap-harness-now');
    if (override) return new Date(override).getTime();
  } catch {
    /* Blocked site data. The hour boundary is a fine answer. */
  }
  const HOUR = 60 * 60 * 1000;
  return Math.floor(Date.now() / HOUR) * HOUR;
}

export const NOW = pinnedNow();

export function isoAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

/* A 21-character id in the same shape as the real nanoid ones, so anything
   that slices or displays an id looks right. */
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export function idFrom(seed: string): string {
  const rng = rngFor(seed);
  let id = '';
  while (id.length < 21) {
    id += ID_ALPHABET[rng.int(0, ID_ALPHABET.length - 1)];
  }
  return id;
}
