/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />
/// <reference types="vite-plugin-pwa/info" />

interface ImportMetaEnv {
  /**
   * OTLP base URL for development telemetry export — see
   * `src/lib/observability.ts` and `.env.example`. Unset means no export.
   * Declared rather than left to Vite's index signature so a typo is a
   * compile error instead of silently-undefined telemetry.
   */
  readonly VITE_OTLP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
