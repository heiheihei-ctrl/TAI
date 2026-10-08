import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  initialMessage?: string;
}

export class SendMessageDto {
  @IsOptional()
  @IsIn(['text', 'attachment'])
  type?: 'text' | 'attachment';

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;
}

export class ListConversationsQueryDto {
  @IsOptional()
  @IsIn(['waiting', 'active', 'ended', 'all'])
  status?: 'waiting' | 'active' | 'ended' | 'all';
}

export class RecommendPackageDto {
  @IsString()
  @MinLength(1)
  packageId!: string;
}

export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;
}

export class CreateCollabDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pricePerMinute?: number;
}

export class RespondCollabDto {
  @IsIn(['accepted', 'rejected'])
  action!: 'accepted' | 'rejected';

  @IsOptional()
  @IsString()
  projectId?: string;
}

export class UpsertQuickReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpsertServicePackageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class MarkReadDto {
  @IsOptional()
  @IsObject()
  _?: Record<string, never>;
}
