import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWechatOfficialSessionDto {
  @ApiPropertyOptional({ description: '登录成功后跳转的站内相对路径，例如 /app' })
  @IsOptional()
  @IsString({ message: 'returnTo 必须是字符串' })
  @MaxLength(512, { message: 'returnTo 过长' })
  returnTo?: string;
}
