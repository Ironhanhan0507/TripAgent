import { Inject, Injectable, Logger } from '@nestjs/common';
import { TravelRequirement } from '../agent/types/travel-requirement.js';
import { PLACES_PROVIDER } from './places/places-provider.types.js';
import type { PlacesProvider } from './places/places-provider.types.js';
import { Activity, Itinerary, ValidationIssue, ValidationResult } from './types/itinerary.js';

// 时间工具：'HH:mm' → 分钟
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Validator：对 Planner 输出的 Itinerary 执行 10 项校验（设计文档 §6 行程验证）。
// 规则分类：error（必须修复 → 触发 Replan）/ warning（提示性，不阻塞）。
// 数据来源：交通/营业时间/位置均来自 PlacesProvider，保证与 Planner 使用同一真实数据。
@Injectable()
export class Validator {
  private readonly logger = new Logger(Validator.name);

  constructor(@Inject(PLACES_PROVIDER) private readonly places: PlacesProvider) {}

  async validate(itinerary: Itinerary, requirement: TravelRequirement): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    await this.checkTimeConflicts(itinerary, issues);
    await this.checkOpeningHours(itinerary, issues);
    await this.checkTransit(itinerary, requirement, issues);
    this.checkActivityCount(itinerary, requirement, issues);
    this.checkDayLength(itinerary, issues);
    this.checkDayBudget(itinerary, requirement, issues);
    this.checkTotalBudget(itinerary, requirement, issues);
    await this.checkDetour(itinerary, issues);
    this.checkPreferences(itinerary, requirement, issues);
    this.checkAvoided(itinerary, requirement, issues);

