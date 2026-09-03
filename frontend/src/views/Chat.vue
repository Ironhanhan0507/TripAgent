<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ChatDotRound, Delete, FolderAdd, Plus, Promotion } from '@element-plus/icons-vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import PlanBudget from '@/components/plan/PlanBudget.vue'
import PlanMap from '@/components/plan/PlanMap.vue'
import { useAgentChat } from '@/composables/useAgentChat'
import { tripsApi } from '@/api/trips'
import type { ActivityCategory, DayPlan, TravelRequirement, ValidationIssueCode } from '@/types'

const route = useRoute()
const router = useRouter()
const chat = useAgentChat()

const input = ref('')
const scrollEl = ref<HTMLElement | null>(null)
const autoSent = ref(false)
const panelTab = ref<'requirement' | 'itinerary' | 'validation'>('requirement')
const itineraryView = ref<'dayplan' | 'map' | 'budget'>('dayplan')

const itineraryViews = [
  { key: 'dayplan', label: '日计划' },
  { key: 'map', label: '地图' },
  { key: 'budget', label: '预算' },
] as const

const stateLabel: Record<string, string> = {
  idle: '就绪',
  parsing: '正在解析需求…',
  searching: '正在搜索信息…',
  routing: '正在规划路线…',
  costing: '正在估算预算…',
  planning: '正在编排行程…',
  validating: '正在校验行程…',
  replanning: '正在重新规划…',
  done: '已完成',
  needs_input: '需要更多信息',
  error: '出错了',
}

// 活动分类展示元信息
const categoryMeta: Record<ActivityCategory, { label: string; badge: string }> = {
  sightseeing: { label: '景点', badge: 'bg-sky-50 text-sky-600' },
  dining: { label: '餐饮', badge: 'bg-amber-50 text-amber-600' },
  shopping: { label: '购物', badge: 'bg-pink-50 text-pink-600' },
  transport: { label: '交通', badge: 'bg-violet-50 text-violet-600' },
  hotel: { label: '住宿', badge: 'bg-indigo-50 text-indigo-600' },
  other: { label: '其他', badge: 'bg-slate-100 text-slate-500' },
}

const issueCodeLabel: Record<ValidationIssueCode, string> = {
  TIME_CONFLICT: '时间冲突',
  OUTSIDE_OPENING_HOURS: '超出营业时间',
  UNREASONABLE_TRANSIT: '交通衔接不足',
  TOO_MANY_ACTIVITIES: '活动过多',
  DAY_TOO_LONG: '单日过长',
  DAY_BUDGET_OVER: '单日预算超支',
  TOTAL_BUDGET_OVER: '总预算超支',
  DETOUR_ROUTE: '路线绕路',
  MISMATCH_PREFERENCE: '偏好未满足',
  AVOIDED_ACTIVITY: '安排了应避开内容',
}

function dayTotal(day: DayPlan): number {
  return day.activities.reduce((s, a) => s + (a.cost || 0), 0)
}

function itineraryTotal(): number {
  return (chat.itinerary.value?.days ?? []).reduce((s, d) => s + dayTotal(d), 0)
}

const panelTabs = [
  { key: 'requirement', label: '需求' },
  { key: 'itinerary', label: '行程' },
  { key: 'validation', label: '校验' },
] as const

const errorCount = computed(() => chat.issues.value.filter((i) => i.severity === 'error').length)
const warningCount = computed(() => chat.issues.value.filter((i) => i.severity === 'warning').length)

// P4：保存当前行程
const savingTrip = ref(false)

async function saveItinerary() {
  const itinerary = chat.itinerary.value
  const requirement = chat.requirement.value
  if (!itinerary) return
  savingTrip.value = true
  try {
    await tripsApi.save({
      conversationId: chat.conversationId.value ?? undefined,
      title: `${itinerary.destination} ${itinerary.days.length} 日游`,
      destination: itinerary.destination,
      startDate: itinerary.startDate,
      endDate: itinerary.endDate,
      totalBudget: itinerary.totalBudget ?? requirement?.budget ?? undefined,
      currency: itinerary.currency ?? requirement?.currency,
      itineraryData: itinerary,
      requirement,
    })
    ElMessage.success('行程已保存到「我的旅行」')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    savingTrip.value = false
  }
}

