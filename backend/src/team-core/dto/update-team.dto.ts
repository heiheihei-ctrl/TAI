import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  logoUrl?: string | null;
}
