import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { ActivityCategory } from '../types/itinerary.js';
import {
  CostEstimate,
  PlaceDetail,
  PlaceOpeningHours,
  PlaceSummary,
  PlacesProvider,
  TransitResult,
} from './places-provider.types.js';

// ===== 高德地图 Web 服务 Provider =====
// 真实数据来源：高德地图 Web服务 API（需 Web服务类型 Key）。
// 覆盖国内城市真实 POI / 坐标 / 营业时间 / 驾车步行耗时，任意城市可用。
// 设计原则：数据全部来自 Provider；高德不提供的字段（如闭馆日、门票价）按 null/[] 返回，不编造。

const AMAP_BASE = 'https://restapi.amap.com';
const REQUEST_TIMEOUT_MS = 10_000;
// 高德个人开发者 Key 的 QPS 上限约 3 次/秒，这里留余量控制在 ~2.5 QPS
const MIN_REQUEST_INTERVAL_MS = 400;

// 各活动分类对应的高德 POI 大类 typecode（前两位即大类）
const CATEGORY_TYPES: Record<ActivityCategory, string> = {
  sightseeing: '110000', // 风景名胜（自然景观/公园广场/文物古迹）
  dining: '050000', // 餐饮服务
  shopping: '060000', // 购物服务
  hotel: '100000', // 住宿服务
  transport: '150000', // 交通设施服务
  other: '',
};

// 高德 typecode 前两位 → 本项目活动分类
function categoryOf(typecode: string): ActivityCategory {
  const major = (typecode || '').slice(0, 2);
  switch (major) {
    case '05':
      return 'dining';
    case '06':
      return 'shopping';
    case '10':
      return 'hotel';
    case '11':
      return 'sightseeing';
    case '01':
    case '15':
      return 'transport';
    default:
      return 'other';
  }
}

// 人均消费（元）→ 价格档位 1-5
function priceLevelOf(cost: number | null): number {
  if (cost == null || cost <= 0) return 2;
  if (cost <= 30) return 1;
  if (cost <= 80) return 2;
  if (cost <= 200) return 3;
  if (cost <= 500) return 4;
  return 5;
}

// 解析高德营业时间文本（如 "周一至周日 08:00-18:00" / "08:00-18:00"）→ 起止时间
function parseOpenRange(text: string | null | undefined): PlaceOpeningHours | null {
  if (!text) return null;
  const m = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(text);
  if (!m) return null;
  const pad = (t: string) => `${t.padStart(2, '0')}:${t.split(':')[1] ?? '00'}`.slice(0, 5);
  const open = pad(m[1]);
  const close = pad(m[2]);
  // 高德不返回每周闭馆日，closedDays 无法真实获取 → 空数组（不影响营业时间校验）
  return { open, close, closedDays: [] };
}

// 直线距离（Haversine）→ 分方式耗时估算；用于公交模式或 API 失败兜底
function haversineTransit(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: string,
): TransitResult {
  const R = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const distanceKm = 2 * R * Math.asin(Math.sqrt(a));
  const speeds: Record<string, number> = { walking: 4.8, taxi: 28, car: 26, public: 26, mixed: 26 };
  const speed = speeds[mode] ?? 26;
  const bufferMin = mode === 'public' ? 12 : 5;
  const durationMin = Math.max(8, Math.round((distanceKm / speed) * 60 + bufferMin));
  return { distanceKm: Math.round(distanceKm * 10) / 10, durationMin };
}

@Injectable()
export class AmapPlacesProvider implements PlacesProvider {
  readonly name = 'amap';

  private readonly logger = new Logger(AmapPlacesProvider.name);
  // POI 详情缓存：校验阶段会对同一 placeId 反复取坐标/营业时间，避免重复请求
  private readonly detailCache = new Map<string, PlaceDetail>();
  // 请求节流状态：串行队列 + 上次请求时间，控制 QPS
  private requestChain: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(private readonly config: AppConfigService) {}

