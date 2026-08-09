import { useI18n } from 'vue-i18n'
import { configSummary, humanizeSeconds, modeDescription, modeName, type Translate } from './labels'
import type { TimerConfig, TimerMode } from '@/db'

interface TimerLabels {
  readonly modeName: (mode: TimerMode) => string
  readonly modeDescription: (mode: TimerMode) => string
  readonly configSummary: (config: TimerConfig) => string
  readonly humanizeSeconds: (seconds: number) => string
}

/**
 * `labels.ts` with the translator already bound. The split is what keeps the
 * label rules unit-testable: the pure functions take a `translate`, this hands
 * them the real one, and a component gets to write `modeName(mode)`.
 */
export function useTimerLabels(): TimerLabels {
  const { t } = useI18n()
  const translate: Translate = (key, named) => (named === undefined ? t(key) : t(key, named))

  return {
    modeName: (mode) => modeName(mode, translate),
    modeDescription: (mode) => modeDescription(mode, translate),
    configSummary: (config) => configSummary(config, translate),
    humanizeSeconds: (seconds) => humanizeSeconds(seconds, translate),
  }
}
