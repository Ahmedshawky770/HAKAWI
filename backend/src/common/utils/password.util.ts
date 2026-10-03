import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/**
 * Rejects a password that is empty or only whitespace.
 *
 * NOT defence against the API: `RegisterDto` and `ResetPasswordDto` both declare
 * `@MinLength(8)`, and class-validator runs before this is called, so an empty password cannot
 * reach here through a request today.
 *
 * It is defence against the NEXT caller. bcrypt accepts an empty string and happily produces
 * a valid hash for it, so `hash('')` returns a real-looking `$2b$12$…` value and the account
 * is signable by anyone who submits an empty string. A hashing primitive that will happily
 * hash nothing is a footgun, and the cost of the guard is one comparison — cheaper than
 * discovering the problem from a support ticket about an account nobody can log into.
 */
function assertHashable(plain: string): void {
  if (typeof plain !== 'string' || plain.trim().length === 0) {
    throw new Error('Password must not be empty or whitespace-only');
  }
}

@Injectable()
export class PasswordHasher {
  private readonly rounds = 12;

  async hash(plain: string): Promise<string> {
    assertHashable(plain);
    return bcrypt.hash(plain, this.rounds);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    if (typeof plain !== 'string' || plain.trim().length === 0 || typeof hash !== 'string' || hash.length === 0) {
      return false;
    }
    return bcrypt.compare(plain, hash);
  }
}
