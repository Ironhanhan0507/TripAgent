<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  ArrowRight,
  Calendar,
  CircleCheck,
  Compass,
  Location,
  MagicStick,
  MapLocation,
  Money,
  RefreshRight,
  Search,
  TrendCharts,
  Van,
} from '@element-plus/icons-vue'

const router = useRouter()
const auth = useAuthStore()
const prompt = ref('')

const samples = ['国庆去东京 5 天，预算 5000 元，喜欢动漫美食和拍照', '和爸妈去上海 3 天，节奏轻松点', '巴黎 4 天自由行，想去博物馆和拍照']

function startPlan(text?: string) {
  const q = text ?? prompt.value.trim()
  router.push({ name: 'chat', query: q ? { prompt: q } : {} })
}

const steps = [
  {
    icon: MagicStick,
    title: '说出你的想法',
    desc: '自然语言描述目的地、天数、预算和偏好，Agent 帮你整理成清晰的旅行约束。',
  },
  {
    icon: Compass,
    title: 'AI 检索并规划',
    desc: 'Agent 调用工具搜索景点、计算路线与交通、估算预算，生成完整的多日行程。',
  },
  {
    icon: RefreshRight,
    title: '验证后自动调整',
    desc: '行程会自动通过时间、营业时间、预算与偏好校验，发现冲突立刻重新规划。',
  },
]

const features = [
  { icon: MagicStick, title: '智能需求解析', desc: '听懂口语化需求：偏好、避雷、节奏快慢，全部结构化。' },
  { icon: Location, title: '真实数据检索', desc: '景点、营业时间、位置均来自数据服务，不凭空编造。' },
  { icon: Van, title: '路线与距离计算', desc: '自动衔接景点间交通，避免"看起来顺路其实绕路"。' },
  { icon: RefreshRight, title: '冲突自动重规划', desc: '最多 3 次自动修正：时间冲突、超预算、行程过满。' },
  { icon: Money, title: '预算掌控', desc: '门票 / 餐饮 / 交通 / 住宿分项估算，总预算一目了然。' },
  { icon: MapLocation, title: '可视化行程', desc: '时间线、每日计划、地图、预算四视图自由切换。' },
]

const stats = [
  { value: '12+', label: '内置目的地' },
  { value: '10', label: '行程校验规则' },
  { value: '≤3', label: '自动重规划次数' },
  { value: '100%', label: '数据来自工具检索' },
]

// Agent 过程演示：模拟规划一个行程时的工具调用状态流（静态演示，贴近参考站 AI 伙伴窗口）
const agentTools = [
  { icon: Search, title: '搜索景点', desc: '东京 · 动漫 / 美食 / 拍照', status: 'done', duration: '1.2s' },
  { icon: Van, title: '计算交通衔接', desc: '浅草寺 → 秋叶原 · 地铁 20 分钟', status: 'done', duration: '0.8s' },
  { icon: Money, title: '估算分类预算', desc: '门票 1050 · 餐饮 2400 · 交通 960', status: 'done', duration: '0.9s' },
  { icon: CircleCheck, title: '校验行程', desc: '10 项规则 · 发现 1 处时间冲突', status: 'done', duration: '0.6s' },
  { icon: RefreshRight, title: '自动重规划', desc: '调整活动顺序后重新验证', status: 'running', duration: '…' },
]

const demoChat = [
  { role: 'user', text: '帮我规划东京 5 天，喜欢动漫和美食，预算 5000 元。' },
  { role: 'agent', text: '好的。我先整理需求，然后检索景点、计算交通、估算预算，生成一份可执行的行程，全程约 30 秒。' },
  { role: 'user', text: '节奏放松一点，多留些自由时间。' },
  { role: 'agent', text: '明白，已调松每日安排，正在重新校验预算与时间冲突。' },
]
</script>

