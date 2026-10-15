import { stringsFor } from "../src/lib/i18n";
import { DEFAULT_LOCALE } from "../src/lib/preferences";

/**
 * Arabic UI copy, read from the app's own dictionary.
 *
 * WHY: the dictionary is the single source of truth for what the reader sees,
 * and the e2e specs used to retype the Arabic literals by hand. A literal
 * copied out of the dictionary matches the UI only until somebody edits the
 * dictionary entry, and then a spec fails on copy nobody touched in the spec.
 * Deriving the selectors from `stringsFor(DEFAULT_LOCALE)` binds them to the
 * same constants the app renders, so a dictionary edit moves the UI and the
 * selector together and only a genuine UI regression can fail a spec.
 *
 * WHY RELATIVE IMPORTS: Playwright compiles these specs with its own transform,
 * which does not resolve the `@/*` tsconfig path alias at runtime, so the
 * imports go through `../src` as plain relative paths any resolver understands.
 *
 * Copy the dictionary has no key for (the home-page heading, the backend's
 * error text) stays a literal in the specs, commented as undictionaried —
 * deriving something the dictionary cannot provide would be a lie.
 */
export const copy = stringsFor(DEFAULT_LOCALE);
