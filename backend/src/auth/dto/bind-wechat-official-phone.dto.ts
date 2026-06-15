import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class BindWechatOfficialPhoneDto {
  @ApiProperty({ description: '手机号' })
  @IsString({ message: '手机号必须是字符串' })
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确，请输入有效的11位手机号' })
  phone!: string;

  @ApiProperty({ description: '短信验证码' })
  @IsString({ message: '验证码必须是字符串' })
  @MaxLength(32, { message: '验证码过长' })
  code!: string;

  @ApiPropertyOptional({ description: '邀请码（选填）' })
  @IsOptional()
  @IsString({ message: '邀请码必须是字符串' })
  @MaxLength(64, { message: '邀请码过长' })
  inviteCode?: string;
}
