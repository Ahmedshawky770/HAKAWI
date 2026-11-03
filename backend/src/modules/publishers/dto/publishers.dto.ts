import { IsString, MinLength, MaxLength, IsOptional, IsEmail, IsUrl, IsIn, IsInt, Min, Max, IsBoolean } from 'class-validator';

export class CreatePublisherApplicationDto {
  @IsString()
  @MinLength(2, { message: 'Company name must be at least 2 characters' })
  @MaxLength(255, { message: 'Company name must not exceed 255 characters' })
  companyName: string;

  @IsOptional()
  @IsUrl({}, { message: 'Invalid website URL' })
  @MaxLength(500, { message: 'Website URL must not exceed 500 characters' })
  companyWebsite?: string;

  @IsOptional()
  @IsString()
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Tax ID must not exceed 100 characters' })
  taxId?: string;

  @IsString()
  @MinLength(2, { message: 'Contact name must be at least 2 characters' })
  @MaxLength(255, { message: 'Contact name must not exceed 255 characters' })
  contactName: string;

  @IsEmail({}, { message: 'Invalid contact email format' })
  @MaxLength(255, { message: 'Contact email must not exceed 255 characters' })
  contactEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Contact phone must not exceed 32 characters' })
  contactPhone?: string;

  @IsString()
  @MinLength(50, { message: 'Description must be at least 50 characters' })
  description: string;

  @IsOptional() @IsString() registrantName?: string;
  @IsOptional() @IsString() registrantPhone?: string;
  @IsOptional() @IsString() registrantRole?: string;
  @IsOptional() @IsString() tradingName?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() socialLinks?: string;
  @IsOptional() @IsString() crIssuer?: string;
  @IsOptional() crExpiry?: Date;
  @IsOptional() @IsString() activityType?: string;
  @IsOptional() vatRegistered?: boolean;
  @IsOptional() @IsString() isbnPrefix?: string;
  @IsOptional() @IsString() legalRepName?: string;
  @IsOptional() @IsString() legalRepNationalId?: string;
  @IsOptional() @IsString() legalRepTitle?: string;
  @IsOptional() @IsString() legalRepPhone?: string;
  @IsOptional() @IsString() @IsEmail() officialEmail?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() @IsEmail() supportEmail?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() publishingFields?: string;
  @IsOptional() @IsInt() foundedYear?: number;
  @IsOptional() @IsInt() titleCount?: number;
  @IsOptional() @IsString() crImageUrl?: string;
  @IsOptional() @IsString() taxCardImageUrl?: string;
  @IsOptional() @IsString() idCardFrontUrl?: string;
  @IsOptional() @IsString() idCardBackUrl?: string;
  @IsOptional() @IsString() authorizationLetterUrl?: string;
  @IsOptional() @IsString() delegateIdCardUrl?: string;
  @IsOptional() @IsString() depositCertificateUrl?: string;
  @IsOptional() @IsString() bankAccountName?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() iban?: string;
  @IsOptional() @IsString() swiftCode?: string;
  @IsOptional() @IsBoolean() termsAccepted?: boolean;
  @IsOptional() @IsBoolean() privacyAccepted?: boolean;
  @IsOptional() @IsBoolean() dataAccuracyAccepted?: boolean;
  @IsOptional() @IsBoolean() copyrightAccepted?: boolean;
}

export class ReviewPublisherApplicationDto {
  @IsString()
  @IsIn(['approved', 'rejected'], { message: 'Status must be approved or rejected' })
  status: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class CreatePublisherWriterDto {
  @IsString()
  writerId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePublisherWriterDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'suspended', 'terminated'], { message: 'Invalid status' })
  status?: 'active' | 'suspended' | 'terminated';

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class PublisherApplicationResponseDto {
  id: string;
  userId: string;
  companyName: string;
  companyWebsite: string | null;
  companyAddress: string | null;
  taxId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  description: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PublisherWriterResponseDto {
  id: string;
  publisherId: string;
  writerId: string;
  commissionRate: number;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}