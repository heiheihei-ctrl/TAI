import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsIn,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTeamAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  ossKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  mime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  thumbnail?: string;

  @IsOptional()
  @IsIn(['2d', '3d', 'svg', 'video'])
  assetType?: string;

  @IsOptional()
  @IsString()
  folderId?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
