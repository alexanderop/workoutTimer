// jsdom tier setup. Deliberately minimal — the polyfills a real jsdom suite
// accumulates are themselves part of what these specs are documenting, so any
// stub added here has to earn its place with a comment saying what broke.
import 'fake-indexeddb/auto'
