import { ProviderStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class CreateProviderDto {
  @IsString()
  @Matches(/^[a-z0-9_-]+$/)
  providerKey!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsEnum(ProviderStatus)
  status?: ProviderStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
