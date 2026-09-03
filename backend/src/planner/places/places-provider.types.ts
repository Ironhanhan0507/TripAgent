import { ActivityCategory } from '../types/itinerary.js';

// ===== 景点类型（Provider 返回，真实数据原则：LLM 只选择，不编造） =====

// PlacesProvider 的 DI 注入 token（便于未来替换为真实 Provider 实现）
export const PLACES_PROVIDER = Symbol('PLACES_PROVIDER');

export interface PlaceOpeningHours {
  open: string; // HH:mm
  close: string; // HH:mm
  closedDays: number[]; // 0=周日 … 6=周六
}

export interface PlaceSummary {
  placeId: string;
  name: string;
  city: string;
  category: ActivityCategory;
  rating: number; // 1-5
  priceLevel: number; // 1-5
  tags: string[];
  lat: number;
  lng: number;
  address: string;
  // 营业时间（null=全天开放）：供 Planner 首轮规划即避开闭馆日/营业时间外
  openingHours: PlaceOpeningHours | null;
}

export interface PlaceDetail extends PlaceSummary {
  openingHours: PlaceOpeningHours | null;
  ticketPrice: number | null; // 元
  description: string;
}

export interface TransitResult {
  distanceKm: number;
  durationMin: number;
}

export interface CostEstimate {
  perDay: Array<{ category: string; amount: number }>;
  total: number;
  currency: string;
}

// ===== Provider 抽象：Mock ⇄ 真实可切换（P2 用 Mock） =====
export interface PlacesProvider {
  readonly name: string;
  searchPlaces(input: {
    query?: string;
    city: string;
    category?: ActivityCategory;
    limit?: number;
  }): Promise<PlaceSummary[]>;
  getPlaceDetail(placeId: string): Promise<PlaceDetail | null>;
  calculateTransit(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    mode?: string,
  ): Promise<TransitResult>;
  checkOpeningHours(
    placeId: string,
    date?: string,
  ): Promise<{ open: string; close: string; isOpenOnDate: boolean; note: string } | null>;
  estimateCost(input: {
    days: number;
    travelers: number;
    preferences: string[];
    budget?: number | null;
    currency?: string;
  }): Promise<CostEstimate>;
}
