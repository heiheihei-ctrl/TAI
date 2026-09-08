import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyOrJwtGuard } from '../../auth/guards/api-key-or-jwt.guard';
import { PptOutlineDto } from './ppt-outline.dto';
import { PptOutlineService } from './ppt-outline.service';

@UseGuards(ApiKeyOrJwtGuard)
@Controller('ai/ppt')
export class PptOutlineController {
  constructor(private readonly pptOutline: PptOutlineService) {}

  @Post('outline')
  async generateOutline(@Body() dto: PptOutlineDto) {
    const prompt = String(dto.prompt || '').trim();
    if (!prompt) {
      throw new HttpException(
        { message: 'prompt 不能为空' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.pptOutline.generateOutline(prompt);
  }
}
