import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../database/redis.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health(): Promise<{
    status: string;
    uptime: number;
    db: 'up' | 'down';
    redis: 'up' | 'down' | 'disabled';
    timestamp: string;
  }> {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      /* 状态反映在返回值 */
    }

    let redis: 'up' | 'down' | 'disabled' = 'disabled';
    if (this.redis.enabled) {
      redis = (await this.redis.ping()) ? 'up' : 'down';
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      db,
      redis,
      timestamp: new Date().toISOString(),
    };
  }
}
