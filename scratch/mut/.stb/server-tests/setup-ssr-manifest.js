"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Runs before src/server.ts is imported: the module under test constructs an
 * `AngularAppEngine` at import time, which requires a manifest that is normally
 * injected by the Angular build. A minimal stub keeps the handler tests runnable
 * in plain Node (the Angular rendering path is never exercised by them).
 */
require("@angular/compiler");
const ssr_1 = require("@angular/ssr");
(0, ssr_1.ɵsetAngularAppEngineManifest)({
    entryPoints: {},
    basePath: '/',
    supportedLocales: {},
});
