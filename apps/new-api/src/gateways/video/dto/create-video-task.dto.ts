import { IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class CreateVideoTaskDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/)
  model!: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
