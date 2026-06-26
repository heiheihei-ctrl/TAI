import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateExtendedProfileDto {
  @ApiPropertyOptional({ description: '真实姓名' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '真实姓名不能为空' })
  @MaxLength(50, { message: '真实姓名过长' })
  realName?: string;

  @ApiPropertyOptional({ description: '性别', enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsString()
  @IsIn(['male', 'female', 'other'], { message: '性别选项无效' })
  gender?: string;

  @ApiPropertyOptional({ description: '年龄' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '年龄必须是整数' })
  @Min(1, { message: '年龄无效' })
  @Max(120, { message: '年龄无效' })
  age?: number;

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
  @MaxLength(120, { message: '所在地区过长' })
  region?: string;
}
