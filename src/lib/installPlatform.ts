export type InstallPlatform = 'ios' | 'android' | 'other'

export interface PlatformSignals {
  userAgent: string
  maxTouchPoints: number
}

const IOS_DEVICE = /iphone|ipod|ipad/i
const ANDROID = /android/i
const MACINTOSH = /macintosh/i

/** Detects which manual PWA installation instructions fit this device. */
export function detectInstallPlatform({
  userAgent,
  maxTouchPoints,
}: PlatformSignals): InstallPlatform {
  if (ANDROID.test(userAgent)) return 'android'
  if (IOS_DEVICE.test(userAgent)) return 'ios'

  // iPadOS 13+ uses a desktop-class Macintosh user agent. Touch support is
  // the signal that separates it from a Mac.
  if (MACINTOSH.test(userAgent) && maxTouchPoints > 1) return 'ios'

  return 'other'
}
