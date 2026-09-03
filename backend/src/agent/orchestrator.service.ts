import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AppError, ErrorCodes } from '../common/errors.js';
import { RequirementParser } from './parser/requirement-parser.service.js';
import { AgentEvent, MAX_REPLAN_ATTEMPTS } from './events/agent-event.js';
import { TravelRequirement } from './types/travel-requirement.js';
import type { LLMChatMessage } from '../llm/llm.types.js';
import { Planner } from '../planner/planner.service.js';
import { Validator } from '../planner/validator.service.js';
import { Itinerary, ValidationIssue } from '../planner/types/itinerary.js';
import { PLACES_PROVIDER } from '../planner/places/places-provider.types.js';
import type { PlaceSummary, PlacesProvider } from '../planner/places/places-provider.types.js';

export interface AgentPlanInput {
  userId: string;
  conversationId: string;
  message: string;
}

export interface AgentReplanInput {
  userId: string;
  conversationId?: string;
  itinerary: Itinerary;
  requirement: TravelRequirement;
  note?: string;
}

// Main Agent Orchestrator（P1 骨架）：
// 接收用户消息 → Requirement Parser（Structured Output）→ 完整则输出 requirement，否则触发澄清。
// 后续 P2 在完整需求基础上扩展 Planner / Validator / Replanner 循环。
@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: RequirementParser,
    private readonly planner: Planner,
    private readonly validator: Validator,
    @Inject(PLACES_PROVIDER) private readonly places: PlacesProvider,
  ) {}

  async *plan(input: AgentPlanInput): AsyncGenerator<AgentEvent> {
    const { userId, conversationId, message } = input;

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new AppError(ErrorCodes.NOT_FOUND, '会话不存在', 404);
    }

    // 持久化用户消息，并更新会话标题（首条消息时）
    await this.prisma.message.create({
      data: { conversationId, role: 'user', kind: 'text', content: message },
    });
    if (conversation.title === '新对话') {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title: message.length > 24 ? `${message.slice(0, 24)}…` : message },
      });
    }

    yield { type: 'status', state: 'parsing' };

    try {
      const history = await this.loadHistory(conversationId, message);
      const result = yield* this.yieldWithStream((push) => this.parser.parse(history, push));

      if (!result.isComplete) {
        yield { type: 'status', state: 'needs_input' };
        const content = result.clarifyingQuestions.join('\n');
        yield { type: 'message', content };
        await this.saveAssistant(conversationId, content, 'text', null);
        yield { type: 'done', itinerary: null };
        return;
      }

      const requirement = result.requirement!;
      yield { type: 'requirement', requirement };
      const summary = this.formatRequirement(requirement);
      yield { type: 'message', content: summary };
      await this.saveAssistant(conversationId, summary, 'requirement', requirement);

      // ==== P2：Plan → Validate → Replan 循环（≤ MAX_REPLAN_ATTEMPTS 次） ====
      yield { type: 'status', state: 'searching' };
      yield { type: 'tool_call', tool: 'search_places', message: '正在检索目的地景点…' };
      const places = await this.searchPlaces(requirement);
      yield { type: 'tool_result', tool: 'search_places', summary: `找到 ${places.length} 个候选景点` };
      if (places.length === 0) {
        yield { type: 'status', state: 'error' };
        yield { type: 'error', message: '未能找到目的地的可用景点信息，请尝试其他目的地。', code: 'NO_PLACES' };
        yield { type: 'done', itinerary: null };
        return;
      }

      let itinerary: Itinerary | null = null;
      let issues: ValidationIssue[] = [];
      for (let attempt = 0; attempt <= MAX_REPLAN_ATTEMPTS; attempt++) {
        if (attempt === 0) {
          yield { type: 'status', state: 'planning' };
          yield { type: 'tool_call', tool: 'generate_itinerary', message: '正在生成行程…' };
        } else {
          yield { type: 'status', state: 'replanning' };
          yield {
            type: 'message',
            content: `行程存在 ${issues.filter((i) => i.severity === 'error').length} 个需修复问题，正在重新规划（第 ${attempt} 次 / 共 ${MAX_REPLAN_ATTEMPTS} 次）…`,
          };
        }

        itinerary = yield* this.yieldWithStream((push) =>
          this.planner.generate({
            requirement,
            places,
            currency: requirement.currency,
            totalBudget: requirement.budget ?? undefined,
            previous: attempt > 0 ? { itinerary: itinerary ?? undefined, issues } : undefined,
            onDelta: push,
          }),
        );
        yield { type: 'plan', itinerary };

        yield { type: 'status', state: 'validating' };
        yield { type: 'tool_call', tool: 'validate_itinerary', message: '正在校验行程…' };
        const result = await this.validator.validate(itinerary, requirement);
        yield { type: 'tool_result', tool: 'validate_itinerary', summary: `校验完成：${result.issues.length} 项问题` };
        yield { type: 'validation', issues: result.issues, attempt, maxAttempts: MAX_REPLAN_ATTEMPTS };
        issues = result.issues;

        const errors = issues.filter((i) => i.severity === 'error');
        if (errors.length === 0) break;
        if (attempt >= MAX_REPLAN_ATTEMPTS) {
          yield {
            type: 'message',
            content: `已尝试重规划 ${MAX_REPLAN_ATTEMPTS} 次，仍有 ${errors.length} 个问题未能解决：\n${errors
              .map((e) => `- ${e.message}`)
              .join('\n')}\n您可以调整需求后再试。`,
          };
          break;
        }
      }

      const finalText = this.formatItinerarySummary(itinerary!, issues);
      yield { type: 'message', content: finalText };
      await this.saveAssistant(conversationId, finalText, 'itinerary', itinerary);

      yield { type: 'status', state: 'done' };
      yield { type: 'done', itinerary };
      this.logger.log(
        `Plan completed for conversation ${conversationId}: ${itinerary?.days.length} 天, ${issues.length} 项问题`,
      );
    } catch (err) {
      this.logger.error(
        `Agent plan failed: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err.stack : undefined,
      );
      if (err instanceof Error && (err as { cause?: Error }).cause) {
        const cause = (err as { cause?: Error }).cause as Error;
        this.logger.error(`Agent plan cause: ${cause.message}\n${cause.stack ?? ''}`);
      }
      yield { type: 'status', state: 'error' };
      yield {
        type: 'error',
        message: '抱歉，我在理解需求时遇到问题，请稍后重试或换一种说法。',
        code: 'AGENT_ERROR',
      };
      yield { type: 'done', itinerary: null };
    }
  }

  // ===== P4：增量重规划 =====
  // 用户在前端编辑行程后调用：保留用户编辑（previous.itinerary）+ 可选说明，
  // 重新搜索景点 → Planner 基于编辑结果生成 → 校验 → 推送 plan/validation/done 事件。
  async *replan(input: AgentReplanInput): AsyncGenerator<AgentEvent> {
    const { itinerary, requirement, note } = input;
    try {
      yield { type: 'status', state: 'replanning' };
      yield { type: 'tool_call', tool: 'search_places', message: '正在重新检索目的地景点…' };
      const places = await this.searchPlaces(requirement);
      yield { type: 'tool_result', tool: 'search_places', summary: `找到 ${places.length} 个候选景点` };
      if (places.length === 0) {
        yield { type: 'status', state: 'error' };
        yield { type: 'error', message: '未能找到目的地的可用景点信息，请重试。', code: 'NO_PLACES' };
        yield { type: 'done', itinerary: null };
        return;
      }

      // 基于用户编辑结果做增量重规划；note 作为附加说明传入 Planner 上下文
      const regenerated = yield* this.yieldWithStream((push) =>
        this.planner.generate({
          requirement,
          places,
          currency: requirement.currency,
          totalBudget: requirement.budget ?? undefined,
          previous: { itinerary, issues: note ? [{ code: 'MISMATCH_PREFERENCE' as const, severity: 'warning' as const, message: note, location: '全程' }] : [] },
          onDelta: push,
        }),
      );
      yield { type: 'plan', itinerary: regenerated };

      yield { type: 'status', state: 'validating' };
      yield { type: 'tool_call', tool: 'validate_itinerary', message: '正在校验调整后的行程…' };
      const result = await this.validator.validate(regenerated, requirement);
      yield { type: 'tool_result', tool: 'validate_itinerary', summary: `校验完成：${result.issues.length} 项问题` };
      yield { type: 'validation', issues: result.issues, attempt: 0, maxAttempts: MAX_REPLAN_ATTEMPTS };

      const errorCount = result.issues.filter((i) => i.severity === 'error').length;
      const content =
        errorCount === 0
          ? '已根据您的调整重新生成行程并通过校验。'
          : `调整后的行程仍有 ${errorCount} 个需修复问题（见校验报告），可继续调整。`;
      yield { type: 'message', content };
      if (input.conversationId) {
        await this.saveAssistant(input.conversationId, content, 'itinerary', regenerated);
      }

      yield { type: 'status', state: 'done' };
      yield { type: 'done', itinerary: regenerated };
    } catch (err) {
      this.logger.error(`Replan failed: ${err instanceof Error ? err.message : err}`);
      yield { type: 'status', state: 'error' };
      yield { type: 'error', message: '重新规划失败，请稍后重试。', code: 'REPLAN_ERROR' };
      yield { type: 'done', itinerary: null };
    }
  }

  // 桥接 LLM 流式回调 → SSE 事件：任务运行时并发 drain 队列，
  // 边生成边 yield { type:'stream' }，降低感知延迟；任务结束后返回其结果。
  private async *yieldWithStream<T>(
    task: (push: (text: string) => void) => Promise<T>,
  ): AsyncGenerator<AgentEvent, T, undefined> {
    const queue: string[] = [];
    let taskDone = false;
    let taskResult!: T;
    let taskError: unknown;

    const push = (text: string) => queue.push(text);
    const run = (async () => {
      try {
        taskResult = await task(push);
      } catch (e) {
        taskError = e;
      } finally {
        taskDone = true;
      }
    })();

    while (!taskDone) {
      while (queue.length) yield { type: 'stream', text: queue.shift()! };
      await new Promise((r) => setTimeout(r, 40));
    }
    while (queue.length) yield { type: 'stream', text: queue.shift()! };
    await run;
    if (taskError) throw taskError;
    return taskResult;
  }

  private async loadHistory(conversationId: string, latest: string): Promise<LLMChatMessage[]> {
    const history = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    const messages: LLMChatMessage[] = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    // 最新消息已持久化，避免重复
    if (!messages.some((m) => m.content === latest)) {
      messages.push({ role: 'user', content: latest });
    }
    return messages;
  }

  private async saveAssistant(
    conversationId: string,
    content: string,
    kind: string,
    payload: TravelRequirement | Itinerary | null,
  ): Promise<void> {
    await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        kind,
        content,
        payload: payload ? (payload as object) : undefined,
      },
    });
  }

  // 检索目的地候选景点（覆盖各分类，供 Planner 选择）
  private async searchPlaces(requirement: TravelRequirement): Promise<PlaceSummary[]> {
    const pool = new Map<string, PlaceSummary>();
    for (const category of ['sightseeing', 'dining', 'shopping', 'hotel'] as const) {
      const list = await this.places.searchPlaces({ city: requirement.destination, category, limit: 8 });
      for (const p of list) pool.set(p.placeId, p);
    }
    return [...pool.values()].sort((a, b) => b.rating - a.rating);
  }

  private formatItinerarySummary(itinerary: Itinerary, issues: ValidationIssue[]): string {
    const head = `已为您生成 ${itinerary.destination} ${itinerary.days.length} 天行程（${itinerary.startDate} ~ ${itinerary.endDate}）：`;
    const lines = itinerary.days.map((d, i) => {
      const acts = d.activities
        .filter((a) => a.category !== 'hotel')
        .map((a) => `${a.startTime} ${a.name}`)
        .join(' → ');
      return `Day${i + 1}（${d.date}）${d.title ? ` ${d.title}` : ''}：${acts || '待定'}`;
    });
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const tail =
      errorCount === 0
        ? '\n行程已通过校验，祝您旅途愉快！'
        : `\n仍有 ${errorCount} 个待优化问题（见校验报告），可继续对话调整。`;
    return [head, ...lines, tail].join('\n');
  }

  private formatRequirement(r: TravelRequirement): string {
    const dateText =
      r.startDate && r.endDate
        ? `${r.startDate} ~ ${r.endDate}${r.days ? `（${r.days} 天）` : ''}`
        : r.days
          ? `${r.days} 天`
          : '未指定';
    const lines = [
      '已确认您的旅行需求：',
      `- 目的地：${r.destination}`,
      `- 时间：${dateText}`,
      `- 人数：${r.travelers ? `${r.travelers} 人` : '未指定'}`,
      `- 预算：${r.budget ? `约 ${r.budget} ${r.currency}` : '未指定'}`,
      r.preferences.length ? `- 偏好：${r.preferences.join('、')}` : null,
      r.avoidPreferences.length ? `- 避开：${r.avoidPreferences.join('、')}` : null,
      `- 节奏：${this.paceText(r.travelPace)}`,
      `- 交通：${this.transportText(r.transportationPreference)}`,
      '接下来我将为您规划行程（P2 阶段实现）。',
    ].filter((l): l is string => l !== null);
    return lines.join('\n');
  }

  private paceText(pace: TravelRequirement['travelPace']): string {
    const map: Record<string, string> = { relaxed: '轻松', balanced: '适中', intensive: '紧凑' };
    return pace ? map[pace] : '适中';
  }

  private transportText(mode: TravelRequirement['transportationPreference']): string {
    const map: Record<string, string> = {
      public: '公共交通',
      walking: '步行',
      taxi: '打车',
      car: '自驾',
      mixed: '混合',
    };
    return map[mode ?? ''] ?? '未指定';
  }
}
