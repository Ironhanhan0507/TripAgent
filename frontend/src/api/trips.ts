import client from './client'
import { tokenStorage } from './token'
import type { Activity, AgentEvent, Itinerary, ReplanPayload, SavedTrip, SaveTripPayload, ValidationIssue } from '@/types'

// P4：已保存行程 CRUD + 增量重规划。
export const tripsApi = {
  save: (payload: SaveTripPayload) =>
    client.post<SavedTrip>('/api/v1/itineraries', payload).then((r) => r.data),
  list: () => client.get<SavedTrip[]>('/api/v1/itineraries').then((r) => r.data),
  detail: (id: string) =>
    client.get<SavedTrip>(`/api/v1/itineraries/${id}`).then((r) => r.data),
  update: (id: string, payload: Partial<SaveTripPayload> & { title?: string }) =>
    client.patch<SavedTrip>(`/api/v1/itineraries/${id}`, payload).then((r) => r.data),
  remove: (id: string) => client.delete(`/api/v1/itineraries/${id}`).then((r) => r.data),
  // 编辑单个活动（dayId 对应 DayPlan.dayIndex）
  updateActivity: (id: string, dayId: number, activityId: string, patch: Partial<Activity>) =>
    client.put<SavedTrip>(`/api/v1/itineraries/${id}/days/${dayId}/activities/${activityId}`, patch).then((r) => r.data),
  // 手动触发校验：可选携带当前草稿，未携带则校验已保存版本
  validate: (id: string, itinerary?: Itinerary) =>
    client
      .post<{ version: number; passed: boolean; issues: ValidationIssue[] }>(`/api/v1/itineraries/${id}/validate`, { itinerary })
      .then((r) => r.data),
}

// POST /agent/replan（SSE）：编辑后的行程 + 需求 → 增量重规划。
// 与 streamPlan 相同的流式解析逻辑。
export async function streamReplan(
  payload: ReplanPayload,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/v1/agent/replan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenStorage.access ?? ''}`,
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!res.ok || !res.body) {
    let msg = `请求失败（${res.status}）`
    try {
      const body = (await res.json()) as { message?: string }
      if (body?.message) msg = body.message
    } catch {
      /* 非 JSON 错误体则用默认文案 */
    }
    throw new Error(msg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))
      if (!dataLine) continue
      try {
        onEvent(JSON.parse(dataLine.slice(6)) as AgentEvent)
      } catch {
        /* 忽略无法解析的帧 */
      }
    }
  }
}