<template>
  <div class="min-h-full bg-white">
    <!-- 顶部导航 -->
    <header class="fixed inset-x-0 top-0 z-40 border-b border-slate-100/80 bg-white/80 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div class="flex items-center gap-2">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <el-icon :size="20"><Compass /></el-icon>
          </div>
          <span class="text-lg font-semibold tracking-tight text-slate-900">TripAgent</span>
        </div>
        <nav class="flex items-center gap-2 text-sm">
          <router-link v-if="auth.isAuthenticated" to="/trips" class="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">我的旅行</router-link>
          <router-link v-if="!auth.isAuthenticated" to="/login" class="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">登录</router-link>
          <el-button v-if="auth.isAuthenticated" text @click="auth.logout()">退出</el-button>
          <router-link v-else to="/register">
            <el-button type="primary" round>免费开始</el-button>
          </router-link>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <section class="relative overflow-hidden pt-16">
      <div class="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50 via-white to-white" />
      <div class="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand-200/30 blur-3xl" />
      <div class="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center sm:pt-24">
        <span class="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-700 shadow-sm">
          <el-icon :size="14"><MagicStick /></el-icon>
          AI 智能旅行规划 Agent
        </span>
        <h1 class="mt-6 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-6xl">
          告诉我你想去哪里，
          <span class="bg-gradient-to-r from-brand-600 to-sun-500 bg-clip-text text-transparent">我帮你规划一次旅行。</span>
        </h1>
        <p class="mx-auto mt-5 max-w-2xl text-base text-slate-500 sm:text-lg">
          和 AI 对话，说出目的地、天数、预算与偏好。TripAgent 会检索真实信息、生成行程、验证冲突并自动调整，直到你满意。
        </p>

        <!-- 快速开始输入 -->
        <div class="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-brand-900/5">
          <el-icon class="ml-2 text-brand-500" :size="20"><Location /></el-icon>
          <input
            v-model="prompt"
            class="h-11 w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            placeholder="比如：国庆去东京 5 天，预算 5000 元…"
            @keyup.enter="startPlan()"
          />
          <el-button type="primary" round class="!h-11 !px-6" @click="startPlan()">
            开始规划
            <el-icon class="ml-1"><ArrowRight /></el-icon>
          </el-button>
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span class="text-xs text-slate-400">试试：</span>
          <button
            v-for="s in samples"
            :key="s"
            class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 transition hover:border-brand-300 hover:text-brand-600"
            @click="startPlan(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>
    </section>

    <!-- 数据条 -->
    <section class="border-y border-slate-100 bg-white">
      <div class="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4">
        <div v-for="s in stats" :key="s.label" class="text-center">
          <div class="text-2xl font-bold text-brand-700">{{ s.value }}</div>
          <div class="mt-1 text-xs text-slate-400">{{ s.label }}</div>
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section class="mx-auto max-w-6xl px-6 py-20">
      <div class="text-center">
        <h2 class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">三次对话，生成一份完整行程</h2>
        <p class="mt-3 text-slate-500">从一句话到可执行的每日计划，中间全由 Agent 完成。</p>
      </div>
      <div class="mt-12 grid gap-6 md:grid-cols-3">
        <div v-for="(s, i) in steps" :key="s.title" class="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-brand-900/5">
          <span class="absolute right-6 top-6 text-4xl font-bold text-brand-100">{{ i + 1 }}</span>
          <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <el-icon :size="24"><component :is="s.icon" /></el-icon>
          </div>
          <h3 class="mt-5 text-lg font-semibold text-slate-900">{{ s.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-slate-500">{{ s.desc }}</p>
        </div>
      </div>
    </section>

    <!-- 能力展示 -->
    <section class="bg-slate-50 py-20">
      <div class="mx-auto max-w-6xl px-6">
        <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">不止是攻略，是一个会"思考"的旅行 Agent</h2>
            <p class="mt-3 text-slate-500">所有信息都通过工具检索而来，所有计划都经过校验。</p>
          </div>
          <router-link to="/register" class="hidden sm:block">
            <el-button round>
              开始你的第一份行程
              <el-icon class="ml-1"><ArrowRight /></el-icon>
            </el-button>
          </router-link>
        </div>
        <div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="f in features" :key="f.title" class="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:border-brand-200 hover:shadow-md">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <el-icon :size="20"><component :is="f.icon" /></el-icon>
            </div>
            <h3 class="mt-4 font-semibold text-slate-900">{{ f.title }}</h3>
            <p class="mt-1.5 text-sm leading-relaxed text-slate-500">{{ f.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Agent 过程演示 -->
    <section class="mx-auto max-w-6xl px-6 py-20">
      <div class="text-center">
        <h2 class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">看看 Agent 是怎么工作的</h2>
        <p class="mt-3 text-slate-500">从一句话到完整行程，每一步都真实可追踪。</p>
      </div>

      <div class="mt-12 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl shadow-brand-900/5">
        <!-- 窗口标题栏 -->
        <div class="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <span class="h-3 w-3 rounded-full bg-red-400" />
          <span class="h-3 w-3 rounded-full bg-amber-400" />
          <span class="h-3 w-3 rounded-full bg-emerald-400" />
          <span class="ml-3 text-xs font-medium text-slate-500">TripAgent · Agent 控制台</span>
          <span class="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />实时
          </span>
        </div>

        <div class="grid md:grid-cols-2">
          <!-- 左：AI 伙伴对话 -->
          <div class="space-y-4 border-b border-slate-100 bg-slate-50/40 p-6 md:border-b-0 md:border-r">
            <div v-for="(m, i) in demoChat" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
              <div
                class="max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed"
                :class="m.role === 'user' ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm border border-slate-100 bg-white text-slate-700 shadow-sm'"
              >
                {{ m.text }}
              </div>
            </div>
            <div class="flex items-center gap-2 text-[11px] text-slate-400">
              <el-icon class="animate-spin" :size="12"><RefreshRight /></el-icon>
              Agent 正在生成行程…
            </div>
          </div>

          <!-- 右：Tool 状态流 -->
          <div class="p-6">
            <p class="mb-4 flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <el-icon :size="14"><Compass /></el-icon>工具调用 · Tool 状态流
            </p>
            <div class="space-y-2.5">
              <div v-for="t in agentTools" :key="t.title" class="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-2.5">
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  :class="t.status === 'done' ? 'bg-emerald-50 text-emerald-500' : 'bg-brand-50 text-brand-500'"
                >
                  <el-icon :size="16" :class="t.status === 'running' ? 'animate-spin' : ''"><component :is="t.icon" /></el-icon>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-slate-700">{{ t.title }}</p>
                  <p class="truncate text-xs text-slate-400">{{ t.desc }}</p>
                </div>
                <span class="shrink-0 text-[10px] text-slate-400">{{ t.duration }}</span>
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  :class="t.status === 'done' ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'"
                >
                  {{ t.status === 'done' ? '完成' : '进行中' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 视图预览 -->
    <section class="mx-auto max-w-6xl px-6 py-20">
      <div class="text-center">
        <h2 class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">一份行程，四种视角</h2>
        <p class="mt-3 text-slate-500">时间线、每日计划、地图、预算，随时切换。</p>
      </div>
      <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="v in [
          { icon: Calendar, name: 'Timeline', desc: '整体节奏与交通衔接' },
          { icon: TrendCharts, name: 'Day Plan', desc: '逐日活动安排' },
          { icon: MapLocation, name: 'Map', desc: '真实地图标记' },
          { icon: Money, name: 'Budget', desc: '分类预算分布' },
        ]" :key="v.name" class="flex flex-col items-center rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50 p-8 text-center shadow-sm">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-100">
            <el-icon :size="26"><component :is="v.icon" /></el-icon>
          </div>
          <div class="mt-4 font-semibold text-slate-900">{{ v.name }}</div>
          <div class="mt-1 text-xs text-slate-400">{{ v.desc }}</div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="mx-auto max-w-6xl px-6 pb-20">
      <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 px-8 py-16 text-center text-white">
        <div class="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div class="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-sun-400/20 blur-2xl" />
        <h2 class="relative text-2xl font-bold tracking-tight sm:text-3xl">下一段旅程，交给 TripAgent</h2>
        <p class="relative mx-auto mt-3 max-w-xl text-brand-100">免费开始，随时随地重新规划你的旅行。</p>
        <div class="relative mt-8">
          <el-button round size="large" class="!bg-white !text-brand-700 !border-0 !px-8" @click="startPlan()">
            开始规划
            <el-icon class="ml-1"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-slate-100 py-10">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-400 sm:flex-row">
        <div class="flex items-center gap-2">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <el-icon :size="15"><Compass /></el-icon>
          </div>
          <span class="font-medium text-slate-600">TripAgent</span>
        </div>
        <div>AI 智能旅行规划 Agent · MVP</div>
      </div>
    </footer>
  </div>
</template>
