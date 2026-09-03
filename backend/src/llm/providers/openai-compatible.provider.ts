import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { LLMError, LLMProvider } from '../llm.types.js';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  error?: { message?: string };
}

interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
}

// OpenAI 兼容 Chat Completions 客户端（DeepSeek / 硅基流动 / 智谱 / 通义等均兼容此协议）。
// 支持非流式 chat() 与流式 chatStream()（SSE 增量，供前端实时展示）。
@Injectable()
export class OpenAiCompatibleLlmProvider implements LLMProvider {
  readonly name = 'openai-compatible';

  private readonly logger = new Logger(OpenAiCompatibleLlmProvider.name);

  constructor(private readonly config: AppConfigService) {}

  async chat(
    messages: Array<{ role: string; content: string }>,
    options: ChatOptions = {},
  ): Promise<string> {
    const { baseUrl, headers, body } = this.buildRequest(messages, options, false);
    const res = await this.request(baseUrl, headers, body, options.signal);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LLMError(`LLM 接口返回 ${res.status}：${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as ChatCompletionResponse;
    if (data.error?.message) {
      throw new LLMError(`LLM 接口错误：${data.error.message}`);
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new LLMError('LLM 返回内容为空');
    }
    return content;
  }

  // 流式：逐段 yield 文本增量。解析 OpenAI 兼容 SSE 帧（data: {json} / data: [DONE]）。
  async *chatStream(
    messages: Array<{ role: string; content: string }>,
    options: ChatOptions = {},
  ): AsyncGenerator<string> {
    const { baseUrl, headers, body } = this.buildRequest(messages, options, true);
    const res = await this.request(baseUrl, headers, body, options.signal);
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new LLMError(`LLM 接口返回 ${res.status}：${text.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload) as StreamChunk;
          if (chunk.error?.message) {
            throw new LLMError(`LLM 流错误：${chunk.error.message}`);
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch (err) {
          if (err instanceof LLMError) throw err;
          // 忽略无法解析的帧
        }
      }
    }
  }

  private buildRequest(
    messages: Array<{ role: string; content: string }>,
    options: ChatOptions,
    stream: boolean,
  ): { baseUrl: string; headers: Record<string, string>; body: string } {
    const apiKey = this.config.llmApiKey;
    if (!apiKey) {
      throw new LLMError('LLM_API_KEY 未配置');
    }
    const baseUrl = this.config.llmBaseUrl.replace(/\/+$/, '');
    const body = JSON.stringify({
      model: options.model ?? this.config.llmModel,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? this.config.llmMaxTokens,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
      stream,
    });
    return {
      baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    };
  }

  private async request(
    baseUrl: string,
    headers: Record<string, string>,
    body: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.llmTimeoutMs);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `LLM 请求超时（>${this.config.llmTimeoutMs}ms）`
          : `LLM 请求失败：${err instanceof Error ? err.message : String(err)}`;
      throw new LLMError(message, { cause: err });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
