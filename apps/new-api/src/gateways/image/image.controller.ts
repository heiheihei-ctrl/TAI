import { Body, Controller, Post } from '@nestjs/common';
import { EditImageDto } from './dto/edit-image.dto';
import { GenerateImageDto } from './dto/generate-image.dto';
import { ImageService } from './image.service';

@Controller('v1/images')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post('generations')
  generate(@Body() dto: GenerateImageDto) {
    return this.imageService.generate(dto);
  }

  @Post('edits')
  edit(@Body() dto: EditImageDto) {
    return this.imageService.edit(dto);
  }
}
