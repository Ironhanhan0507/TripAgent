// 与后端共享的类型定义（P0：认证相关）

export interface User {
  id: string
  email: string
  name: string | null
  avatar: string | null
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
  path?: string
  timestamp?: string
}

// ===== P1：Agent 对话 =====

// 结构化旅行需求（与后端 TravelRequirement 对齐）
export interface TravelRequirement {
  destination: string
  startDate: string | null // YYYY-MM-DD
  endDate: string | null
  days: number | null
  travelers: number | null
  budget: number | null
  currency: string
  preferences: string[]
  avoidPreferences: string[]
  travelPace: 'relaxed' | 'balanced' | 'intensive' | null
  transportationPreference: 'public' | 'walking' | 'taxi' | 'car' | 'mixed' | null
}

// Agent 状态机（SSE status 事件）
export type AgentState =
  | 'idle'
  | 'parsing'
  | 'searching'
  | 'routing'
  | 'costing'
  | 'planning'
  | 'validating'
  | 'replanning'
  | 'done'
  | 'needs_input'
  | 'error'

// SSE 事件（与后端 agent-event.ts 对齐）
export type AgentEvent =
  | { type: 'status'; state: AgentState }
  | { type: 'tool_call'; tool: string; message: string }
  | { type: 'tool_result'; tool: string; summary: string }
  | { type: 'message'; content: string }
  | { type: 'requirement'; requirement: TravelRequirement }
  | { type: 'plan'; itinerary: Itinerary }
  | { type: 'validation'; issues: ValidationIssue[]; attempt: number; maxAttempts: number }
  | { type: 'done'; itinerary: Itinerary | null }
  | { type: 'error'; message: string; code: string }
  | { type: 'stream'; text: string }

// 会话与消息（与后端 Prisma 模型对齐）
export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  kind: string // text | requirement | plan | ...
  content: string
  payload: TravelRequirement | null
  createdAt: string
}

export interface Conversation {
  id: string
  userId: string
  title: string
  createdAt: string
  updatedAt: string
  _count?: { messages: number }
  messages?: ChatMessage[]
}

// ===== P2：行程编排与校验 =====

export type ActivityCategory = 'sightseeing' | 'dining' | 'shopping' | 'transport' | 'hotel' | 'other'

export interface Activity {
  id: string
  name: string
  placeId: string
  startTime: string // HH:mm
  endTime: string // HH:mm
  durationMin: number
  cost: number
  category: ActivityCategory
  transportNote?: string
  orderIndex: number
  note?: string
  lat?: number
  lng?: number
}

export interface DayPlan {
  dayIndex: number // 0-based
  date: string // YYYY-MM-DD
  title?: string
  activities: Activity[]
}

export type ItineraryStatus = 'draft' | 'confirmed' | 'saved'

export interface Itinerary {
  id?: string
  destination: string
  startDate: string
  endDate: string
  days: DayPlan[]
  notes: string[]
  totalBudget?: number
  currency?: string
  status: ItineraryStatus
}

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
  | 'AVOIDED_ACTIVITY'

export interface ValidationIssue {
  code: ValidationIssueCode
  severity: 'error' | 'warning'
  message: string
  location: string // 如 Day1/Activity2
}

// ===== P4：已保存的行程（与后端 Prisma Itinerary 模型对齐） =====
export interface SavedTrip {
  id: string
  userId: string
  conversationId: string | null
  title: string
  destination: string
  startDate: string
  endDate: string
  totalBudget: number | null
  currency: string
  status: 'saved' | 'draft'
  version: number
  itineraryData: Itinerary
  requirement: TravelRequirement | null
  createdAt: string
  updatedAt: string
}

export interface SaveTripPayload {
  conversationId?: string
  title: string
  destination: string
  startDate: string
  endDate: string
  totalBudget?: number
  currency?: string
  status?: 'saved' | 'draft'
  itineraryData: Itinerary
  requirement?: TravelRequirement | null
}

export interface ReplanPayload {
  conversationId?: string
  note?: string
  itinerary: Itinerary
  requirement: TravelRequirement
}
