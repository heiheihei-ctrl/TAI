import { IsBoolean } from 'class-validator';

export class UpdateMappingEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
