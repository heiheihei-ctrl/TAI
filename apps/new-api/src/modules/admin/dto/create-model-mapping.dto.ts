import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateModelMappingDto {
  @IsString()
  modelId!: string;

  @IsString()
  providerId!: string;

  @IsString()
  channelId!: string;

  @IsString()
  routeKey!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  fallbackOrder?: number;

  @IsOptional()
  @IsObject()
  configJson?: Record<string, unknown>;
}
