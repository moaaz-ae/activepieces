import './polyfills';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import './i18n';
import { App } from './app/app';
import { acquisitionUtils } from './lib/acquisition-utils';
import { errorReporting } from './lib/error-reporting';
import { reloadOnceForStaleChunk } from './lib/lazy-with-retry';

acquisitionUtils.stashAcquisitionParams();

window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunk('vite-preload')) {
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  if (errorReporting.isChunkLoadError(event.error ?? event.message)) {
    if (reloadOnceForStaleChunk('window-chunk')) {
      return;
    }
  }
  errorReporting.report({
    error: event.error ?? event.message,
    source: 'window-error',
  });
});

window.addEventListener('unhandledrejection', (event) => {
  if (errorReporting.isChunkLoadError(event.reason)) {
    if (reloadOnceForStaleChunk('window-chunk')) {
      return;
    }
  }
  errorReporting.report({ error: event.reason, source: 'unhandled-rejection' });
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

function render() {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

/*
 * The fixture harness has to be installed before the first request leaves, so
 * the render waits on it.
 *
 * Imported here rather than at the top of the file, behind a condition made of
 * two values Vite replaces at build time. That is what actually keeps the
 * fixture world out of a production bundle: a static import plus a runtime
 * check left the dynamic imports inside `installHarness` reachable, and an
 * ordinary `vite build` emitted the fixture chunks — measured, four of them.
 * With the condition statically false the import is unreachable and nothing is
 * emitted.
 */
if (import.meta.env.DEV || import.meta.env.VITE_HARNESS === '1') {
  import('./harness/install')
    .then(({ installHarness }) => installHarness())
    .then(render)
    .catch(render);
} else {
  render();
}
