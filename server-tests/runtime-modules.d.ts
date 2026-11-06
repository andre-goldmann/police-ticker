/**
 * Ambient declarations for the ESM-only SSR packages imported by src/server.ts.
 * They only provide compile-time types for the server test build; at runtime the
 * real packages are loaded inside the test process (Node's require(esm) support).
 */
declare module '@angular/ssr' {
  export class AngularAppEngine {
    handle(request: Request, context?: unknown): Promise<Response | null>;
  }
  export function createRequestHandler(
    handler: (request: Request) => Promise<Response>,
  ): (request: Request) => Promise<Response>;
  export function ɵsetAngularAppEngineManifest(manifest: {
    readonly entryPoints: Readonly<Record<string, (() => Promise<unknown>) | undefined>>;
    readonly basePath: string;
    readonly supportedLocales: Readonly<Record<string, string | undefined>>;
  }): void;
}

declare module '@netlify/angular-runtime/app-engine.js' {
  export function getContext(): unknown;
}
