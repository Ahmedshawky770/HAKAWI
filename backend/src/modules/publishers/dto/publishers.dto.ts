import { IsString, MinLength, MaxLength, IsOptional, IsEmail, IsUrl, IsIn, IsInt, Min, Max } from 'class-validator';

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