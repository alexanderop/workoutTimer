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
 * One assertion, documented once, instead of one per handler — which is the
 * only reason this module exists rather than each screen doing it inline.
 */

/** The current value of the control an `@input`/`@change` handler fired from. */
export function controlValue(event: Event): string {
  // SAFETY: the handler is bound in a template directly to an <input> or
  // <select>, so `currentTarget` is that element and has a `value`.
  return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value
}

/** The `<input type="file">` an `@change` handler fired from. */
export function fileInputOf(event: Event): HTMLInputElement {
  // SAFETY: as above — the handler is bound to the file input itself.
  return event.currentTarget as HTMLInputElement
}
