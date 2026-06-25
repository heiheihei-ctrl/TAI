import { Module } from '@nestjs/common';
import { RoutingModule } from '../../modules/routing/routing.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [RoutingModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
