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

/**
 * Browser install APIs that are not part of the standard DOM typings.
 * Chromium exposes `beforeinstallprompt`; iOS Safari exposes
 * `navigator.standalone` when launched from the home screen.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
}

interface Navigator {
  readonly standalone?: boolean
}
