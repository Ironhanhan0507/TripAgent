// 结构化旅行需求（P1：Requirement Parser 输出，Structured Output 强约束）
// 字段缺失用 null 表示，配合澄清流程补全。

export type TravelPace = 'relaxed' | 'balanced' | 'intensive';
export type TransportationPreference = 'public' | 'walking' | 'taxi' | 'car' | 'mixed';

export interface TravelRequirement {
  destination: string;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  days: number | null; // 旅行天数（日期缺失时的兜底）
  travelers: number | null;
  budget: number | null;
  currency: string;
  preferences: string[];
  avoidPreferences: string[];
  travelPace: TravelPace | null;
  transportationPreference: TransportationPreference | null;
}

// 解析结果：含完整性判断与澄清问题（一次 LLM 调用输出）
export interface RequirementParseResult {
  requirement: TravelRequirement | null; // isComplete 时非空
  isComplete: boolean;
  missingFields: string[];
  clarifyingQuestions: string[];
}

// 关键字段判定（destination 必须明确；日期与天数至少其一）
export const REQUIREMENT_KEY_FIELDS: Array<keyof TravelRequirement> = [
  'destination',
  'startDate',
  'endDate',
  'days',
];
