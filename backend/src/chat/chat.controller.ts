import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.service.js';
import { AgentOrchestrator } from '../agent/orchestrator.service.js';
import { AgentEvent } from '../agent/events/agent-event.js';
import { AppError, ErrorCodes } from '../common/errors.js';
import { AgentPlanDto } from './dto/agent-plan.dto.js';
import { ReplanItineraryDto } from '../itineraries/dto/itinerary.dto.js';
import type { Itinerary } from '../planner/types/itinerary.js';
import type { TravelRequirement } from '../agent/types/travel-requirement.js';
import type { Response } from 'express';

// P1：Agent 对话入口。POST + SSE（服务端按 text/event-stream 输出，前端用 fetch 流解析）。
@Controller('agent')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly orchestrator: AgentOrchestrator) {}

  @Post('plan')
  async plan(
    @Body() dto: AgentPlanDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const iterator = this.orchestrator.plan({
      userId: user.id,
      conversationId: dto.conversationId,
      message: dto.message,
    });
    await this.stream(res, iterator);
  }

  // P4：增量重规划（编辑后行程 + 需求 → 重新规划并校验），同样以 SSE 流式返回。
  @Post('replan')
  async replan(
    @Body() dto: ReplanItineraryDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const iterator = this.orchestrator.replan({
      userId: user.id,
      conversationId: dto.conversationId,
      itinerary: dto.itinerary as unknown as Itinerary,
      requirement: dto.requirement as unknown as TravelRequirement,
      note: dto.note,
    });
    await this.stream(res, iterator);
  }

  // 通用 SSE 流：惰性执行取首个事件（失败时尚未写 SSE 头，可返回 JSON 错误）
  private async stream(res: Response, iterator: AsyncGenerator<AgentEvent>): Promise<void> {
    let first: IteratorResult<AgentEvent>;
    try {
      first = await iterator.next();
    } catch (err) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({
        code: err instanceof AppError ? err.code : ErrorCodes.INTERNAL_ERROR,
        message: err instanceof Error ? err.message : '请求失败',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.writeEvent(res, first.value);

    try {
      for (;;) {
        const { value, done } = await iterator.next();
        if (done) break;
        this.writeEvent(res, value);
      }
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务内部错误';
      this.writeEvent(res, { type: 'error', message, code: 'STREAM_ERROR' });
      res.end();
    }
  }

  private writeEvent(res: Response, event: AgentEvent): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}
