import { Injectable } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { RoutingService } from '../../modules/routing/routing.service';
import { EditImageDto } from './dto/edit-image.dto';
import { GenerateImageDto } from './dto/generate-image.dto';

@Injectable()
export class ImageService {
  constructor(private readonly routingService: RoutingService) {}

  async generate(dto: GenerateImageDto) {
    const route = await this.routingService.resolveRoute(dto.model, TaskType.image);
    const adapter = this.routingService.getAdapter(route.providerKey);
    return adapter.generateImage(route, {
      prompt: dto.prompt,
      size: dto.size,
      metadata: dto.metadata,
    });
  }

  async edit(dto: EditImageDto) {
    const route = await this.routingService.resolveRoute(dto.model, TaskType.image);
    const adapter = this.routingService.getAdapter(route.providerKey);
    return adapter.editImage(route, {
      prompt: dto.prompt,
      imageUrl: dto.imageUrl,
      metadata: dto.metadata,
    });
  }
}
