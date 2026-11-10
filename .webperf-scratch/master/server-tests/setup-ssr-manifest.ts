/**
 * Runs before src/server.ts is imported: the module under test constructs an
 * `AngularAppEngine` at import time, which requires a manifest that is normally
 * injected by the Angular build. A minimal stub keeps the handler tests runnable
 * in plain Node (the Angular rendering path is never exercised by them).
 */
import '@angular/compiler';

import { ɵsetAngularAppEngineManifest } from '@angular/ssr';

ɵsetAngularAppEngineManifest({
  entryPoints: {},
  basePath: '/',
  supportedLocales: {},
});