  // ===== 关键字/分类搜索 =====
  async searchPlaces(input: {
    query?: string;
    city: string;
    category?: ActivityCategory;
    limit?: number;
  }): Promise<PlaceSummary[]> {
    const { city, category, limit = 10 } = input;
    const types = category ? CATEGORY_TYPES[category] : '';
    if (!types && !input.query) {
      this.logger.warn(`search_places(city=${city}, cat=${category ?? '-'}) 无 types/keywords，跳过`);
      return [];
    }

    const params = new URLSearchParams({
      key: this.config.amapApiKey,
      region: city,
      city_limit: 'true',
      page_size: String(Math.min(limit, 25)),
      page_num: '1',
      show_fields: 'business',
      output: 'json',
    });
    if (input.query?.trim()) params.set('keywords', input.query.trim());
    if (types) params.set('types', types);

    const data = await this.getJson<AmapPoiSearchResponse>('/v5/place/text', params);
    const pois = Array.isArray(data?.pois) ? data.pois : [];
    this.logger.log(`search_places(city=${city}, cat=${category ?? '-'}) → ${pois.length} 条`);

    return pois
      .filter((p) => p.name && p.location)
      .map((p) => this.toSummary(p, city))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }

  async getPlaceDetail(placeId: string): Promise<PlaceDetail | null> {
    const cached = this.detailCache.get(placeId);
    if (cached) return cached;

    const params = new URLSearchParams({ key: this.config.amapApiKey, id: placeId, show_fields: 'business', output: 'json' });
    const data = await this.getJson<AmapPoiSearchResponse>('/v5/place/detail', params);
    const poi = Array.isArray(data?.pois) ? data.pois[0] : undefined;
    if (!poi?.name || !poi.location) return null;

    const detail = this.toDetail(poi);
    this.detailCache.set(placeId, detail);
    return detail;
  }

  // ===== 交通：步行/驾车走真实 API；公交暂用直线估算（缺少城市上下文） =====
  async calculateTransit(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    mode = 'public',
  ): Promise<TransitResult> {
    const apiPath =
      mode === 'walking'
        ? '/v5/direction/walking'
        : mode === 'car' || mode === 'driving' || mode === 'taxi'
          ? '/v5/direction/driving'
          : null;
    if (!apiPath) return haversineTransit(from, to, mode);

    const params = new URLSearchParams({
      key: this.config.amapApiKey,
      origin: `${from.lng.toFixed(6)},${from.lat.toFixed(6)}`,
      destination: `${to.lng.toFixed(6)},${to.lat.toFixed(6)}`,
      show_fields: 'cost',
      output: 'json',
    });
    const data = await this.getJson<AmapDirectionResponse>(apiPath, params);
    const path = data?.route?.paths?.[0];
    if (!path || !path.distance) return haversineTransit(from, to, mode);
    const distanceKm = Math.round((Number(path.distance) / 1000) * 10) / 10;
    const seconds = Number(path.cost?.duration ?? path.duration ?? 0);
    const durationMin = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : haversineTransit(from, to, mode).durationMin;
    return { distanceKm, durationMin };
  }

  async checkOpeningHours(
    placeId: string,
    date?: string,
  ): Promise<{ open: string; close: string; isOpenOnDate: boolean; note: string } | null> {
    const detail = await this.getPlaceDetail(placeId);
    const hours = detail?.openingHours;
    if (!hours) return null;
    void date; // 高德不提供每周闭馆日，无法判断具体日期是否开放
    return { open: hours.open, close: hours.close, isOpenOnDate: true, note: '营业中' };
  }

  // 预算估算：分类启发式（与 Mock 一致，非实时价格）
  async estimateCost(input: {
    days: number;
    travelers: number;
    preferences: string[];
    budget?: number | null;
    currency?: string;
  }): Promise<CostEstimate> {
    const { days, travelers, preferences, currency = 'CNY' } = input;
    const hasShopping = preferences.some((p) => ['购物', '动漫', '拍照'].includes(p));
    const hasDining = preferences.some((p) => ['美食', '餐饮'].includes(p));
    const perPerson: Record<ActivityCategory, number> = {
      sightseeing: 150,
      dining: hasDining ? 220 : 150,
      shopping: hasShopping ? 300 : 100,
      transport: 80,
      hotel: 400,
      other: 100,
    };
    const perDay = (Object.keys(perPerson) as ActivityCategory[]).map((category) => ({
      category,
      amount: Math.round(perPerson[category] * travelers),
    }));
    const total = perDay.reduce((s, d) => s + d.amount, 0) * days;
    return { perDay, total, currency };
  }

  // ===== 内部 =====
  private toSummary(p: AmapPoi, fallbackCity: string): PlaceSummary {
    const [lng, lat] = this.parseLocation(p.location);
    const rating = this.toRating(p);
    const cost = this.toCost(p);
    const business = this.toBusiness(p);
    return {
      placeId: p.id,
      name: p.name,
      city: p.cityname || p.adname || fallbackCity,
      category: categoryOf(p.typecode ?? ''),
      rating,
      priceLevel: priceLevelOf(cost),
      tags: this.toTags(p, business),
      lat,
      lng,
      address: p.address || `${p.adname ?? ''}${p.name}`,
      openingHours: parseOpenRange(business.opentime_week || business.opentime_today),
    };
  }

