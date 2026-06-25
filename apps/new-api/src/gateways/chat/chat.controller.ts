import { Body, Controller, Post } from '@nestjs/common';
import { ChatCompletionsDto } from './dto/chat-completions.dto';
import { ChatService } from './chat.service';

@Controller('v1/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('completions')
  completions(@Body() dto: ChatCompletionsDto) {
    return this.chatService.completions(dto);
  }
}
