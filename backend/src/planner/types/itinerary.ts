// ===== P2：行程编排（Planner 输出）与校验类型 =====
// 与设计文档 9 节核心数据结构对齐。

export type ActivityCategory =
  | 'sightseeing'
  | 'dining'
  | 'shopping'
  | 'transport'
  | 'hotel'
  | 'other';

export interface Activity {
  id: string;
  name: string;
  placeId: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMin: number;
  cost: number;
  category: ActivityCategory;
  transportNote?: string; // 衔接上一活动的交通说明
  orderIndex: number;
  note?: string;
  lat?: number; // 地图渲染坐标（Planner 从景点目录注入）
  lng?: number;
}

export interface DayPlan {
  dayIndex: number; // 0-based（展示时 +1）
  date: string; // YYYY-MM-DD
  title?: string;
  activities: Activity[];
}

export type ItineraryStatus = 'draft' | 'confirmed' | 'saved';

export interface Itinerary {
  id?: string;
  destination: string;
  startDate: string;
  endDate: string;
  days: DayPlan[];
  notes: string[];
  totalBudget?: number;
  currency?: string;
  status: ItineraryStatus;
}

// ===== 校验 =====
export type ValidationIssueCode =
  | 'TIME_CONFLICT'
  | 'OUTSIDE_OPENING_HOURS'
  | 'UNREASONABLE_TRANSIT'
  | 'TOO_MANY_ACTIVITIES'
  | 'DAY_TOO_LONG'
  | 'DAY_BUDGET_OVER'
  | 'TOTAL_BUDGET_OVER'
  | 'DETOUR_ROUTE'
  | 'MISMATCH_PREFERENCE'
  | 'AVOIDED_ACTIVITY';

export interface ValidationIssue {
  code: ValidationIssueCode;
  severity: 'error' | 'warning';
  message: string;
  location: string; // 如 Day1/Activity2
}

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
}
