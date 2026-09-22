/*
 * The scenario picker.
 *
 * Deliberately built from plain elements and inline-ish utility classes rather
 * than the app's own components: it has to stay legible while the design
 * system underneath it is being rebuilt, and a panel that breaks when
 * `Button`'s radius changes is a panel that cannot review the change.
 *
 * Switching an axis resets the react-query cache instead of reloading. That is
 * the whole reason this exists — a reload per state costs a page load, the
 * route you were on, the scroll position and the dialog you had open, and the
 * loop stops being worth running.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  DEFAULT_SCENARIO,
  EDITIONS,
  HEALTHS,
  ROLES,
  Scenario,
  scenarioStore,
  VOLUMES,
} from './scenario';

/*
 * The theme, without touching the app's theme provider.
 *
 * Deliberately not `useTheme()`. The panel has to compile against whatever
 * commit it is cherry-picked onto so the same harness can screenshot the
 * design it replaced, and that provider's shape has changed — on an older
 * commit it is `{ theme, setTheme }` rather than `{ preference,
 * setPreference }`, which made the type checker paint its error overlay across
 * every screenshot of the baseline.
 *
 * Both versions read the same localStorage key and one of these two roots, so
 * writing them directly works on either and couples the panel to nothing.
 */
type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'vite-ui-theme';

function readTheme(): ThemePreference {
  try {
    return (localStorage.getItem(THEME_KEY) as ThemePreference) ?? 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(next: ThemePreference) {
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* Blocked site data; the visual switch below still lands. */
  }
  const resolved =
    next === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : next;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
}

type Axis<T extends string> = {
  key: keyof Scenario;
  label: string;
  options: { id: T; label: string; note: string }[];
};

const AXES: Axis<string>[] = [
  { key: 'edition', label: 'Licence', options: EDITIONS },
  { key: 'role', label: 'Who am I', options: ROLES },
  { key: 'volume', label: 'How much exists', options: VOLUMES },
  { key: 'health', label: 'How it is going', options: HEALTHS },
];

export function HarnessPanel() {
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<ThemePreference>(readTheme);
  const [scenario, setScenario] = useState<Scenario>(scenarioStore.get());
  const [open, setOpen] = useState(false);

  useEffect(
    () => scenarioStore.subscribe(() => setScenario(scenarioStore.get())),
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'KeyS') {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const change = (next: Partial<Scenario>) => {
    scenarioStore.set(next);
    /* `resetQueries` rather than `invalidateQueries`: the suspense queries in
       this app keep their old data through an invalidation, so half the screen
       would still be showing the previous world while the other half refetched. */
    void queryClient.resetQueries();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-[9999] rounded-full bg-ink-950 px-3 py-1.5 text-xs font-medium text-ink-50 opacity-40 shadow-lg transition-opacity hover:opacity-100"
      >
        {scenario.edition} · {scenario.volume} · {scenario.health}
      </button>
    );
  }

  return (
    <div className="fixed right-4 bottom-4 z-[9999] w-80 rounded-2xl border border-border bg-popover p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">Scenario</div>
          <div className="text-xs text-muted-foreground">
            Fixtures only. No backend.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          ⌥S
        </button>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto">
        {AXES.map((axis) => (
          <div key={axis.key}>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              {axis.label}
            </div>
            <div className="flex flex-wrap gap-1">
              {axis.options.map((option) => {
                const active = scenario[axis.key] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    title={option.note}
                    onClick={() =>
                      change({ [axis.key]: option.id } as Partial<Scenario>)
                    }
                    className={`rounded-xl px-2 py-1 text-xs transition-colors ${
                      active
                        ? 'bg-primary text-on-primary'
                        : 'bg-muted text-foreground hover:bg-accent'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Theme
          </div>
          <div className="flex flex-wrap gap-1">
            {(['system', 'light', 'dark'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setTheme(option);
                  applyTheme(option);
                }}
                className={`rounded-xl px-2 py-1 text-xs transition-colors ${
                  theme === option
                    ? 'bg-primary text-on-primary'
                    : 'bg-muted text-foreground hover:bg-accent'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => change(DEFAULT_SCENARIO)}
        className="mt-3 w-full rounded-xl border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
      >
        Reset
      </button>
    </div>
  );
}
