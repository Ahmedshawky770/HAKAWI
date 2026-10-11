/**
 * Narrows a possibly-absent value to a definitely-present one, or fails loudly.
 *
 * Repository and gateway code legitimately returns `undefined` for "not found", so a
 * test that wants to assert on the found row first has to prove it exists. The
 * postfix `!` shortcut that used to appear in these specs is forbidden by
 * `@typescript-eslint/no-non-null-assertion` because it silences the very check the
 * assertion needs: with `!`, a `undefined` row fails later with a confusing
 * `Cannot read properties of undefined` instead of naming what was missing. This
 * helper keeps the guard, names the missing value in the failure, and gives the
 * caller a non-nullable type so no cast is needed afterwards.
 */
export function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${label} to be defined, but it was ${String(value)}`);
  }
  return value;
}
