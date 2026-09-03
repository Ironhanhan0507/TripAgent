import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { TravelRequirement } from '../agent/types/travel-requirement.js';
import { ActivityCategory, DayPlan, Itinerary, ValidationIssue } from './types/itinerary.js';
import { PlaceSummary } from './places/places-provider.types.js';

const CATEGORIES: ActivityCategory[] = ['sightseeing', 'dining', 'shopping', 'transport', 'hotel', 'other'];

export interface PlanOptions {
  requirement: TravelRequirement;
  places: PlaceSummary[];
  currency?: string;
  totalBudget?: number;
  previous?: { itinerary?: Itinerary; issues?: ValidationIssue[] };
  // LLM 流式增量回调（SSE 透传，降低感知延迟）
  onDelta?: (text: string) => void;
}

// Planner：Structured Output（JSON 约束）把 TravelRequirement + 景点目录 → Itinerary。
// 设计原则：LLM 只能从目录中选择景点（placeId 必须来自 search_places 结果），不得编造。
@Injectable()
export class Planner {
  private readonly logger = new Logger(Planner.name);

  constructor(
    private readonly llm: LlmService,
    private readonly config: AppConfigService,
  ) {}

  async generate(options: PlanOptions): Promise<Itinerary> {
    const { requirement } = options;
    const dayCount = this.resolveDayCount(requirement);
    const startDate = this.resolveStartDate(requirement);
    const endDate = this.resolveEndDate(requirement, startDate, dayCount);

    const raw = await this.llm.chatJsonStream<{
      days?: Array<Record<string, unknown>>;
      notes?: unknown;
    }>(
      [
        { role: 'system', content: this.buildSystemPrompt() },
        {
          role: 'user',
          content: [
            `【旅行需求】\n${JSON.stringify(requirement, null, 2)}`,
            `【可选择的景点目录】\n${JSON.stringify(this.compactPlaces(options.places), null, 0)}`,
            `【要求】共 ${dayCount} 天：${this.dateWeekdays(startDate, dayCount)}。`,
            options.totalBudget != null ? `【预算】总计约 ${options.totalBudget} ${options.currency ?? 'CNY'}。` : '',
            options.previous?.issues?.length
              ? `【上一次校验问题（必须全部修复，error 级别优先）】\n${JSON.stringify(options.previous.issues, null, 2)}\n修复指引：超出营业时间→调整开始/结束时间落在营业时间内；时间冲突→错开时间；交通间隙不足→增大相邻活动间隔。必要时可替换为目录内其他景点或调整顺序。`
              : '',
            options.previous?.itinerary
              ? `【上一次行程（仅作参考；凡与上面校验问题冲突的部分必须以修复为准，不得照搬）】\n${JSON.stringify(options.previous.itinerary, null, 2)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      { maxTokens: this.config.llmMaxTokens },
      options.onDelta,
    );

    const itinerary = this.normalize(raw, {
      destination: requirement.destination,
      startDate,
      endDate,
      dayCount,
      currency: options.currency ?? requirement.currency ?? 'CNY',
      totalBudget: options.totalBudget ?? requirement.budget ?? undefined,
      places: options.places,
    });
    this.logger.log(
      `Planner generated itinerary: ${itinerary.days.length} 天, ${itinerary.days.reduce((s, d) => s + d.activities.length, 0)} 项活动`,
    );
    return itinerary;
  }

  // 精简景点卡片：仅保留 Planner 决策需要的字段（坐标/地址由后端从目录回填，无需喂给 LLM）。
  // hours 字段注入营业时间，使 LLM 首轮规划即可避开闭馆日与营业时间外。
  private compactPlaces(places: PlaceSummary[]): Array<{
    placeId: string;
    name: string;
    category: string;
    rating: number;
    priceLevel: number;
    tags: string[];
    hours: string;
  }> {
    const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
    return places.map((p) => ({
      placeId: p.placeId,
      name: p.name,
      category: p.category,
      rating: p.rating,
      priceLevel: p.priceLevel,
      tags: p.tags,
      hours: p.openingHours
        ? `营业${p.openingHours.open}~${p.openingHours.close}` +
          (p.openingHours.closedDays.length
            ? `，周${p.openingHours.closedDays.map((d) => WEEK[d]).join('、')}闭馆`
            : '')
        : '全天',
    }));
  }

  private buildSystemPrompt(): string {
    return [
      '你是 TripAgent 的资深行程规划师。根据「旅行需求」与「可选择的景点目录」，输出一份完整的旅行日程 Itinerary JSON。',
      '【硬性规则】',
      '- 只能从「可选择的景点目录」中选择景点；activities[].placeId 必须来自目录的 placeId，严禁编造目录外的景点或 placeId。',
      '- 行程天数必须等于要求的 dayCount；每天按日期铺排，活动按时间先后排序（orderIndex 从 0 递增）。',
      '- 每天的活动时间不得重叠；相邻活动之间考虑交通（在 transportNote 注明衔接说明）。',
      '- 活动开始/结束时间必须落在景点 hours 的营业时间内；闭馆日（hours 中标明）不得安排该景点。',
      '- 节奏：relaxed 每天不超过 4 个主要活动；balanced 不超过 5；intensive 不超过 6。',
      '- 结合需求中的 preferences 安排对应类型活动；avoidPreferences 中的内容不得安排。',
      '- 每天至少安排一个住宿(hotel)活动，至少一次餐饮(dining)。',
      '- 预算：activity.cost 为每人每项费用（元），所有天活动费用之和尽量不超过总预算。',
      '【输出精简要求（重要，影响速度）】',
      '- 只输出必要字段；transportNote 用不超过 10 个字简述衔接方式；不要输出 note 字段。',
      '【JSON 结构】',
      JSON.stringify(
        {
          days: [
            {
              dayIndex: '0 起，与日期对应',
              date: 'YYYY-MM-DD',
              title: '当日主题（可选）',
              activities: [
                {
                  name: '景点名（必须与目录一致）',
                  placeId: '目录中的 placeId',
                  startTime: 'HH:mm',
                  endTime: 'HH:mm',
                  durationMin: '分钟数',
                  cost: '每人费用（元）',
                  category: '"sightseeing"|"dining"|"shopping"|"transport"|"hotel"|"other"',
                  transportNote: '衔接上一活动的交通说明（首项可省略）',
                },
              ],
            },
          ],
          notes: ['整份行程的说明文字'],
        },
        null,
        2,
      ),
      '你【只能】输出一个 JSON 对象，禁止输出其他文字、注释或 markdown。',
    ].join('\n');
  }

  // ===== 规范化 LLM 输出 =====
  private normalize(
    raw: { days?: Array<Record<string, unknown>>; notes?: unknown },
    ctx: {
      destination: string;
      startDate: string;
      endDate: string;
      dayCount: number;
      currency: string;
      totalBudget?: number;
      places: PlaceSummary[];
    },
  ): Itinerary {
    const rawDays = Array.isArray(raw.days) ? raw.days : [];

    const days: DayPlan[] = [];
    for (let i = 0; i < ctx.dayCount; i++) {
      const rawDay = rawDays[i] ?? {};
      const activities = this.normalizeActivities(rawDay.activities, i, ctx);
      days.push({
        dayIndex: i,
        date: this.dayDate(ctx, i),
        title: this.str(rawDay.title) || undefined,
        activities,
      });
    }

    return {
      destination: ctx.destination,
      startDate: ctx.startDate,
      endDate: ctx.endDate,
      days,
      notes: this.strArray(raw.notes),
      totalBudget: ctx.totalBudget,
      currency: ctx.currency,
      status: 'draft',
    };
  }

  private normalizeActivities(
    raw: unknown,
    dayIndex: number,
    ctx: { places: PlaceSummary[] },
  ): DayPlan['activities'] {
    if (!Array.isArray(raw)) return [];
    const out: DayPlan['activities'] = [];
    let order = 0;
    for (const a of raw) {
      if (typeof a !== 'object' || a === null) continue;
      const obj = a as Record<string, unknown>;
      const name = this.str(obj.name);
      if (!name) continue;
      const placeId = this.resolvePlaceId(obj.placeId, name, ctx.places);
      const startTime = this.timeOr(obj.startTime, '09:00');
      const endTime = this.timeOr(obj.endTime, '10:00');
      const durationMin = this.numOr(obj.durationMin, this.durationFromTimes(startTime, endTime));
      const place = ctx.places.find((p) => p.placeId === placeId);
      out.push({
        id: `act-${dayIndex + 1}-${order + 1}`,
        name,
        placeId,
        startTime,
        endTime,
        durationMin,
        cost: this.numOr(obj.cost, 0),
        category: this.enumOr<ActivityCategory>(obj.category, CATEGORIES, 'other'),
        transportNote: this.str(obj.transportNote) || undefined,
        orderIndex: order++,
        note: this.str(obj.note) || undefined,
        lat: place?.lat,
        lng: place?.lng,
      });
    }
    // 按开始时间排序，确保时间线有序
    return out.sort((x, y) => (x.startTime < y.startTime ? -1 : 1));
  }

  // placeId 未命中目录时，尝试按名称匹配目录景点（保证"只选目录"原则）
  private resolvePlaceId(placeId: unknown, name: string, places: PlaceSummary[]): string {
    const id = this.str(placeId);
    if (id && places.some((p) => p.placeId === id)) return id;
    const byName = places.find((p) => p.name === name);
    return byName?.placeId ?? (id || name);
  }

  private dayDate(ctx: { startDate: string }, i: number): string {
    const d = this.parseLocalDate(ctx.startDate);
    d.setDate(d.getDate() + i);
    return this.formatDate(d);
  }

  // 以本地时区解析 YYYY-MM-DD，避免 toISOString() 的 UTC 偏移导致日期错位
  private parseLocalDate(date: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 生成 "2026-10-01（周四）、2026-10-02（周五）…"，供 LLM 对照各景点闭馆日安排行程
  private dateWeekdays(startDate: string, dayCount: number): string {
    const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
    const start = this.parseLocalDate(startDate);
    return Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return `${this.formatDate(d)}（周${WEEK[d.getDay()]}）`;
    }).join('、');
  }

  private resolveDayCount(r: TravelRequirement): number {
    if (r.days && r.days > 0) return r.days;
    if (r.startDate && r.endDate) {
      const diff = Math.round((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86400000);
      if (diff >= 0) return diff + 1;
    }
    return 3;
  }

  private resolveStartDate(r: TravelRequirement): string {
    return r.startDate ?? this.formatDate(new Date());
  }

  private resolveEndDate(r: TravelRequirement, start: string, days: number): string {
    if (r.endDate) return r.endDate;
    const d = this.parseLocalDate(start);
    d.setDate(d.getDate() + days - 1);
    return this.formatDate(d);
  }

  private durationFromTimes(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if ([sh, sm, eh, em].some(Number.isNaN)) return 60;
    const diff = eh * 60 + em - (sh * 60 + sm);
    return diff > 0 ? diff : 60;
  }

  private timeOr(v: unknown, fallback: string): string {
    if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)) {
      const [h, m] = v.split(':').map(Number);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return fallback;
  }

  private str(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
  }

  private strArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  }

  private numOr(v: unknown, fallback: number): number {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }

  private enumOr<T extends string>(v: unknown, allowed: T[], fallback: T): T {
    return typeof v === 'string' && allowed.includes(v as T) ? (v as T) : fallback;
  }
}
