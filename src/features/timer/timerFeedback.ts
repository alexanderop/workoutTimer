import type { TimerSettings } from '@/db'
import { VOICE_CUES, type VoiceCue } from '@/features/timer/voiceCues'

let audioContext: AudioContext | undefined

const voiceBuffers = new Map<VoiceCue, AudioBuffer>()
let voiceSource: AudioBufferSourceNode | undefined
let voiceRequested = false

/**
 * Fetches and decodes every coach clip once. They are a quarter of a megabyte
 * together and precached by the service worker, so this is cheaper than
 * decoding on demand — a clip that has to be fetched when "Ten seconds" is due
 * arrives after the ten seconds.
 */
function loadVoice(context: AudioContext): void {
  if (voiceRequested || !('fetch' in globalThis)) return
  voiceRequested = true
  for (const cue of VOICE_CUES) {
    void fetch(`${import.meta.env.BASE_URL}voice/${cue}.mp3`)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response)))
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => voiceBuffers.set(cue, buffer))
      // A missing clip is a silent line, not a broken timer.
      .catch(() => undefined)
  }
}

export function unlockTimerAudio(): void {
  if (!('AudioContext' in globalThis)) return
  audioContext ??= new AudioContext()
  void audioContext.resume()
  loadVoice(audioContext)
}

function speak(context: AudioContext, settings: TimerSettings, cue: VoiceCue): void {
  const buffer = voiceBuffers.get(cue)
  if (buffer === undefined) return
  // "Two" must interrupt "Three", not play over it.
  voiceSource?.stop()
  const source = context.createBufferSource()
  const gain = context.createGain()
  source.buffer = buffer
  gain.gain.value = settings.soundVolume > 0 ? settings.soundVolume : 1
  source.connect(gain)
  gain.connect(context.destination)
  source.start()
  voiceSource = source
}

/** `voice` is a spoken line with no beep and no buzz of its own. */
export type TimerCueKind = 'countdown' | 'phase' | 'round' | 'complete' | 'voice'

export function emitTimerCue(settings: TimerSettings, kind: TimerCueKind, voice?: VoiceCue): void {
  if (settings.spokenCountdownEnabled && voice !== undefined && audioContext !== undefined) {
    speak(audioContext, settings, voice)
  }
  if (kind === 'voice') return

  if (settings.hapticsEnabled && 'vibrate' in navigator) {
    navigator.vibrate(kind === 'complete' ? [100, 60, 160] : kind === 'round' ? 60 : 35)
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
