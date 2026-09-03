import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AppError, ErrorCodes } from '../common/errors.js';

// 会话 CRUD：每个会话归属用户，消息按时间升序返回。
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, title?: string) {
    return this.prisma.conversation.create({
      data: { userId, title: title?.trim() || '新对话' },
    });
  }

  async list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
  }

  async getDetail(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) {
      throw new AppError(ErrorCodes.NOT_FOUND, '会话不存在', 404);
    }
    return conversation;
  }

  async remove(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new AppError(ErrorCodes.NOT_FOUND, '会话不存在', 404);
    }
    await this.prisma.conversation.delete({ where: { id: conversationId } });
  }

  async addMessage(
    userId: string,
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    kind = 'text',
    payload?: unknown,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new AppError(ErrorCodes.NOT_FOUND, '会话不存在', 404);
    }
    await this.prisma.message.create({
      data: {
        conversationId,
        role,
        kind,
        content,
        payload: payload ? (payload as object) : undefined,
      },
    });
    // 触碰 updatedAt，让会话列表按最近活跃排序
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {},
    });
  }
}
