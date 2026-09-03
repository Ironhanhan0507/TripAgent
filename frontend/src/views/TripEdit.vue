<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, ArrowDown, ArrowUp, CircleCheck, Delete, MagicStick, Plus, Rank, RefreshLeft, Select,
} from '@element-plus/icons-vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { streamReplan, tripsApi } from '@/api/trips'
import type { Activity, ActivityCategory, Itinerary, TravelRequirement, ValidationIssue } from '@/types'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)

const tripTitle = ref('')
const version = ref(1)
const draft = ref<Itinerary | null>(null)
const requirement = ref<TravelRequirement | null>(null)
const loading = ref(false)
const saving = ref(false)
const replanning = ref(false)
const validating = ref(false)
const note = ref('')
const issues = ref<ValidationIssue[]>([])
const replanMessage = ref('')

const categories: Array<{ value: ActivityCategory; label: string }> = [
  { value: 'sightseeing', label: '景点' },
  { value: 'dining', label: '餐饮' },
  { value: 'shopping', label: '购物' },
  { value: 'transport', label: '交通' },
  { value: 'hotel', label: '住宿' },
  { value: 'other', label: '其他' },
]

const dirty = computed(() => true) // 编辑即改动，保存按钮常显

async function load() {
  loading.value = true
  try {
    const t = await tripsApi.detail(id)
    tripTitle.value = t.title
    version.value = t.version
    requirement.value = t.requirement
    // 深拷贝，避免直接修改列表引用
    draft.value = structuredClone(t.itineraryData)
    issues.value = []
    replanMessage.value = ''
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

// ===== 活动编辑 =====
// 调整顺序：上下按钮 / 拖拽手柄，均保持手动顺序（同时更新 orderIndex）。
function moveActivity(dayIndex: number, actIndex: number, dir: -1 | 1) {
  const day = draft.value?.days[dayIndex]
  if (!day) return
  const target = actIndex + dir
  if (target < 0 || target >= day.activities.length) return
  const acts = day.activities
  ;[acts[actIndex], acts[target]] = [acts[target], acts[actIndex]]
  acts.forEach((a, i) => (a.orderIndex = i))
}

// 拖拽排序（HTML5 DnD）：拖动期间实时换位；跨日拖拽被禁用（仅同日调整）。
const dragSource = ref<{ dayIndex: number; actIndex: number } | null>(null)
const dragHover = ref<{ dayIndex: number; actIndex: number } | null>(null)

function onDragStart(dayIndex: number, actIndex: number) {
  dragSource.value = { dayIndex, actIndex }
  dragHover.value = { dayIndex, actIndex }
}

function onDragOver(dayIndex: number, actIndex: number) {
  dragHover.value = { dayIndex, actIndex }
  const s = dragSource.value
  if (!s || s.dayIndex !== dayIndex || s.actIndex === actIndex) return
  const day = draft.value?.days[dayIndex]
  if (!day) return
  const acts = day.activities
  const [moved] = acts.splice(s.actIndex, 1)
  acts.splice(actIndex, 0, moved)
  acts.forEach((a, i) => (a.orderIndex = i))
  dragSource.value = { dayIndex, actIndex }
}

function onDragEnd() {
  dragSource.value = null
  dragHover.value = null
}

function isDragging(dayIndex: number, actIndex: number): boolean {
  const s = dragSource.value
  return !!s && s.dayIndex === dayIndex && s.actIndex === actIndex
}

// 悬停目标行高亮（插入位置提示）
function isDragTarget(dayIndex: number, actIndex: number): boolean {
  const h = dragHover.value
  return !!h && !isDragging(dayIndex, actIndex) && h.dayIndex === dayIndex && h.actIndex === actIndex
}

function removeActivity(dayIndex: number, actIndex: number) {
  const day = draft.value?.days[dayIndex]
  if (!day) return
  day.activities.splice(actIndex, 1)
  day.activities.forEach((a, i) => (a.orderIndex = i))
}

function addActivity(dayIndex: number) {
  const day = draft.value?.days[dayIndex]
  if (!day) return
  const act: Activity = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '新活动',
    placeId: '',
    startTime: '10:00',
    endTime: '11:00',
    durationMin: 60,
    cost: 0,
    category: 'sightseeing',
    orderIndex: day.activities.length,
  }
  day.activities.push(act)
}

function totalCost(): number {
  return (draft.value?.days ?? []).reduce((s, d) => s + d.activities.reduce((x, a) => x + (a.cost || 0), 0), 0)
}

// ===== 保存 / 重规划 =====
async function save() {
  if (!draft.value) return
  saving.value = true
  try {
    const updated = await tripsApi.update(id, {
      title: tripTitle.value.trim() || draft.value.destination,
      itineraryData: draft.value,
    })
    version.value = updated.version
    tripTitle.value = updated.title
    ElMessage.success(`已保存（v${updated.version}）`)
    await load()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function replan() {
  if (!draft.value || !requirement.value) {
    ElMessage.warning('缺少需求信息，无法重规划')
    return
  }
  replanning.value = true
  issues.value = []
  replanMessage.value = ''
  const controller = new AbortController()
  try {
    await streamReplan(
      {
        itinerary: draft.value,
        requirement: requirement.value,
        note: note.value.trim() || undefined,
      },
      (event) => {
        switch (event.type) {
          case 'plan':
            draft.value = structuredClone(event.itinerary)
            break
          case 'validation':
            issues.value = event.issues
            break
          case 'message':
            replanMessage.value += event.content
            break
          case 'error':
            replanMessage.value += (replanMessage.value ? '\n\n' : '') + `⚠ ${event.message}`
            break
          default:
            break
        }
      },
      controller.signal,
    )
    ElMessage.success('重规划完成')
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    ElMessage.error(e instanceof Error ? e.message : '重规划失败')
  } finally {
    replanning.value = false
  }
}

async function revert() {
  if (!dirty.value) return
  try {
    await ElMessageBox.confirm('放弃当前所有修改并恢复保存的版本吗？', '撤销修改', {
      confirmButtonText: '撤销',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  await load()
  ElMessage.success('已恢复')
}

// 手动触发校验（对当前草稿执行 10 项规则）
async function validate() {
  if (!draft.value) return
  validating.value = true
  try {
    const res = await tripsApi.validate(id, draft.value)
    issues.value = res.issues
    replanMessage.value = res.passed
      ? '当前行程通过全部校验。'
      : `校验完成：${res.issues.filter((i) => i.severity === 'error').length} 个需修复问题，${res.issues.filter((i) => i.severity === 'warning').length} 个提示项。`
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '校验失败')
  } finally {
    validating.value = false
  }
}

const errorCount = computed(() => issues.value.filter((i) => i.severity === 'error').length)
const warningCount = computed(() => issues.value.filter((i) => i.severity === 'warning').length)

onMounted(load)
</script>

<template>
  <div class="flex min-h-full flex-col bg-slate-50">
    <AppHeader />
    <div class="mx-auto w-full max-w-6xl flex-1 p-6">
      <div v-loading="loading">
        <template v-if="draft">
          <!-- 头部 -->
          <div class="mb-6">
            <button class="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-brand-600" @click="router.push({ name: 'trip-detail', params: { id } })">
              <el-icon :size="14"><ArrowLeft /></el-icon>返回详情
            </button>
            <div class="flex flex-wrap items-end justify-between gap-4">
              <div class="min-w-0">
                <input
                  v-model="tripTitle"
                  class="w-full max-w-md rounded-lg border border-transparent bg-transparent text-2xl font-bold text-slate-900 outline-none transition hover:border-slate-200 focus:border-brand-400"
                  placeholder="行程标题"
                />
                <p class="mt-1 text-sm text-slate-500">
                  {{ draft.destination }} · {{ draft.days.length }} 天 · v{{ version }}<span v-if="dirty" class="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">未保存</span>
                </p>
              </div>
              <div class="flex gap-2">
                <el-button :disabled="replanning" @click="revert">
                  <el-icon class="mr-1"><RefreshLeft /></el-icon>撤销
                </el-button>
                <el-button :loading="validating" @click="validate">
                  <el-icon class="mr-1"><CircleCheck /></el-icon>校验
                </el-button>
                <el-button type="primary" :loading="replanning" @click="replan">
                  <el-icon class="mr-1"><MagicStick /></el-icon>{{ replanning ? '重规划中…' : '智能重规划' }}
                </el-button>
                <el-button type="primary" plain :loading="saving" @click="save">
                  <el-icon class="mr-1"><Select /></el-icon>保存修改
                </el-button>
              </div>
            </div>
          </div>

          <!-- 调整说明（增量重规划输入） -->
          <div class="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p class="mb-2 text-sm font-medium text-slate-700">调整说明（可选，供智能重规划参考）</p>
            <textarea
              v-model="note"
              rows="2"
              class="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-brand-400"
              placeholder="例如：把浅草寺挪到第二天、增加一家海鲜餐厅、节奏放轻松一点…"
            />
            <p v-if="replanMessage" class="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{{ replanMessage }}</p>
          </div>

          <!-- 校验结果 -->
          <div v-if="issues.length" class="mb-4 rounded-2xl border p-4 shadow-sm" :class="errorCount > 0 ? 'border-red-100 bg-red-50/50' : 'border-emerald-100 bg-emerald-50/50'">
            <p class="text-sm font-semibold" :class="errorCount > 0 ? 'text-red-600' : 'text-emerald-600'">
              {{ errorCount > 0 ? `发现 ${errorCount} 个需修复问题` : '行程已通过校验' }}<span v-if="warningCount" class="ml-2 text-xs font-normal opacity-70">另有 {{ warningCount }} 个提示项</span>
            </p>
            <div class="mt-2 space-y-1.5">
              <div
                v-for="(it, idx) in issues"
                :key="idx"
                class="rounded-lg border px-2.5 py-1.5 text-xs"
                :class="it.severity === 'error' ? 'border-red-100 bg-white text-red-600' : 'border-amber-100 bg-white text-amber-600'"
              >
                <span class="font-medium">{{ it.code }}</span><span class="ml-1 opacity-60">{{ it.location }}</span>
                <p class="mt-0.5 text-[11px] opacity-80">{{ it.message }}</p>
              </div>
            </div>
          </div>

          <!-- 可编辑时间线 -->
          <div class="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div class="mb-4 flex items-center justify-between">
              <p class="text-sm font-medium text-slate-700">每日行程（拖动左侧手柄或上下按钮调整顺序，可修改时间 / 分类 / 费用、删除或新增活动）</p>
              <span class="text-xs text-slate-400">预估人均 ¥{{ totalCost() }} {{ draft.currency }}</span>
            </div>

            <div v-for="d in draft.days" :key="d.dayIndex" class="mb-6">
              <div class="mb-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700">D{{ d.dayIndex + 1 }}</span>
                  <div>
                    <input v-model="d.title" class="w-44 rounded border border-transparent bg-transparent text-sm font-medium text-slate-800 outline-none hover:border-slate-200 focus:border-brand-400" placeholder="当日主题（可选）" />
                    <p class="text-xs text-slate-400">{{ d.date }}</p>
                  </div>
                </div>
                <el-button size="small" @click="addActivity(d.dayIndex)">
                  <el-icon class="mr-1"><Plus /></el-icon>新增活动
                </el-button>
              </div>

              <div class="space-y-2">
                <div
                  v-for="(a, ai) in d.activities"
                  :key="a.id"
                  class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 transition"
                  :class="{
                    'opacity-40 ring-2 ring-brand-200': isDragging(d.dayIndex, ai),
                    'border-brand-300 bg-brand-50/70 ring-1 ring-brand-200': isDragTarget(d.dayIndex, ai),
                  }"
                  @dragover.prevent="onDragOver(d.dayIndex, ai)"
                  @drop.prevent="onDragEnd"
                >
                  <span
                    draggable="true"
                    class="flex h-6 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-md bg-white text-slate-300 shadow-sm transition hover:text-brand-500 active:cursor-grabbing"
                    title="拖动调整顺序"
                    @dragstart="onDragStart(d.dayIndex, ai)"
                    @dragend="onDragEnd"
                  >
                    <el-icon><Rank /></el-icon>
                  </span>
                  <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-xs font-semibold text-slate-400 shadow-sm">{{ ai + 1 }}</span>

                  <el-select v-model="a.category" size="small" class="w-20">
                    <el-option v-for="c in categories" :key="c.value" :label="c.label" :value="c.value" />
                  </el-select>

                  <input v-model="a.name" class="min-w-28 flex-1 rounded-lg border border-transparent bg-white px-2 py-1.5 text-sm text-slate-700 outline-none hover:border-slate-200 focus:border-brand-400" placeholder="活动名称" />

                  <div class="flex items-center gap-1 text-xs text-slate-400">
                    <input v-model="a.startTime" type="time" class="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 outline-none focus:border-brand-400" />
                    <span>~</span>
                    <input v-model="a.endTime" type="time" class="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 outline-none focus:border-brand-400" />
                  </div>

                  <div class="flex items-center gap-1 text-xs text-slate-400">
                    <span>¥</span>
                    <input v-model.number="a.cost" type="number" min="0" class="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 outline-none focus:border-brand-400" />
                  </div>

                  <div class="ml-auto flex items-center gap-0.5">
                    <el-button size="small" circle text :disabled="ai === 0" @click="moveActivity(d.dayIndex, ai, -1)">
                      <el-icon><ArrowUp /></el-icon>
                    </el-button>
                    <el-button size="small" circle text :disabled="ai === d.activities.length - 1" @click="moveActivity(d.dayIndex, ai, 1)">
                      <el-icon><ArrowDown /></el-icon>
                    </el-button>
                    <el-button size="small" circle text type="danger" @click="removeActivity(d.dayIndex, ai)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <div v-else-if="!loading" class="py-20 text-center text-slate-400">行程不存在或已删除</div>
      </div>
    </div>
  </div>
</template>