    const passed = !issues.some((i) => i.severity === 'error');
    this.logger.log(
      `validate → ${issues.length} 项问题（${issues.filter((i) => i.severity === 'error').length} error）passed=${passed}\n${issues
        .map((i) => `  [${i.severity}] ${i.code} ${i.location}: ${i.message}`)
        .join('\n')}`,
    );
    return { passed, issues };
  }

  // R1 TIME_CONFLICT：同一天活动时间重叠（酒店除外，作为过夜安排）
  private async checkTimeConflicts(itinerary: Itinerary, issues: ValidationIssue[]): Promise<void> {
    for (const day of itinerary.days) {
      const acts = day.activities
        .filter((a) => a.category !== 'hotel')
        .sort((x, y) => toMin(x.startTime) - toMin(y.startTime));
      for (let i = 1; i < acts.length; i++) {
        const prev = acts[i - 1];
        const curr = acts[i];
        if (toMin(prev.endTime) > toMin(curr.startTime)) {
          issues.push({
            code: 'TIME_CONFLICT',
            severity: 'error',
            message: `${prev.name}（${prev.startTime}~${prev.endTime}）与 ${curr.name}（${curr.startTime}~${curr.endTime}）时间重叠`,
            location: this.loc(day, curr),
          });
        }
      }
    }
  }

  // R2 OUTSIDE_OPENING_HOURS：活动时段超出景点营业时间，或安排在了闭馆日
  private async checkOpeningHours(itinerary: Itinerary, issues: ValidationIssue[]): Promise<void> {
    for (const day of itinerary.days) {
      for (const act of day.activities) {
        if (act.category === 'hotel' || act.category === 'transport') continue;
        const info = await this.places.checkOpeningHours(act.placeId, day.date);
        if (!info) continue;
        if (!info.isOpenOnDate) {
          issues.push({
            code: 'OUTSIDE_OPENING_HOURS',
            severity: 'error',
            message: `${act.name} 在 ${day.date} ${info.note}，无法安排`,
            location: this.loc(day, act),
          });
          continue;
        }
        if (toMin(act.startTime) < toMin(info.open) || toMin(act.endTime) > toMin(info.close)) {
          issues.push({
            code: 'OUTSIDE_OPENING_HOURS',
            severity: 'error',
            message: `${act.name}（${act.startTime}~${act.endTime}）超出营业时间 ${info.open}~${info.close}`,
            location: this.loc(day, act),
          });
        }
      }
    }
  }

  // R3 UNREASONABLE_TRANSIT：相邻活动间隙不足以完成两地交通
  private async checkTransit(
    itinerary: Itinerary,
    requirement: TravelRequirement,
    issues: ValidationIssue[],
  ): Promise<void> {
    const mode = requirement.transportationPreference ?? 'public';
    for (const day of itinerary.days) {
      const acts = day.activities
        .filter((a) => a.category !== 'hotel')
        .sort((x, y) => toMin(x.startTime) - toMin(y.startTime));
      for (let i = 1; i < acts.length; i++) {
        const prev = acts[i - 1];
        const curr = acts[i];
        if (prev.category === 'transport' || curr.category === 'transport') continue;
        const from = await this.placeLatLng(prev.placeId);
        const to = await this.placeLatLng(curr.placeId);
        if (!from || !to) continue;
        const transit = await this.places.calculateTransit(from, to, mode);
        const gap = toMin(curr.startTime) - toMin(prev.endTime);
        if (gap < transit.durationMin) {
          issues.push({
            code: 'UNREASONABLE_TRANSIT',
            severity: 'error',
            message: `${prev.name} → ${curr.name} 需交通约 ${transit.durationMin} 分钟，但仅有 ${gap} 分钟间隙`,
            location: this.loc(day, curr),
          });
        }
      }
    }
  }

  // R4 TOO_MANY_ACTIVITIES：每日主要活动数超过节奏上限
  private checkActivityCount(itinerary: Itinerary, requirement: TravelRequirement, issues: ValidationIssue[]): void {
    const limit = { relaxed: 4, balanced: 5, intensive: 6 }[requirement.travelPace ?? 'balanced'] ?? 5;
    for (const day of itinerary.days) {
      const main = day.activities.filter((a) => a.category !== 'hotel' && a.category !== 'transport').length;
      if (main > limit) {
        issues.push({
          code: 'TOO_MANY_ACTIVITIES',
          severity: 'warning',
          message: `当日主要活动 ${main} 项，超过${limit} 项上限（节奏：${requirement.travelPace ?? 'balanced'}）`,
          location: this.locDay(day),
        });
      }
    }
  }

  // R5 DAY_TOO_LONG：一天从首活动到末活动总时长过长
  private checkDayLength(itinerary: Itinerary, issues: ValidationIssue[]): void {
    const MAX_SPAN = 14 * 60; // 14 小时
    for (const day of itinerary.days) {
      const acts = day.activities
        .filter((a) => a.category !== 'hotel')
        .sort((x, y) => toMin(x.startTime) - toMin(y.startTime));
      if (acts.length < 2) continue;
      const span = toMin(acts[acts.length - 1].endTime) - toMin(acts[0].startTime);
      if (span > MAX_SPAN) {
        issues.push({
          code: 'DAY_TOO_LONG',
          severity: 'warning',
          message: `当天活动从 ${acts[0].startTime} 到 ${acts[acts.length - 1].endTime}（约 ${Math.round(span / 60)} 小时），过于紧凑`,
          location: this.locDay(day),
        });
      }
    }
  }

  // R6 DAY_BUDGET_OVER：单日活动费用超出日均预算（人均）
  private checkDayBudget(itinerary: Itinerary, requirement: TravelRequirement, issues: ValidationIssue[]): void {
    const budget = itinerary.totalBudget ?? requirement.budget;
    if (budget == null || itinerary.days.length === 0) return;
    const perDay = budget / itinerary.days.length;
    for (const day of itinerary.days) {
      const sum = day.activities.reduce((s, a) => s + a.cost, 0);
      if (sum > perDay * 1.15) {
        issues.push({
          code: 'DAY_BUDGET_OVER',
          severity: 'warning',
          message: `当日人均花费约 ${Math.round(sum)} 元，超过日均预算 ${Math.round(perDay)} 元`,
          location: this.locDay(day),
        });
      }
    }
  }

  // R7 TOTAL_BUDGET_OVER：行程总费用超出总预算
  private checkTotalBudget(itinerary: Itinerary, requirement: TravelRequirement, issues: ValidationIssue[]): void {
    const budget = itinerary.totalBudget ?? requirement.budget;
    if (budget == null) return;
    const travelers = requirement.travelers ?? 1;
    const total = itinerary.days.reduce((s, d) => s + d.activities.reduce((x, a) => x + a.cost, 0), 0) * travelers;
    if (total > budget * 1.1) {
      issues.push({
        code: 'TOTAL_BUDGET_OVER',
        severity: 'warning',
        message: `行程总费用约 ${Math.round(total)} 元（${travelers} 人），超出预算 ${budget} 元`,
        location: '全程',
      });
    }
  }

  // R8 DETOUR_ROUTE：当日路径往返绕路（累计移动距离远超首尾直线）
  private async checkDetour(itinerary: Itinerary, issues: ValidationIssue[]): Promise<void> {
    for (const day of itinerary.days) {
      const acts = day.activities
        .filter((a) => a.category !== 'hotel' && a.category !== 'transport')
        .sort((x, y) => toMin(x.startTime) - toMin(y.startTime));
      if (acts.length < 3) continue;
      const points: Array<{ lat: number; lng: number }> = [];
      for (const a of acts) {
        const p = await this.placeLatLng(a.placeId);
        if (!p) {
          points.length = 0;
          break;
        }
        points.push(p);
      }
      if (points.length < acts.length) continue;
      let path = 0;
      for (let i = 1; i < points.length; i++) {
        path += (await this.places.calculateTransit(points[i - 1], points[i], 'walking')).distanceKm;
      }
      const direct = (await this.places.calculateTransit(points[0], points[points.length - 1], 'walking')).distanceKm;
      if (path > direct * 2.2 + 5) {
        issues.push({
          code: 'DETOUR_ROUTE',
          severity: 'warning',
          message: `当天路线存在明显折返（累计 ${Math.round(path)}km，首尾仅 ${Math.round(direct)}km），建议调整顺序`,
          location: this.locDay(day),
        });
      }
    }
  }

  // R9 MISMATCH_PREFERENCE：偏好未在行程中得到体现
  private checkPreferences(itinerary: Itinerary, requirement: TravelRequirement, issues: ValidationIssue[]): void {
    const allActs = itinerary.days.flatMap((d) => d.activities);
    const nameTags = new Set<string>();
    for (const a of allActs) {
      nameTags.add(a.name.toLowerCase());
      for (const t of this.tagsOf(a)) nameTags.add(t.toLowerCase());
    }
    const mapping: Record<string, (c: Activity) => boolean> = {
      美食: (a) => a.category === 'dining',
      餐饮: (a) => a.category === 'dining',
      购物: (a) => a.category === 'shopping',
      历史: (a) => a.category === 'sightseeing' && /历史|古迹|博物馆/.test(a.name),
      古迹: (a) => a.category === 'sightseeing' && /历史|古迹/.test(a.name),
      自然: (a) => a.category === 'sightseeing' && /公园|自然|园|山/.test(a.name),
      拍照: (a) => a.category === 'sightseeing' || a.category === 'shopping',
      夜景: (a) => /夜景|观景台/.test(a.name),
      休闲: (a) => /公园|茶社|街区|休闲/.test(a.name),
      亲子: (a) => /熊猫|动物园|公园/.test(a.name),
    };
    for (const pref of requirement.preferences) {
      const matcher = mapping[pref];
      if (!matcher) continue;
      if (!allActs.some(matcher)) {
        issues.push({
          code: 'MISMATCH_PREFERENCE',
          severity: 'warning',
          message: `偏好「${pref}」在行程中未体现，建议补充对应活动`,
          location: '全程',
        });
      }
    }
    void nameTags;
  }

  // R10 AVOIDED_ACTIVITY：安排了应避免的内容
  private checkAvoided(itinerary: Itinerary, requirement: TravelRequirement, issues: ValidationIssue[]): void {
    if (!requirement.avoidPreferences.length) return;
    for (const day of itinerary.days) {
      for (const act of day.activities) {
        const haystack = [act.name, ...this.tagsOf(act)].join(' ').toLowerCase();
        for (const avoid of requirement.avoidPreferences) {
          if (!avoid.trim()) continue;
          if (haystack.includes(avoid.trim().toLowerCase())) {
            issues.push({
              code: 'AVOIDED_ACTIVITY',
              severity: 'error',
              message: `已安排「${act.name}」，与您希望避开的「${avoid}」冲突`,
              location: this.loc(day, act),
            });
            break;
          }
        }
      }
    }
  }

  // ===== 工具 =====
  private async placeLatLng(placeId: string) {
    const detail = await this.places.getPlaceDetail(placeId);
    return detail ? { lat: detail.lat, lng: detail.lng } : null;
  }

  private tagsOf(act: Activity): string[] {
    return [act.category, act.transportNote ?? ''];
  }

  private loc(day: { dayIndex: number }, act: Activity): string {
    return `Day${day.dayIndex + 1}/Activity${act.orderIndex + 1}`;
  }

  private locDay(day: { dayIndex: number }): string {
    return `Day${day.dayIndex + 1}`;
  }
}
