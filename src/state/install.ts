import { Atom, type AtomRegistry } from '@effect/atom-vue'
import type { InstallPlatform } from '@/lib/installPlatform'
import { localStorageAtom, mediaQueryAtom, notifyLocalStorageChanged } from '@/state/browser'
import { detectInstallPlatform } from '@/lib/installPlatform'

export const INSTALL_HINT_STORAGE_KEY = 'workout-timer.install-hint-dismissed'

const HINT_DELAY_MS = 2000

export const installPlatform: InstallPlatform = detectInstallPlatform({
  userAgent: globalThis.navigator?.userAgent ?? '',
  maxTouchPoints: globalThis.navigator?.maxTouchPoints ?? 0,
})

const launchedFromHomeScreen = globalThis.navigator?.standalone === true

/**
 * The deferred `beforeinstallprompt` event.
 *
 * Held as an opaque value, never proxied: `prompt()` and `userChoice` belong
 * to this single-use event instance, and an atom stores the reference as-is —
 * which is one thing this needed from `shallowRef` and now gets for free.
 *
 * Exported because it is the seam: it is the only input to the eligibility
 * chain a caller can *write*, so it is how the unit tier stands the install
 * banner up (`src/__tests__/unit/state/pwa.spec.ts`) without a browser that
 * would have to be persuaded to fire the event.
 */
export const deferredPromptAtom: Atom.Writable<BeforeInstallPromptEvent | null> =
  Atom.make<BeforeInstallPromptEvent | null>(null).pipe(Atom.keepAlive)

const hintDismissedAtom = localStorageAtom<boolean>({
  key: INSTALL_HINT_STORAGE_KEY,
  defaultValue: false,
  decode: (raw) => raw === 'true',
  encode: (value) => String(value),
})

const displayModeStandaloneAtom = mediaQueryAtom('(display-mode: standalone)')

export const isInstalledAtom = Atom.make(
  (get) => get(displayModeStandaloneAtom) || launchedFromHomeScreen,
)

export const canInstallAtom = Atom.make(
  (get) => get(deferredPromptAtom) !== null || installPlatform === 'ios',
)

export const canPromptDirectlyAtom = Atom.map(deferredPromptAtom, (event) => event !== null)

const isEligibleForHintAtom = Atom.make(
  (get) => get(canInstallAtom) && !get(isInstalledAtom) && !get(hintDismissedAtom),
)

/**
 * The banner, delayed so it does not land on top of a first paint.
 *
 * The timer belongs to the atom, not to a component: becoming ineligible
 * cancels it, and the last unsubscribe clears it, without a watcher whose
 * `flush` mode had to be spelled out to get the ordering right.
 */
export const hintVisibleAtom = Atom.make((get) => {
  let timer: ReturnType<typeof setTimeout> | undefined

  get.subscribe(
    isEligibleForHintAtom,
    (eligible) => {
      clearTimeout(timer)
      if (!eligible) {
        get.setSelf(false)
        return
      }
      timer = setTimeout(() => get.setSelf(true), HINT_DELAY_MS)
    },
    { immediate: true },
  )
  get.addFinalizer(() => clearTimeout(timer))

  return false
}).pipe(Atom.keepAlive)

/**
 * The two window events that feed `deferredPromptAtom`. Subscribed by
 * `PwaInstallPrompt`, which the app shell always renders — so the listeners
 * are up as soon as the app renders.
 */
export const installPromptEffectAtom = Atom.make((get) => {
  const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent): void => {
    event.preventDefault()
    get.set(deferredPromptAtom, event)
  }
  const onAppInstalled = (): void => {
    get.set(deferredPromptAtom, null)
    get.set(hintDismissedAtom, true)
  }

  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
  get.addFinalizer(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.removeEventListener('appinstalled', onAppInstalled)
  })

  return null
}).pipe(Atom.keepAlive)

/**
 * The install dialog's open state, shared by the banner and the settings
 * screen — both open the same dialog, so there is one atom for it rather than
 * a `ref` in each.
 *
 * `requested` is separate because the dialog is an async chunk: `v-if` on it
 * is what keeps that chunk unfetched until someone reaches for it, and a flag
 * that only ever goes true is not the same thing as "is it open now".
 */
export const installDialogOpenAtom = Atom.make(false)

export const installDialogRequestedAtom = Atom.make(false)

/** "Not now" on the banner — the persisted half of dismissing it. */
export const dismissInstallHintAtom = Atom.fnSync((_: void, get) =>
  get.set(hintDismissedAtom, true),
)

/**
 * Fire the browser's own install prompt and report what the user chose.
 *
 * Registry-taking rather than an atom write, because the caller awaits the
 * outcome to decide whether to close its dialog — and `useAtomSet` hands back
 * a setter, not a promise of the result.
 */
export async function promptInstallIn(
  registry: AtomRegistry.AtomRegistry,
): Promise<'accepted' | 'dismissed' | null> {
  const event = registry.get(deferredPromptAtom)
  if (!event) return null

  // The prompt event is single-use. Clear it before awaiting so a double tap
  // cannot invoke it twice.
  registry.set(deferredPromptAtom, null)
  await event.prompt()
  const { outcome } = await event.userChoice

  if (outcome === 'accepted') registry.set(hintDismissedAtom, true)
  return outcome
}

/**
 * Clears the persisted dismissal between browser-tier tests. The event and the
 * banner timer live in the registry, which `renderApp` replaces per mount.
 */
export function resetInstallPromptState(): void {
  window.localStorage.removeItem(INSTALL_HINT_STORAGE_KEY)
  notifyLocalStorageChanged(INSTALL_HINT_STORAGE_KEY)
}
