import { useMediaQuery } from '@vueuse/core'

/**
 * Coarse-pointer detection. Used to adapt focus/keyboard behavior on touch
 * devices (e.g. not auto-focusing inputs while a sheet is still animating).
 */
export function useTouchDevice() {
  const isTouchDevice = useMediaQuery('(pointer: coarse)')

  return { isTouchDevice }
}
