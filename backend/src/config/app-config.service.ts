import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// 类型化配置：集中读取环境变量并提供默认值。
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return Number(this.config.get('PORT', 3000));
  }

  get nodeEnv(): string {
    return this.config.get('NODE_ENV', 'development');
  }

  get databaseUrl(): string {
    return (
      this.config.get('DATABASE_URL') ??
      'postgresql://tripagent:tripagent_dev@127.0.0.1:5432/tripagent?schema=public'
    );
  }

  get redisUrl(): string {
    return this.config.get('REDIS_URL', 'redis://127.0.0.1:6379');
  }

  get redisEnabled(): boolean {
    return this.config.get('REDIS_ENABLED', 'true') === 'true';
  }

  get jwtAccessSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET', 'tripagent-access-secret-dev');
  }

  get jwtAccessExpiresIn(): string {
    return this.config.get('JWT_ACCESS_EXPIRES_IN', '15m');
  }

  get jwtRefreshSecret(): string {
    return this.config.get('JWT_REFRESH_SECRET', 'tripagent-refresh-secret-dev');
  }

  get jwtRefreshExpiresIn(): string {
    return this.config.get('JWT_REFRESH_EXPIRES_IN', '30d');
  }

  get llmProvider(): string {
    return this.config.get('LLM_PROVIDER', 'deepseek');
  }

  get llmApiKey(): string {
    return this.config.get('LLM_API_KEY', '');
  }

  get llmBaseUrl(): string {
    return this.config.get('LLM_BASE_URL', 'https://api.deepseek.com');
  }

  get llmModel(): string {
    return this.config.get('LLM_MODEL', 'deepseek-chat');
  }

  get llmTimeoutMs(): number {
    // 默认 180s：DeepSeek-V3 生成 5 天行程 JSON 常需 50~120s，
    // 60s 超时会误杀并在重试后耗时翻倍。
    return Number(this.config.get('LLM_TIMEOUT_MS', 180_000));
  }

  get llmMaxTokens(): number {
    // 单次 LLM 输出上限（token）。行程 JSON 通常 2~4k，默认 8192 留足余量防截断。
    return Number(this.config.get('LLM_MAX_TOKENS', 8192));
  }

  get llmMaxRetries(): number {
    return Number(this.config.get('LLM_MAX_RETRIES', 2));
  }

  get placesProvider(): string {
    // mock=离线确定性目录；接入真实服务（如 Google Places）后按此值切换实现。
    return this.config.get('PLACES_PROVIDER', 'mock');
  }
}