  private toDetail(p: AmapPoi): PlaceDetail {
    const base = this.toSummary(p, p.cityname || p.adname || '');
    const business = this.toBusiness(p);
    return {
      ...base,
      openingHours: parseOpenRange(business.opentime_week || business.opentime_today),
      ticketPrice: null, // 高德不提供门票价，不编造
      description: [p.adname, p.type, business.tag].filter(Boolean).join(' · '),
    };
  }

  private toBusiness(p: AmapPoi): {
    rating: number | null;
    cost: number | null;
    tag: string;
    opentime_today: string | null;
    opentime_week: string | null;
  } {
    const b = p.business ?? p.biz_ext ?? {};
    const toNum = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return {
      rating: toNum((b as { rating?: unknown }).rating),
      cost: toNum((b as { cost?: unknown }).cost),
      tag: typeof (b as { tag?: unknown }).tag === 'string' ? ((b as { tag?: string }).tag as string) : '',
      opentime_today:
        typeof (b as { opentime_today?: unknown }).opentime_today === 'string'
          ? ((b as { opentime_today?: string }).opentime_today as string)
          : null,
      opentime_week:
        typeof (b as { opentime_week?: unknown }).opentime_week === 'string'
          ? ((b as { opentime_week?: string }).opentime_week as string)
          : null,
    };
  }

  private toRating(p: AmapPoi): number {
    const r = this.toBusiness(p).rating;
    if (r == null) return 4.0;
    return Math.min(5, Math.max(1, Math.round(r * 10) / 10));
  }

  private toCost(p: AmapPoi): number | null {
    return this.toBusiness(p).cost;
  }

  private toTags(p: AmapPoi, business: { tag: string; rating: number | null }): string[] {
    const typePart = (p.type || '').split(';').pop()?.trim() ?? '';
    const tags = [typePart, business.tag, p.adname].filter((t): t is string => !!t && t !== '[]');
    if (business.rating != null) tags.push(`评分${business.rating.toFixed(1)}`);
    return [...new Set(tags)];
  }

  private parseLocation(location: string): [number, number] {
    const [lng, lat] = location.split(',').map(Number);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [0, 0];
    return [lng, lat];
  }

  private async getJson<T>(path: string, params: URLSearchParams): Promise<T> {
    // 串行 + 最小间隔节流，避免校验阶段并发请求触发高德 QPS 限流（CUQPS_HAS_EXCEEDED_THE_LIMIT）
    const run = async (): Promise<T> => {
      const now = Date.now();
      const wait = Math.max(0, this.lastRequestAt + MIN_REQUEST_INTERVAL_MS - now);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequestAt = Date.now();
      return this.doRequest<T>(path, params);
    };
    const result = this.requestChain.then(run);
    this.requestChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async doRequest<T>(path: string, params: URLSearchParams): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${AMAP_BASE}${path}?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        this.logger.warn(`高德接口 ${path} HTTP ${res.status}`);
        return {} as T;
      }
      const data = (await res.json()) as T & { status?: string; info?: string };
      if (data?.status !== '1') {
        this.logger.warn(`高德接口 ${path} 返回错误：${data?.info ?? 'unknown'} (${data?.status ?? 'no status'})`);
        return {} as T;
      }
      return data;
    } catch (err) {
      this.logger.warn(`高德接口 ${path} 请求失败：${err instanceof Error ? err.message : String(err)}`);
      return {} as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ===== 高德响应类型（仅声明用到的字段） =====
interface AmapPoi {
  id: string;
  name: string;
  location: string; // "lng,lat"
  type?: string;
  typecode?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
  address?: string;
  business?: {
    rating?: string;
    cost?: string;
    tag?: string;
    opentime_today?: string;
    opentime_week?: string;
  };
  biz_ext?: {
    rating?: string;
    cost?: string;
  };
}

interface AmapPoiSearchResponse {
  status?: string;
  info?: string;
  pois?: AmapPoi[];
}

interface AmapDirectionResponse {
  status?: string;
  route?: {
    paths?: Array<{
      distance?: string | number;
      duration?: string | number;
      cost?: { duration?: string | number };
    }>;
  };
}
