import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import { AppError, ErrorCodes } from '../common/errors.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { TokenService } from './token.service.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new AppError(ErrorCodes.EMAIL_TAKEN, '该邮箱已被注册', 409);
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name ?? null },
    });
    this.logger.log(`User registered: ${user.id} (${user.email})`);
    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, '邮箱或密码错误', 401);
    }
    this.logger.log(`User login: ${user.id} (${user.email})`);
    return this.buildAuthResult(user);
  }

  async refresh(dto: RefreshDto) {
    const tokenHash = this.tokens.hashRefreshToken(dto.refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record || record.revoked || record.expiresAt < new Date()) {
      throw new AppError(ErrorCodes.INVALID_REFRESH_TOKEN, 'refresh token 无效或已过期', 401);
    }
    // 轮换：吊销旧 token，签发新 token
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });
    return this.buildAuthResult(record.user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, '用户不存在', 401);
    }
    return this.toAuthUser(user);
  }

  private async buildAuthResult(user: {
    id: string;
    email: string;
    passwordHash: string;
    name: string | null;
    avatar: string | null;
  }) {
    const accessToken = this.tokens.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = this.tokens.generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        expiresAt: this.tokens.refreshExpiresAt(),
      },
    });
    return { accessToken, refreshToken, user: this.toAuthUser(user) };
  }

  private toAuthUser(user: {
    id: string;
    email: string;
    name: string | null;
    avatar: string | null;
  }): AuthUser {
    return { id: user.id, email: user.email, name: user.name, avatar: user.avatar };
  }
}
