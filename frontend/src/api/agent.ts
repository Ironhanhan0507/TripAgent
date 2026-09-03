import client from './client'
import { tokenStorage } from './token'
import type { AgentEvent, ChatMessage, Conversation } from '@/types'

// 会话 CRUD
export const conversationsApi = {
  create: (title?: string) =>
    client.post<Conversation>('/api/v1/conversations', { title }).then((r) => r.data),
  list: () => client.get<Conversation[]>('/api/v1/conversations').then((r) => r.data),
  detail: (id: string) =>
    client
      .get<Conversation & { messages: ChatMessage[] }>(`/api/v1/conversations/${id}`)
      .then((r) => r.data),
  remove: (id: string) => client.delete(`/api/v1/conversations/${id}`).then((r) => r.data),
}

// POST /agent/plan（SSE）：原生 fetch 流式解析事件。
// 不用 axios：streaming 响应在浏览器端需要逐块读取，fetch ReadableStream 更直接。
export async function streamPlan(
  conversationId: string,
  message: string,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/v1/agent/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenStorage.access ?? ''}`,
    },
    body: JSON.stringify({ conversationId, message }),
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

    // SSE 帧以空行分隔，每帧为 "data: {json}"
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
