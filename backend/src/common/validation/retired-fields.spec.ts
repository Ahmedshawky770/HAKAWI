import { describe, it, expect } from 'vitest';
import { ValidationError } from '@nestjs/common';

import { RETIRED_BODY_FIELDS, validationExceptionFactory } from './retired-fields.ts';

/**
 * A RETIRED FIELD IS ANSWERED WITH WHAT TO SEND INSTEAD.
 *
 * The global validation pipe has `forbidNonWhitelisted`, so a body carrying a property
 * the DTO does not declare is a 400. That is right for a field this API never published
 * and wrong for a field it DID publish and has now retired: "property paymentMethodId
 * should not exist" is a fact about the request, and says nothing about what the client
 * should send.
 */
describe('the retired-field validation failure', () => {
  const whitelistError = (property: string): ValidationError =>
    ({
      property,
      constraints: { whitelistValidation: `property ${property} should not exist` },
    }) as unknown as ValidationError;

  it('names the retired field and what replaced it', () => {
    const response = validationExceptionFactory([whitelistError('paymentMethodId')]).getResponse() as {
      message: string;
      statusCode: number;
    };

    expect(response.statusCode).toBe(400);
    expect(response.message).toContain('paymentMethod');
    expect(response.message).toContain('card');
    expect(response.message).toContain('wallet');
    // Not the pipe's own wording: that is what the reader is being spared.
    expect(response.message).not.toContain('should not exist');
  });

  it('reports every other validation failure exactly as the pipe reports it', () => {
    const errors = [
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
      } as unknown as ValidationError,
    ];

    const response = validationExceptionFactory(errors).getResponse() as { message: string[] };

    expect(response.message).toEqual(['email must be an email']);
  });

  it('knows which fields are retired', () => {
    expect(Object.keys(RETIRED_BODY_FIELDS)).toContain('paymentMethodId');
  });
});