// 行程产生后自动切换到行程面板
watch(
  () => chat.itinerary.value,
  (v) => {
    if (v) panelTab.value = 'itinerary'
  },
)

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

watch(
  () => chat.messages.value.length,
  () => scrollToBottom(),
)

// 流式生成时持续滚动，保证进度条可见
watch(
  () => chat.streamingText.value.length,
  () => scrollToBottom(),
)

async function handleSend() {
  const text = input.value.trim()
  if (!text || chat.sending.value) return
  input.value = ''
  await chat.send(text)
  scrollToBottom()
}

async function onNewChat() {
  await chat.loadConversations()
  chat.conversationId.value = null
  chat.messages.value = []
  chat.requirement.value = null
  chat.state.value = 'idle'
  router.replace({ name: 'chat' })
}

onMounted(async () => {
  await chat.loadConversations()
  const prompt = (route.query.prompt as string | undefined)?.trim()
  if (prompt && !autoSent.value) {
    autoSent.value = true
    input.value = prompt
    await handleSend()
  }
})

function fmtDate(r: TravelRequirement): string {
  if (r.startDate && r.endDate) return `${r.startDate} ~ ${r.endDate}${r.days ? `（${r.days} 天）` : ''}`
  if (r.days) return `${r.days} 天`
  return '未指定'
}

const paceMap: Record<string, string> = { relaxed: '轻松', balanced: '适中', intensive: '紧凑' }
const transportMap: Record<string, string> = {
  public: '公共交通',
  walking: '步行',
  taxi: '打车',
  car: '自驾',
  mixed: '混合',
}

