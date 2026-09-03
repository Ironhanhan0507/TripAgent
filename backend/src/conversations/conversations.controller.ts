import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ConversationsService } from './conversations.service.js';
import { CreateConversationDto, SendMessageDto } from './dto/conversation.dto.js';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Post()
  create(@Body() dto: CreateConversationDto, @CurrentUser() user: AuthUser) {
    return this.service.create(user.id, dto.title);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getDetail(user.id, id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.service.remove(user.id, id);
    return { success: true };
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.service.addMessage(user.id, id, 'user', dto.content);
    // 简单回声占位：P1 的 Agent 对话走 /agent/plan（SSE）
    return { success: true };
  }
}
