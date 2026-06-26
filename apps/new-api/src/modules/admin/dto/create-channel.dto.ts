import { ChannelStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
} from 'class-validator';

export class CreateChannelDto {
  @IsString()
  providerId!: string;

  @IsString()
  @Matches(/^[a-z0-9_-]+$/)
  channelKey!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsEnum(ChannelStatus)
  status?: ChannelStatus;

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @IsString()
  @IsNotEmpty()
  credentialType!: string;

  @IsOptional()
  @IsString()
  credentialsEncrypted?: string;

  @IsOptional()
  @IsObject()
  credentialsJson?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitQps?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  timeoutMs?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
