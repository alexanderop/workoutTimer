import { Schema } from 'effect'

const isMessage = Schema.is(Schema.String)

/** A node the walk can descend into: an object, not a leaf and not an array. */
const isBranch = (node: Schema.Json | undefined): node is Schema.JsonObject =>
  node instanceof Object && !Array.isArray(node)

/**
 * The message a dotted key names in the real English catalogue.
 *
 * Specs that assert on user-visible strings walk `@/i18n/messages/en` rather
 * than take a stub, because a stub answers for a key whether or not the
 * catalogue has one — and a `labelKey` with no message renders an empty string
 * in the app while the test passes. Walking the real thing is what makes a
 * missing key a failing test.
 *
 * The catalogue is JSON and a dotted key is a path through it, which is a
 * lookup no object type can describe: `en` knows nothing about the string
 * `'nav.timer'`. So the walk is typed as JSON, and the schema at the end is
 * what says the value found is a message.
 */
export function messageAt(catalogue: Schema.Json, key: string): string {
  const found = key
    .split('.')
    .reduce<
      Schema.Json | undefined
    >((node, segment) => (isBranch(node) ? node[segment] : undefined), catalogue)

  if (!isMessage(found)) throw new Error(`no message at ${key}`)

  return found
}
