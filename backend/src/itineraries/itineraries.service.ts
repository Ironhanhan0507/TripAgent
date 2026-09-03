import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { AppError, ErrorCodes } from '../common/errors.js';
import { Validator } from '../planner/validator.service.js';
import type { Itinerary } from '../planner/types/itinerary.js';
import type { TravelRequirement } from '../agent/types/travel-requirement.js';
import {
  SaveItineraryDto,
  UpdateActivityDto,
  UpdateItineraryDto,
  ValidateItineraryDto,
} from './dto/itinerary.dto.js';

// P4：行程 CRUD。行程主数据冗余在 itineraryData（JSONB），
// 保存/更新时透传结构化数据，快速渲染，同时保留 version 做增量重规划追踪。
@Injectable()
export class ItinerariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: Validator,
  ) {}

  async save(userId: string, dto: SaveItineraryDto) {
    // 若关联会话，校验会话归属
    if (dto.conversationId) {
      const conv = await this.prisma.conversation.findFirst({
        where: { id: dto.conversationId, userId },
      });
      if (!conv) {
        throw new AppError(ErrorCodes.NOT_FOUND, '会话不存在', 404);
      }
    }
    return this.prisma.itinerary.create({
      data: {
        userId,
        conversationId: dto.conversationId ?? null,
        title: dto.title,
        destination: dto.destination,
        startDate: dto.startDate,
        endDate: dto.endDate,
        totalBudget: dto.totalBudget ?? null,
        currency: dto.currency ?? 'CNY',
        status: dto.status ?? 'saved',
        itineraryData: dto.itineraryData as object,
        requirement: dto.requirement
          ? (dto.requirement as object)
          : dto.requirement === null
            ? Prisma.DbNull
            : undefined,
      },
    });
  }

  async list(userId: string) {
    return this.prisma.itinerary.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async detail(userId: string, id: string) {
    const trip = await this.prisma.itinerary.findFirst({ where: { id, userId } });
    if (!trip) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程不存在', 404);
    }
    return trip;
  }

  async update(userId: string, id: string, dto: UpdateItineraryDto) {
    const trip = await this.prisma.itinerary.findFirst({ where: { id, userId } });
    if (!trip) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程不存在', 404);
    }
    return this.prisma.itinerary.update({
      where: { id },
      data: {
        title: dto.title,
        destination: dto.destination,
        startDate: dto.startDate,
        endDate: dto.endDate,
        totalBudget: dto.totalBudget,
        currency: dto.currency,
        status: dto.status,
        itineraryData: dto.itineraryData ? (dto.itineraryData as object) : undefined,
        requirement:
          dto.requirement !== undefined
            ? dto.requirement
              ? (dto.requirement as object)
              : Prisma.DbNull
            : undefined,
        version: { increment: 1 },
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const trip = await this.prisma.itinerary.findFirst({ where: { id, userId } });
    if (!trip) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程不存在', 404);
    }
    await this.prisma.itinerary.delete({ where: { id } });
  }

  // 编辑单个活动（设计文档 §7.4）：dayId 对应 DayPlan.dayIndex（0-based），
  // 部分更新后写回 JSONB，version +1。
  async updateActivity(
    userId: string,
    id: string,
    dayId: string,
    activityId: string,
    dto: UpdateActivityDto,
  ) {
    const trip = await this.prisma.itinerary.findFirst({ where: { id, userId } });
    if (!trip) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程不存在', 404);
    }
    const data = trip.itineraryData as unknown as Itinerary;
    const day = data.days?.[Number(dayId)];
    if (!day) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程日期不存在', 404);
    }
    const act = day.activities.find((a) => a.id === activityId);
    if (!act) {
      throw new AppError(ErrorCodes.NOT_FOUND, '活动不存在', 404);
    }
    // class-transformer 会把未提供的字段初始化为 undefined，需过滤后再合并，避免覆盖原值。
    const patch = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    Object.assign(act, patch);
    return this.prisma.itinerary.update({
      where: { id },
      data: { itineraryData: data as object, version: { increment: 1 } },
    });
  }

  // 手动触发校验（设计文档 §7.4）：body 可选携带当前草稿，否则校验已保存版本。
  async validate(userId: string, id: string, dto: ValidateItineraryDto) {
    const trip = await this.prisma.itinerary.findFirst({ where: { id, userId } });
    if (!trip) {
      throw new AppError(ErrorCodes.NOT_FOUND, '行程不存在', 404);
    }
    const itinerary = (dto.itinerary ?? trip.itineraryData) as unknown as Itinerary;
    if (!Array.isArray(itinerary.days) || itinerary.days.length === 0) {
      throw new AppError(ErrorCodes.VALIDATION_FAILED, '行程数据不完整，无法校验', 400);
    }
    const requirement = (trip.requirement as unknown as TravelRequirement | null) ?? this.fallbackRequirement(itinerary);
    const result = await this.validator.validate(itinerary, requirement);
    return { version: trip.version, passed: result.passed, issues: result.issues };
  }

  // 无存储需求时（如旧数据）基于行程结构构造最小校验上下文。
  private fallbackRequirement(itinerary: Itinerary): TravelRequirement {
    return {
      destination: itinerary.destination,
      startDate: null,
      endDate: null,
      days: itinerary.days.length,
      travelers: null,
      budget: itinerary.totalBudget ?? null,
      currency: itinerary.currency ?? 'CNY',
      preferences: [],
      avoidPreferences: [],
      travelPace: null,
      transportationPreference: null,
    };
  }
}
