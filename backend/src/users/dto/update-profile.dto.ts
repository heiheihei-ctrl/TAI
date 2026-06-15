import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '用户名', minLength: 1, maxLength: 50 })
  @IsOptional()
  @IsString({ message: '用户名必须是字符串' })
  @Length(1, 50, { message: '用户名长度必须在1到50位之间' })
  @Matches(/\S/, { message: '用户名不能为空' })
  name?: string;

  @ApiPropertyOptional({ description: '头像 URL', maxLength: 2048, nullable: true })
  @IsOptional()
  @IsString({ message: '头像地址必须是字符串' })
  @MaxLength(2048, { message: '头像地址过长' })
  avatarUrl?: string | null;
}
