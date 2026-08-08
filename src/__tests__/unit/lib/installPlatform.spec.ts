import { describe, expect, it } from 'vitest'
import { detectInstallPlatform } from '@/lib/installPlatform'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

describe('detectInstallPlatform', () => {
  it('recognizes iOS browsers', () => {
    expect(detectInstallPlatform({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 })).toBe('ios')
    expect(detectInstallPlatform({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 })).toBe('ios')
  })

  it('recognizes Android', () => {
    expect(detectInstallPlatform({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 })).toBe('android')
  })

  it('distinguishes an iPad desktop user agent from a Mac by touch', () => {
    expect(detectInstallPlatform({ userAgent: MAC_SAFARI, maxTouchPoints: 5 })).toBe('ios')
    expect(detectInstallPlatform({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe('other')
  })

  it('does not treat a single Mac touch point as an iPad', () => {
    expect(detectInstallPlatform({ userAgent: MAC_SAFARI, maxTouchPoints: 1 })).toBe('other')
  })

  it('uses generic instructions for non-mobile browsers', () => {
    expect(detectInstallPlatform({ userAgent: WINDOWS_CHROME, maxTouchPoints: 0 })).toBe('other')
  })

  it('does not treat a touch-screen Windows device as an iPad', () => {
    expect(detectInstallPlatform({ userAgent: WINDOWS_CHROME, maxTouchPoints: 10 })).toBe('other')
  })

  it('treats an empty user agent as unknown', () => {
    expect(detectInstallPlatform({ userAgent: '', maxTouchPoints: 0 })).toBe('other')
  })
})
