import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateExtendedProfileDto {
  @ApiPropertyOptional({ description: '姓名' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '姓名不能为空' })
  @MaxLength(50, { message: '姓名过长' })
  realName?: string;

  @ApiPropertyOptional({ description: '昵称' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '昵称不能为空' })
  @MaxLength(50, { message: '昵称过长' })
  nickname?: string;

  @ApiPropertyOptional({ description: '性别', enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsString()
  @IsIn(['male', 'female', 'other'], { message: '性别选项无效' })
  gender?: string;

  @ApiPropertyOptional({ description: '生日', example: '1990-01-01' })
  @IsOptional()
  @IsDateString({}, { message: '生日格式无效' })
  birthday?: string;

  @ApiPropertyOptional({ description: '邮箱' })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式无效' })
  @MaxLength(120, { message: '邮箱过长' })
  email?: string;

  @ApiPropertyOptional({ description: '职业' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '职业不能为空' })
  @MaxLength(80, { message: '职业过长' })
  occupation?: string;

  @ApiPropertyOptional({ description: '公司' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '公司不能为空' })
  @MaxLength(120, { message: '公司名称过长' })
  company?: string;

  @ApiPropertyOptional({ description: '所在地区' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '所在地区不能为空' })
  @MaxLength(150, { message: '所在地区过长' })
  region?: string;
}
