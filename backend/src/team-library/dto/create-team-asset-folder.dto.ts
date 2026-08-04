import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTeamAssetFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;
}
