import { Module } from '@nestjs/common';
import { RoutingModule } from '../../modules/routing/routing.module';
import { ImageController } from './image.controller';
import { ImageService } from './image.service';

@Module({
  imports: [RoutingModule],
  controllers: [ImageController],
  providers: [ImageService],
})
export class ImageModule {}
