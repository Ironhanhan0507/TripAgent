// LLM 通用类型：所有 Provider 统一实现该接口，支持 mock ⇄ 真实切换。

export type LLMRole = 'system' | 'user' | 'assistant';

export interface LLMChatMessage {
  role: LLMRole;
  content: string;
}

export interface LLMChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  // 提示模型输出 JSON（OpenAI 兼容 json_object 模式）
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: LLMChatMessage[], options?: LLMChatOptions): Promise<string>;
  // 流式输出：逐段 yield 文本增量，供 SSE 实时展示（感知延迟优化）。
  // 未实现流式的 Provider 可默认将 chat 结果一次性 yield。
  chatStream?(messages: LLMChatMessage[], options?: LLMChatOptions): AsyncGenerator<string>;
}

export class LLMError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LLMError';
  }
}
