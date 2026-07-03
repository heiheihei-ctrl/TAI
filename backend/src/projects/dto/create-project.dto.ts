import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length, IsUUID } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @ApiProperty({ required: false, description: '团队项目所属 teamId' })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

