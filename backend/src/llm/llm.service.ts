import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { LLMError, LLMChatMessage, LLMChatOptions } from './llm.types.js';
import type { LLMProvider } from './llm.types.js';

export const LLM_PROVIDER_TOKEN = 'LLM_PROVIDER';

// LLM 门面：统一 chat / chatJson 能力，内部负责选择 provider 与 JSON 解析重试。
@Injectable()
export class LlmService {
  constructor(
    @Inject(LLM_PROVIDER_TOKEN) private readonly provider: LLMProvider,
    private readonly config: AppConfigService,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  async chat(messages: LLMChatMessage[], options?: LLMChatOptions): Promise<string> {
    return this.provider.chat(messages, options);
  }

  // 请求 JSON 输出并解析为 T；失败按配置重试。
  async chatJson<T>(messages: LLMChatMessage[], options?: LLMChatOptions): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.llmMaxRetries; attempt++) {
      try {
        const content = await this.provider.chat(messages, { ...options, jsonMode: true });
        return this.parseJson<T>(content);
      } catch (err) {
        lastError = err;
        if (attempt < this.config.llmMaxRetries) {
          // 简单退避：300ms * (attempt+1)
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }
    throw new LLMError('LLM JSON 输出解析失败', { cause: lastError });
  }

  // 流式 JSON 请求：边接收增量文本（经 onDelta 透传，供 SSE 实时展示），
  // 边累积到完整内容后解析 JSON；同样带重试与 JSON 清洗。
  async chatJsonStream<T>(
    messages: LLMChatMessage[],
    options: LLMChatOptions = {},
    onDelta?: (text: string) => void,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.llmMaxRetries; attempt++) {
      try {
        let full = '';
        const stream = this.provider.chatStream;
        if (stream) {
          // 注意：stream 是方法裸引用，需显式绑定 this，否则 provider 内 this 为 undefined
          for await (const delta of stream.call(this.provider, messages, {
            ...options,
            jsonMode: true,
          })) {
            full += delta;
            onDelta?.(delta);
          }
        } else {
          // Provider 未实现流式 → 退化为一次性 chat
          full = await this.provider.chat(messages, { ...options, jsonMode: true });
          onDelta?.(full);
        }
        return this.parseJson<T>(full);
      } catch (err) {
        lastError = err;
        if (attempt < this.config.llmMaxRetries) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }
    throw new LLMError('LLM JSON 流式输出解析失败', { cause: lastError });
  }

  private parseJson<T>(content: string): T {
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
      throw new Error('返回内容中未找到 JSON 对象');
    }
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
}
