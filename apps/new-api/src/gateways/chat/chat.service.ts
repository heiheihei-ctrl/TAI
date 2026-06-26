import { Injectable } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { RoutingService } from '../../modules/routing/routing.service';
import { ChatCompletionsDto } from './dto/chat-completions.dto';

@Injectable()
export class ChatService {
  constructor(private readonly routingService: RoutingService) {}

  async completions(dto: ChatCompletionsDto) {
    const route = await this.routingService.resolveRoute(dto.model, TaskType.chat);
    const adapter = this.routingService.getAdapter(route.providerKey);
    return adapter.chatCompletions(route, {
      messages: dto.messages,
      metadata: dto.metadata,
    });
  }
}
