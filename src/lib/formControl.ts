/**
 * Reading a form control from the event it fired.
 *
 * `Event.target` and `Event.currentTarget` are both typed `EventTarget | null`
 * because an event can be dispatched at anything — a document, a worker, an
 * `AbortSignal`. A handler bound in a template is not that general: it is
 * written on the control itself, so the element the event is being dispatched
 * on is that control and nothing else. `currentTarget` is what says so
 * (`target` is wherever the event started, which for a wrapped control can be
 * a child), and it is the one this module reads.
 *
 * The check is an `instanceof` rather than an assertion: a handler bound to
 * something that is not a form control is a template bug, and throwing says
 * so where reading `.value` off it would quietly yield `undefined` and save a
 * blank preference.
 */

/** The `<input type="file">` an `@change` handler fired from. */
export function fileInputOf(event: Event): HTMLInputElement {
  const control = event.currentTarget
  if (control instanceof HTMLInputElement) return control

  throw new TypeError('expected the handler to be bound to an <input>')
}

/** The current value of the control an `@input`/`@change` handler fired from. */
export function controlValue(event: Event): string {
  const control = event.currentTarget
  if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
    return control.value
  }

  throw new TypeError('expected the handler to be bound to an <input> or <select>')
}
