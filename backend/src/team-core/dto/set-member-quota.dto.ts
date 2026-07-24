import { IsInt, IsOptional, Min } from 'class-validator';

export class SetMemberQuotaDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  monthly?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  total?: number | null;
}