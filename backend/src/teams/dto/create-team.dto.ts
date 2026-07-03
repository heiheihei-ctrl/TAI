import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ description: '团队名称' })
  @IsString()
  @Length(1, 80)
  name!: string;
}
