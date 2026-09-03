import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service.js';
import { LLM_PROVIDER_TOKEN, LlmService } from './llm.service.js';
import { LLMProvider } from './llm.types.js';
import { MockLlmProvider } from './providers/mock.provider.js';
import { OpenAiCompatibleLlmProvider } from './providers/openai-compatible.provider.js';

// 根据 LLM_PROVIDER 选择 provider：mock（离线）或 openai-compatible（DeepSeek 等）。
@Module({
  providers: [
    OpenAiCompatibleLlmProvider,
    MockLlmProvider,
    {
      provide: LLM_PROVIDER_TOKEN,
      inject: [AppConfigService, OpenAiCompatibleLlmProvider, MockLlmProvider],
      useFactory: (
        config: AppConfigService,
        openai: OpenAiCompatibleLlmProvider,
        mock: MockLlmProvider,
      ): LLMProvider => (config.llmProvider === 'mock' ? mock : openai),
    },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
