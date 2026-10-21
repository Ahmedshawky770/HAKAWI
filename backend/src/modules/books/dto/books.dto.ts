import {
  IsString,
  IsOptional,
  IsUUID,
  IsIn,
  MaxLength,
  MinLength,
  IsBoolean,
  IsInt,
  Min,
  Max,
  Matches,
  IsNumber,
  ValidateIf,
  Min as MinNumber,
} from 'class-validator';

import {
  PAYMOB_PAYMENT_METHOD_CHOICES,
  type PaymobPaymentMethodChoice,
} from '../../../config/paymob.config.ts';

export class CreateBookDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title: string;

  @IsString()
  @MinLength(1, { message: 'Author is required' })
  @MaxLength(255, { message: 'Author must not exceed 255 characters' })
  author: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Description must not exceed 5000 characters' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'ISBN must not exceed 20 characters' })
  @Matches(/^(?:\d{10}|\d{13})$/, { message: 'ISBN must be 10 or 13 digits' })
  isbn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Publisher must not exceed 255 characters' })
  publisher?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Language must not exceed 50 characters' })
  language?: string;

  @IsOptional()
  @IsInt()
  @MinNumber(1)
  pageCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'File URL must not exceed 500 characters' })
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'File type must not exceed 50 characters' })
  fileType?: string;

  @IsOptional()
  @IsNumber()
  @MinNumber(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;
}

export class UpdateBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Author must not exceed 255 characters' })
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Description must not exceed 5000 characters' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'ISBN must not exceed 20 characters' })
  isbn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Publisher must not exceed 255 characters' })
  publisher?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Language must not exceed 50 characters' })
  language?: string;

  @IsOptional()
  @IsInt()
  @MinNumber(1)
  pageCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'File URL must not exceed 500 characters' })
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'File type must not exceed 50 characters' })
  fileType?: string;

  @IsOptional()
  @IsNumber()
  @MinNumber(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsIn(['draft', 'published', 'archived'], { message: 'Status must be draft, published, or archived' })
  status?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;
}

export class BooksQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsIn(['draft', 'published', 'archived'], { message: 'Status must be draft, published, or archived' })
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * THE READER'S CHOICE OF INSTRUMENT, DECLARED ONCE.
 *
 * `@ValidateIf` rather than `@IsOptional`, and the difference matters:
 * `@IsOptional` skips the check when the value is `null` OR `undefined`, so a
 * body that says `{"paymentMethod": null}` passed validation and reached the
 * service, where `null` is not a choice and not the absence of one either —
 * it was stored as `null` in the payment's metadata, which is neither the word
 * the reader chose nor the absence of a choice. `@ValidateIf` skips the check
 * only when the value is `undefined`, so `null` is a 400 and the stored value
 * is either one of the two words or nothing at all.
 *
 * THE POLARITY: a `@ValidateIf` condition that is TRUE means "VALIDATE THIS".
 */
function validatePaymentMethod(_object: unknown, value: unknown): boolean {
  return value !== undefined;
}

export class PurchaseBookDto {
  /**
   * THE READER'S CHOICE OF INSTRUMENT — NOT A GATEWAY IDENTIFIER.
   *
   * This field used to be `paymentMethodId?: string`: a free-form string the caller was supposed to
   * already know, up to 255 characters of anything. It was stored in the payment's metadata and
   * nothing else — the gateway was never told, so the Paymob frame asked the customer for an
   * instrument anyway and the reader's answer was opaque metadata. The field is now the CHOICE
   * itself, "card" or "wallet", which the server resolves to this merchant's Paymob method id.
   *
   * The old field is GONE, after the release it was deprecated in. A client that still sends it is
   * answered with a 400 that says what to send instead — see `paymentMethodIdRemovedMessage` in
   * the global validation pipe.
   *
   * The two words come from the same list the resolver uses, so the vocabulary the API accepts and
   * the vocabulary the server understands cannot drift apart. Anything else is a 400 rather than a
   * request that quietly does nothing.
   */
  @ValidateIf(validatePaymentMethod)
  @IsIn(PAYMOB_PAYMENT_METHOD_CHOICES, {
    message: `Payment method must be one of: ${PAYMOB_PAYMENT_METHOD_CHOICES.join(', ')}`,
  })
  paymentMethod?: PaymobPaymentMethodChoice;

}

export class RentBookDto {
  @IsInt()
  @IsIn([1, 3, 7, 14, 30, 90], { message: 'Duration must be one of: 1, 3, 7, 14, 30, 90 days' })
  durationDays: number;

  /**
   * THE READER'S CHOICE OF INSTRUMENT — NOT A GATEWAY IDENTIFIER.
   *
   * The same field the purchase takes, and for the same reason: the panel asks
   * the reader which instrument they are using, and a rental that silently
   * dropped the answer would be a question the product asked and then ignored.
   * The server resolves the choice to this merchant's Paymob method id, and a
   * deployment that has configured none is told nothing — which is Paymob's own
   * "let the customer choose" case.
   */
  @ValidateIf(validatePaymentMethod)
  @IsIn(PAYMOB_PAYMENT_METHOD_CHOICES, {
    message: `Payment method must be one of: ${PAYMOB_PAYMENT_METHOD_CHOICES.join(', ')}`,
  })
  paymentMethod?: PaymobPaymentMethodChoice;

}
