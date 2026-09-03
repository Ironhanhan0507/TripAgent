import { Injectable, Logger } from '@nestjs/common';
import { LLMProvider } from '../llm.types.js';

// Mock LLM：不调用真实 API，按规则返回固定/规则化结果，用于离线跑通链路。
@Injectable()
export class MockLlmProvider implements LLMProvider {
  readonly name = 'mock';

  private readonly logger = new Logger(MockLlmProvider.name);

  async chat(
    messages: Array<{ role: string; content: string }>,
    options: { jsonMode?: boolean } = {},
  ): Promise<string> {
    this.logger.log('Mock LLM 调用（无真实 API）');
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    if (options.jsonMode) {
      // 规则化解析：尝试从自然语言提取目的地/天数/预算
      const destination = this.extractDestination(lastUser);
      const travelers = /(\d)\s*人/.exec(lastUser)?.[1] ?? '2';
      const budget = /(\d+)\s*元/.exec(lastUser)?.[1] ?? '8000';
      const days = this.extractDays(lastUser);
      return JSON.stringify({
        requirement: {
          destination,
          startDate: null,
          endDate: null,
          days: days ? Number(days) : null,
          travelers: Number(travelers),
          budget: Number(budget),
          currency: 'CNY',
          preferences: [],
          avoidPreferences: [],
          travelPace: 'balanced',
          transportationPreference: 'mixed',
        },
        isComplete: Boolean(destination),
        missingFields: destination ? [] : ['destination', 'startDate', 'endDate'],
        clarifyingQuestions: destination
          ? []
          : ['请问您计划去哪里旅行？', '计划出行几天、大概什么时候出发？'],
      });
    }

    return '（Mock）我已收到您的需求，正在为您解析。';
  }

  // 流式：Mock 无真实网络，模拟逐段输出（按 32 字符切块 + 8ms 间隔）。
  async *chatStream(
    messages: Array<{ role: string; content: string }>,
    options: { jsonMode?: boolean; signal?: AbortSignal } = {},
  ): AsyncGenerator<string> {
    const full = await this.chat(messages, options);
    for (let i = 0; i < full.length; i += 32) {
      if (options.signal?.aborted) return;
      yield full.slice(i, i + 32);
      await new Promise((r) => setTimeout(r, 8));
    }
  }

  private extractDestination(text: string): string {
    // 简单规则：命中常见目的地关键词
    const known = ['东京', '上海', '北京', '巴黎', '曼谷', '悉尼', '大阪', '京都', '首尔', '新加坡', '香港', '台北'];
    return known.find((city) => text.includes(city)) ?? '';
  }

  private extractDays(text: string): string | null {
    const match = /(\d+)\s*天/.exec(text);
    return match ? String(Number(match[1])) : null;
  }
}
