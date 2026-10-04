/**
 * Copy the authentication pages share.
 *
 * WHY THE PASSWORD RULE LIVES HERE AND NOT IN A PAGE. The hint under the
 * password fields is a claim about the BACKEND, and the backend is what enforces
 * it: `RegisterDto.password` and `ResetPasswordDto.password` both declare
 * `@MinLength(8)` followed by
 * `@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)`
 * (`backend/src/modules/auth/dto/auth.dto.ts:8-13` and `:98-102`). So the hint
 * states the whole rule rather than the easy half of it — telling a reader only
 * "8 characters" gets the account rejected for a rule the form never mentioned.
 *
 * It is deliberately NOT shown on the login field: nothing is validated on the
 * way in, and a reader who already has a password does not need the policy.
 */
export const PASSWORD_HINT = "٨ أحرف على الأقل، مع حرف كبير وحرف صغير ورقم ورمز";