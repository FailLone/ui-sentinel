/**
 * The neutral default goal of a `ui-scan` run (plan 3.2).
 *
 * It lives in `shared/` because both the contract resolver (server) and the workbench (browser) show
 * it. The contract module itself cannot be imported by the browser - it uses `node:crypto` to hash a
 * snapshot - so this constant is the one piece of its text the client also needs, kept in one place
 * so the two copies cannot drift into two different defaults.
 */
export const UI_DEFAULT_GOAL =
  'Check this page and the UI interactions within the permitted scope, and report grounded problems and unverified scope.'
