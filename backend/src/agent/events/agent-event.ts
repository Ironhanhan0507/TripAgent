import type { TravelRequirement } from '../types/travel-requirement.js';

// Agent 状态机（设计文档）：前端展示用，经 SSE 推送。
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
  | 'error';

// 事件模型（设计文档）：前端"过程状态"数据来源，不暴露 CoT。
// P1 仅使用 status / message / requirement / done / error，其余类型 P2 扩展。
export type AgentEvent =
  | { type: 'status'; state: AgentState }
  | { type: 'tool_call'; tool: string; message: string }
  | { type: 'tool_result'; tool: string; summary: string }
  | { type: 'message'; content: string }
  | { type: 'requirement'; requirement: TravelRequirement }
  | { type: 'plan'; itinerary: unknown }
  | { type: 'validation'; issues: unknown[]; attempt: number; maxAttempts: number }
  | { type: 'done'; itinerary: unknown | null }
  | { type: 'error'; message: string; code: string }
  // P4 优化：LLM 流式输出增量，前端可实时展示"生成进度"（不暴露完整 CoT，仅片段）
  | { type: 'stream'; text: string };

export const MAX_REPLAN_ATTEMPTS = 3;
