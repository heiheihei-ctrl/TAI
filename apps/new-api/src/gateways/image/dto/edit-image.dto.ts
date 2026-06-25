import { IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class EditImageDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/)
  model!: string;

  @IsString()
  prompt!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
