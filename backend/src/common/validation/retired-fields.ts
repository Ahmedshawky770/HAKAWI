import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * THE FIELDS THIS API HAS RETIRED, AND THE WORDS IT ANSWERS WITH.
 *
 * A field that is REMOVED is answered with a 400, because the global validation pipe has
 * `forbidNonWhitelisted` and an unknown property is a malformed body. That is the right
 * default for a field this API never published — and the wrong one for a field it DID
 * publish and has now retired: the reader of the error would be told "property
 * paymentMethodId should not exist", which is a fact about the request and tells them
 * nothing about what to send instead.
 *
 * So the retired fields are NAMED here, and a body that carries one is answered with a
 * sentence that says what replaced it.
 *
 * WHY THE FIELD IS BEING RETIRED. `paymentMethodId` was a free-form string the CLIENT
 * was supposed to already know — up to 255 characters of anything, stored in the
 * payment's metadata and never told to the gateway. It was replaced by `paymentMethod`,
 * which is the reader's CHOICE: "card" or "wallet", resolved by the server to this
 * merchant's own Paymob method id. The old name was accepted and ignored for one
 * release, so that a client that had not been redeployed yet would keep working; the
 * release has passed, and the field is gone.
 */
export const RETIRED_BODY_FIELDS: Readonly<Record<string, string>> = {
  paymentMethodId:
    'paymentMethodId was removed. Send "paymentMethod" with one of: card, wallet — the server resolves it to this merchant\'s Paymob method id.',
};

/**
 * Nest's own flattening, reproduced.
 *
 * The pipe's default factory flattens the validation errors into a flat list of
 * MESSAGES — `['email must be an email']` — and not a list of error objects. The
 * flattening is a protected method on `ValidationPipe` rather than an export, so it
 * is reproduced here: a factory that reported a different shape for the same failure
 * would change the response every client reads, which is a far worse outcome than
 * the one this file exists to prevent.
 */
const flattenValidationErrors = (errors: ValidationError[]): string[] => {
  // The children are walked too: a validator on a nested object reports its failure
  // on the child, not on the parent, and the parent's own constraints are empty.
  const collected: ValidationError[] = [];
  const walk = (list: ValidationError[]): void => {
    for (const error of list) {
      collected.push(error);
      if (error.children && error.children.length > 0) walk(error.children);
    }
  };
  walk(errors);

  return collected
    .filter((error) => !!error.constraints)
    .flatMap((error) => Object.values(error.constraints as Record<string, string>));
};

/**
 * The validation pipe's own failure, with the retired fields named.
 *
 * EVERY other validation failure is reported exactly as the pipe reports it: the same
 * messages, in the same shape, for the same reasons. Only a failure that names a
 * retired field is rewritten, and it is rewritten in the `message` array the pipe
 * already produces — so the response shape does not change, and a client that reads
 * `message[0]` reads a sentence instead of a field name.
 */
export const validationExceptionFactory = (errors: ValidationError[]): BadRequestException => {
  const retired = errors.find((error) => error.property in RETIRED_BODY_FIELDS && error.constraints?.whitelistValidation);

  if (!retired) {
    return new BadRequestException(flattenValidationErrors(errors));
  }

  return new BadRequestException({
    message: RETIRED_BODY_FIELDS[retired.property],
    error: 'Bad Request',
    statusCode: 400,
  });
};
