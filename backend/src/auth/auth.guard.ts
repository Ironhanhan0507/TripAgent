import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppError, ErrorCodes } from '../common/errors.js';
import { TokenService } from './token.service.js';
import { PrismaService } from '../database/prisma.service.js';

// 基于 Bearer JWT 的全局认证守卫；通过后注入 request.user。
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, '未登录', 401);
    }
    const payload = this.tokens.verifyAccessToken(authHeader.slice(7));
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, '用户不存在', 401);
    }
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    };
    return true;
  }
}
