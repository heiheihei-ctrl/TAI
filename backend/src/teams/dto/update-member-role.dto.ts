import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['admin', 'member'] })
  @IsString()
  @IsIn(['admin', 'member'])
  role!: 'admin' | 'member';
}
