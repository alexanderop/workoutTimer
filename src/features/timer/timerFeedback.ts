import type { TimerSettings } from '@/db'

let audioContext: AudioContext | undefined

export function unlockTimerAudio(): void {
  if (!('AudioContext' in globalThis)) return
  audioContext ??= new AudioContext()
  void audioContext.resume()
}

export function emitTimerCue(
  settings: TimerSettings,
  kind: 'countdown' | 'phase' | 'round' | 'complete',
  spokenText?: string,
): void {
  if (settings.hapticsEnabled && 'vibrate' in navigator) {
    navigator.vibrate(kind === 'complete' ? [100, 60, 160] : kind === 'round' ? 60 : 35)
  }

  if (
    kind === 'countdown' &&
    settings.spokenCountdownEnabled &&
    spokenText !== undefined &&
    'speechSynthesis' in window
  ) {
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(spokenText))
  }

  if (!settings.soundEnabled || settings.soundVolume <= 0 || audioContext === undefined) return
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = kind === 'complete' ? 880 : kind === 'phase' ? 660 : 520
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
  gain.gain.exponentialRampToValueAtTime(settings.soundVolume, audioContext.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14)
  oscillator.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start()
  oscillator.stop(audioContext.currentTime + 0.15)
}
