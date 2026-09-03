import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { StringValue } from 'ms';
import { AppConfigService } from '../config/app-config.service.js';

export interface JwtPayload {
  sub: string; // userId
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// 访问令牌用 JWT（短期）；刷新令牌用随机串 + SHA-256 哈希入库（可吊销、可轮换）。
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signAccessToken(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.jwtAccessExpiresIn as StringValue,
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.jwt.verify<JwtPayload>(token, { secret: this.config.jwtAccessSecret });
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshExpiresAt(): Date {
    const ttlMs = this.parseTtl(this.config.jwtRefreshExpiresIn);
    return new Date(Date.now() + ttlMs);
  }

  private parseTtl(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 30 * 24 * 60 * 60 * 1000; // 默认 30 天
    const value = Number(match[1]);
    const unit = match[2];
    const map: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * map[unit];
  }
}
