import type { Request } from 'express';

import type { JwtPayload } from '../utils/jwt.util.ts';

/**
 * The request shape for a route that ACCEPTS a credential but does not require one.
 *
 * WHY A SECOND INTERFACE RATHER THAN `user?: JwtPayload` ON `AuthRequest`. `AuthRequest.user` is
 * required on purpose: on a `@Secured()` route the identity is a precondition of the handler, and
 * making it optional would push an `undefined` check into every protected handler in the codebase
 * to accommodate the two public routes that may legitimately run with no identity. That is a
 * weakening of the type exactly where it is least wanted, traded for a convenience in the one place
 * it does not apply. Two interfaces make the distinction explicit at the handler signature, which is
 * the layer that owns it (Principle #8: the optional case is a different shape, not a looser one).
 *
 * `JwtPayload` is imported from `jwt.util.ts`, which is the same type `JwtAuthGuard` assigns, so a
 * subject established here is indistinguishable from one established there.
 */
export interface OptionalAuthRequest extends Request {
  user?: JwtPayload;
}