const isSending = () => chat.sending.value
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-50">
    <AppHeader />
    <div class="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-[1440px] gap-4 p-4">
      <!-- 左侧：会话列表 -->
      <aside class="flex w-64 shrink-0 flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div class="p-3">
          <button
            class="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
            @click="onNewChat"
          >
            <el-icon :size="15"><Plus /></el-icon>
            新对话
          </button>
        </div>
        <div class="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          <button
            v-for="c in chat.conversations.value"
            :key="c.id"
            class="group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition"
            :class="c.id === chat.conversationId.value ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'"
            @click="chat.openConversation(c.id)"
          >
            <el-icon class="shrink-0" :size="14"><ChatDotRound /></el-icon>
            <span class="flex-1 truncate">{{ c.title }}</span>
            <el-icon
              class="hidden shrink-0 cursor-pointer text-slate-400 hover:text-red-500 group-hover:block"
              :size="14"
              @click.stop="chat.deleteConversation(c.id)"
            >
              <Delete />
            </el-icon>
          </button>
          <p v-if="!chat.conversations.value.length && !chat.loadingList.value" class="px-3 py-6 text-center text-xs text-slate-400">
            暂无会话，点击「新对话」开始
          </p>
        </div>
      </aside>

      <!-- 中间：对话 -->
      <section class="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full" :class="chat.state.value === 'error' ? 'bg-red-500' : 'bg-brand-500'" />
            <span class="text-sm font-medium text-slate-700">AI 旅行助手</span>
            <span v-if="chat.sending.value || (chat.state.value !== 'idle' && chat.state.value !== 'done')" class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {{ stateLabel[chat.state.value] ?? chat.state.value }}
            </span>
          </div>
          <span class="max-w-56 truncate text-xs text-slate-400">
            {{ chat.conversations.value.find((c) => c.id === chat.conversationId.value)?.title }}
          </span>
        </div>

        <div ref="scrollEl" class="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div v-if="!chat.messages.value.length" class="flex h-full flex-col items-center justify-center text-center">
            <div class="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-900/10">
              <el-icon :size="26"><ChatDotRound /></el-icon>
            </div>
            <p class="text-sm font-medium text-slate-700">告诉我你想去哪里旅行</p>
            <p class="mt-1 max-w-sm text-sm text-slate-400">
              例如：国庆去东京 5 天，预算 5000 元，喜欢动漫美食和拍照，节奏轻松一点
            </p>
          </div>

          <div
            v-for="m in chat.messages.value"
            :key="m.id"
            class="flex"
            :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              :class="m.role === 'user' ? 'bg-brand-500 text-white' : 'border border-slate-100 bg-slate-50 text-slate-700'"
            >
              {{ m.content }}
              <span v-if="m === chat.messages.value[chat.messages.value.length - 1] && chat.sending.value && m.role === 'assistant'" class="ml-1 inline-block h-4 w-1 animate-pulse bg-brand-400 align-middle" />
            </div>
          </div>

          <!-- LLM 流式生成进度（对话区实时展示，降低感知延迟） -->
          <div v-if="chat.sending.value && chat.streamingText.value" class="flex justify-start">
            <div class="max-w-[80%] rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-2.5">
              <div class="flex items-center gap-2 text-xs font-medium text-brand-600">
                <span class="relative flex h-2 w-2">
                  <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                  <span class="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                </span>
                AI 正在生成行程…
                <span class="font-normal text-brand-400">{{ (chat.streamingText.value.length / 1000).toFixed(1) }}k</span>
              </div>
              <pre class="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-500">{{ chat.streamingText.value }}</pre>
            </div>
          </div>
        </div>

        <div class="border-t border-slate-100 p-4">
          <div class="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-brand-400">
            <textarea
              v-model="input"
              rows="1"
              class="max-h-32 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              placeholder="输入旅行需求，Enter 发送，Shift+Enter 换行"
              @keydown.enter.exact.prevent="handleSend"
            />
            <button
              class="flex h-10 w-10 items-center justify-center rounded-xl text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              :class="isSending() ? 'bg-slate-400' : 'bg-brand-500 hover:bg-brand-600'"
              :disabled="isSending() || !input.trim()"
              @click="handleSend"
            >
              <el-icon :size="17"><Promotion /></el-icon>
            </button>
          </div>
        </div>
      </section>

      <!-- 右侧：需求 / 行程 / 校验 面板 -->
      <aside class="flex w-80 shrink-0 flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div class="flex items-center gap-1 border-b border-slate-100 px-4">
          <button
            v-for="t in panelTabs"
            :key="t.key"
            class="relative px-3 py-3.5 text-sm font-medium transition"
            :class="panelTab === t.key ? 'text-brand-600' : 'text-slate-400 hover:text-slate-600'"
            @click="panelTab = t.key"
          >
            {{ t.label }}
            <span
              v-if="t.key === 'validation' && chat.validationHistory.value.length"
              class="ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              :class="errorCount > 0 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'"
            >
              {{ errorCount > 0 ? errorCount : '通过' }}
            </span>
            <span
              v-if="panelTab === t.key"
              class="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-500"
            />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-5">
          <!-- 需求 -->
          <template v-if="panelTab === 'requirement'">
            <template v-if="chat.requirement.value">
              <div class="space-y-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <el-icon :size="22"><ChatDotRound /></el-icon>
                  </div>
                  <div>
                    <p class="text-lg font-semibold text-slate-900">{{ chat.requirement.value.destination }}</p>
                    <p class="text-xs text-slate-400">已解析的结构化需求</p>
                  </div>
                </div>
                <dl class="space-y-2.5 text-sm">
                  <div class="flex justify-between"><dt class="text-slate-400">时间</dt><dd class="text-slate-700">{{ fmtDate(chat.requirement.value) }}</dd></div>
                  <div class="flex justify-between"><dt class="text-slate-400">人数</dt><dd class="text-slate-700">{{ chat.requirement.value.travelers ? `${chat.requirement.value.travelers} 人` : '未指定' }}</dd></div>
                  <div class="flex justify-between"><dt class="text-slate-400">预算</dt><dd class="text-slate-700">{{ chat.requirement.value.budget ? `约 ${chat.requirement.value.budget} ${chat.requirement.value.currency}` : '未指定' }}</dd></div>
                  <div class="flex justify-between"><dt class="text-slate-400">节奏</dt><dd class="text-slate-700">{{ paceMap[chat.requirement.value.travelPace ?? ''] ?? '未指定' }}</dd></div>
                  <div class="flex justify-between"><dt class="text-slate-400">交通</dt><dd class="text-slate-700">{{ transportMap[chat.requirement.value.transportationPreference ?? ''] ?? '未指定' }}</dd></div>
                </dl>
                <div v-if="chat.requirement.value.preferences.length" class="space-y-2">
                  <p class="text-xs text-slate-400">偏好</p>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="p in chat.requirement.value.preferences" :key="p" class="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">{{ p }}</span>
                  </div>
                </div>
                <div v-if="chat.requirement.value.avoidPreferences.length" class="space-y-2">
                  <p class="text-xs text-slate-400">避开</p>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="p in chat.requirement.value.avoidPreferences" :key="p" class="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-600">{{ p }}</span>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="flex h-full flex-col items-center justify-center py-10 text-center">
                <p class="text-sm text-slate-400">暂无需求</p>
                <p class="mt-1 text-xs text-slate-300">发送一条包含目的地与天数的需求</p>
              </div>
            </template>
          </template>

          <!-- 行程（Day Plan / Map / Budget 子视图） -->
          <template v-if="panelTab === 'itinerary'">
            <template v-if="chat.itinerary.value">
              <div class="mb-3 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-base font-semibold">{{ chat.itinerary.value.destination }} · {{ chat.itinerary.value.days.length }} 天</p>
                    <p class="mt-0.5 text-xs opacity-80">{{ chat.itinerary.value.startDate }} ~ {{ chat.itinerary.value.endDate }}</p>
                    <p class="mt-1 text-xs opacity-80">预估人均 ¥{{ Math.round(itineraryTotal()) }}{{ chat.itinerary.value.currency ? ` / ${chat.itinerary.value.currency}` : '' }}</p>
                  </div>
                  <el-button
                    size="small"
                    round
                    :loading="savingTrip"
                    class="!border-white/30 !bg-white/15 !text-white hover:!bg-white/25"
                    @click="saveItinerary"
                  >
                    <el-icon class="mr-1"><FolderAdd /></el-icon>保存行程
                  </el-button>
                </div>
              </div>

              <!-- 视图切换 -->
              <div class="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  v-for="v in itineraryViews"
                  :key="v.key"
                  class="flex-1 rounded-md py-1.5 text-xs font-medium transition"
                  :class="itineraryView === v.key ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
                  @click="itineraryView = v.key"
                >
                  {{ v.label }}
                </button>
              </div>

              <!-- Day Plan -->
              <template v-if="itineraryView === 'dayplan'">
                <div v-for="d in chat.itinerary.value.days" :key="d.dayIndex" class="mb-5">
                  <div class="mb-2 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700">D{{ d.dayIndex + 1 }}</span>
                      <div>
                        <p class="text-sm font-medium text-slate-800">{{ d.title || `Day ${d.dayIndex + 1}` }}</p>
                        <p class="text-xs text-slate-400">{{ d.date }}</p>
                      </div>
                    </div>
                    <span class="text-xs text-slate-400">¥{{ dayTotal(d) }}</span>
                  </div>
                  <div class="relative ml-3.5 space-y-3 border-l border-slate-200 pl-4">
                    <div v-for="a in d.activities" :key="a.id" class="relative">
                      <span
                        class="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-white"
                        :class="a.category === 'hotel' ? 'bg-indigo-400' : 'bg-brand-500'"
                      />
                      <div class="flex items-start justify-between gap-2">
                        <p class="text-sm font-medium text-slate-700">{{ a.name }}</p>
                        <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" :class="categoryMeta[a.category]?.badge">
                          {{ categoryMeta[a.category]?.label }}
                        </span>
                      </div>
                      <p class="mt-0.5 text-xs text-slate-400">
                        {{ a.startTime }} - {{ a.endTime }}<template v-if="a.cost"> · ¥{{ a.cost }}</template>
                      </p>
                      <p v-if="a.transportNote" class="mt-0.5 text-[11px] text-slate-400">衔接：{{ a.transportNote }}</p>
                    </div>
                  </div>
                </div>
                <div v-if="chat.itinerary.value.notes?.length" class="mt-2 rounded-xl bg-slate-50 p-3">
                  <p class="mb-1 text-xs font-medium text-slate-500">行程说明</p>
                  <ul class="list-disc space-y-1 pl-4 text-xs text-slate-500">
                    <li v-for="(n, i) in chat.itinerary.value.notes" :key="i">{{ n }}</li>
                  </ul>
                </div>
              </template>

              <!-- Map -->
              <PlanMap
                v-show="itineraryView === 'map'"
                :itinerary="chat.itinerary.value"
                :active="itineraryView === 'map'"
              />

              <!-- Budget -->
              <PlanBudget
                v-show="itineraryView === 'budget'"
                :itinerary="chat.itinerary.value"
                :requirement="chat.requirement.value"
              />
            </template>
            <template v-else>
              <!-- LLM 流式生成进度（P4 优化：实时展示生成中的片段） -->
              <div v-if="chat.streamingText.value" class="flex h-full flex-col">
                <div class="flex items-center gap-2 text-sm text-slate-600">
                  <span class="relative flex h-2.5 w-2.5">
                    <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
                    <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
                  </span>
                  <p class="font-medium">正在生成行程…</p>
                  <span class="text-xs text-slate-400">{{ (chat.streamingText.value.length / 1000).toFixed(1) }}k 字符</span>
                </div>
                <p class="mt-1 text-xs text-slate-400">AI 正在逐字输出行程 JSON，可实时查看进度</p>
                <pre class="mt-3 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-500">{{ chat.streamingText.value }}</pre>
              </div>
              <div v-else class="flex h-full flex-col items-center justify-center py-10 text-center">
                <p class="text-sm text-slate-400">行程规划中…</p>
                <p class="mt-1 text-xs text-slate-300">发送旅行需求后，这里将展示每日行程</p>
              </div>
            </template>
          </template>

          <!-- 校验 -->
          <template v-if="panelTab === 'validation'">
            <template v-if="chat.validationHistory.value.length">
              <div class="mb-4 rounded-xl p-4" :class="errorCount > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'">
                <p class="text-sm font-semibold">{{ errorCount > 0 ? `发现 ${errorCount} 个需修复问题` : '行程已通过校验' }}</p>
                <p v-if="warningCount" class="mt-0.5 text-xs opacity-80">另有 {{ warningCount }} 个提示项</p>
              </div>
              <div v-for="v in [...chat.validationHistory.value].sort((a, b) => a.attempt - b.attempt)" :key="v.attempt" class="mb-4">
                <p class="mb-1.5 text-xs font-medium text-slate-500">
                  第 {{ v.attempt + 1 }} 轮校验{{ v.attempt === 0 ? '（初版）' : '（重规划后）' }} · {{ v.issues.length }} 项
                </p>
                <div v-if="v.issues.length" class="space-y-1.5">
                  <div
                    v-for="(it, idx) in v.issues"
                    :key="idx"
                    class="rounded-lg border px-2.5 py-1.5 text-xs"
                    :class="it.severity === 'error' ? 'border-red-100 bg-red-50/60 text-red-600' : 'border-amber-100 bg-amber-50/60 text-amber-600'"
                  >
                    <p class="font-medium">{{ issueCodeLabel[it.code] ?? it.code }}<span class="ml-1 font-normal opacity-60">{{ it.location }}</span></p>
                    <p class="mt-0.5 text-[11px] opacity-80">{{ it.message }}</p>
                  </div>
                </div>
                <p v-else class="text-xs text-emerald-500">无问题</p>
              </div>
            </template>
            <template v-else>
              <div class="flex h-full flex-col items-center justify-center py-10 text-center">
                <p class="text-sm text-slate-400">暂无校验记录</p>
                <p class="mt-1 text-xs text-slate-300">行程生成后将展示每轮校验结果</p>
              </div>
            </template>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>
