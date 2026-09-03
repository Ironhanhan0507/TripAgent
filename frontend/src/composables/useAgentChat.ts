import { ref } from 'vue'
import { conversationsApi, streamPlan } from '@/api/agent'
import type { AgentState, Conversation, Itinerary, TravelRequirement, ValidationIssue } from '@/types'

// 本地渲染用消息模型（SSE 流式累积）
export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  kind: string // text | requirement | itinerary | ...
  payload: TravelRequirement | Itinerary | null
}

// 一次校验快照（Plan→Validate→Replan 循环中的每轮结果）
export interface ValidationSnapshot {
  attempt: number
  issues: ValidationIssue[]
}

let uid = 0

// Agent 对话状态机：管理会话列表、消息流、SSE 事件与行程规划状态。
export function useAgentChat() {
  const conversations = ref<Conversation[]>([])
  const conversationId = ref<string | null>(null)
  const messages = ref<UiMessage[]>([])
  const requirement = ref<TravelRequirement | null>(null)
  const itinerary = ref<Itinerary | null>(null)
  const issues = ref<ValidationIssue[]>([])
  const validationHistory = ref<ValidationSnapshot[]>([])
  const state = ref<AgentState>('idle')
  const sending = ref(false)
  const loadingList = ref(false)
  const error = ref('')
  // LLM 流式生成进度（P4 优化：实时展示生成中的内容片段）
  const streamingText = ref('')

  async function loadConversations() {
    loadingList.value = true
    try {
      conversations.value = await conversationsApi.list()
    } finally {
      loadingList.value = false
    }
  }

  async function createConversation(): Promise<string> {
    const conv = await conversationsApi.create()
    await loadConversations()
    return conv.id
  }

  async function openConversation(id: string) {
    conversationId.value = id
    requirement.value = null
    itinerary.value = null
    issues.value = []
    validationHistory.value = []
    state.value = 'idle'
    error.value = ''
    streamingText.value = ''
    const detail = await conversationsApi.detail(id)
    messages.value = (detail.messages ?? [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        kind: m.kind,
        payload: m.payload as TravelRequirement | Itinerary | null,
      }))
    // 恢复会话最近一次解析出的需求与行程（用于右侧计划面板）
    const lastReq = [...messages.value].reverse().find((m) => m.kind === 'requirement')
    requirement.value = (lastReq?.payload as TravelRequirement | null) ?? null
    const lastItin = [...messages.value].reverse().find((m) => m.kind === 'itinerary')
    itinerary.value = (lastItin?.payload as Itinerary | null) ?? null
  }

  async function deleteConversation(id: string) {
    await conversationsApi.remove(id)
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (conversationId.value === id) {
      conversationId.value = null
      messages.value = []
      requirement.value = null
      itinerary.value = null
      issues.value = []
      validationHistory.value = []
      state.value = 'idle'
      streamingText.value = ''
    }
  }

  // 发送一条消息并驱动 Agent 编排（SSE）
  async function send(text: string) {
    const content = text.trim()
    if (!content || sending.value) return
    error.value = ''

    try {
      if (!conversationId.value) {
        conversationId.value = await createConversation()
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '创建会话失败'
      return
    }

    const cid = conversationId.value!
    messages.value.push({ id: `local-${uid++}`, role: 'user', content, kind: 'text', payload: null })
    const assistant: UiMessage = { id: `local-${uid++}`, role: 'assistant', content: '', kind: 'text', payload: null }
    messages.value.push(assistant)

    sending.value = true
    state.value = 'parsing'
    streamingText.value = ''
    const controller = new AbortController()

    try {
      await streamPlan(cid, content, (event) => {
        switch (event.type) {
          case 'status':
            state.value = event.state
            break
          case 'stream':
            // 追加 LLM 生成中的文本片段（进度展示，不覆盖正式消息）
            streamingText.value += event.text
            break
          case 'message':
            assistant.content += event.content
            break
          case 'requirement':
            requirement.value = event.requirement
            assistant.kind = 'requirement'
            assistant.payload = event.requirement
            break
          case 'plan':
            itinerary.value = event.itinerary
            break
          case 'validation':
            issues.value = event.issues
            validationHistory.value = [
              ...validationHistory.value.filter((v) => v.attempt !== event.attempt),
              { attempt: event.attempt, issues: event.issues },
            ]
            break
          case 'done':
            streamingText.value = ''
            if (event.itinerary) {
              itinerary.value = event.itinerary
              assistant.kind = 'itinerary'
              assistant.payload = event.itinerary
            }
            break
          case 'error':
            assistant.content += (assistant.content ? '\n\n' : '') + `⚠ ${event.message}`
            break
          default:
            break
        }
      }, controller.signal)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      const msg = e instanceof Error ? e.message : '请求失败'
      assistant.content += (assistant.content ? '\n\n' : '') + `⚠ ${msg}`
      state.value = 'error'
    } finally {
      sending.value = false
      if (assistant.content === '') {
        assistant.content = '（未收到回复）'
      }
      await loadConversations()
    }
  }

  return {
    conversations,
    conversationId,
    messages,
    requirement,
    itinerary,
    issues,
    validationHistory,
    state,
    sending,
    loadingList,
    error,
    streamingText,
    loadConversations,
    createConversation,
    openConversation,
    deleteConversation,
    send,
  }
}
