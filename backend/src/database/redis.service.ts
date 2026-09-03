import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service.js';

// Redis 客户端：P0 仅用于健康检查与会话相关能力预留。
// 连接失败不阻塞应用启动（记录警告并降级）。
@Injectable()
export class RedisService {
  private readonly client: Redis | null;

  constructor(config: AppConfigService) {
    if (!config.redisEnabled) {
      this.client = null;
      return;
    }
    this.client = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // 不做自动重连，避免启动期刷错误日志
      enableOfflineQueue: false,
    });
    this.client.on('error', () => {
      // 忽略连接错误，健康检查会反映状态
    });
    this.client.connect().catch(() => {
      /* 降级处理 */
    });
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  get available(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key).catch(() => null);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds).catch(() => undefined);
    } else {
      await this.client.set(key, value).catch(() => undefined);
    }
  }
}
