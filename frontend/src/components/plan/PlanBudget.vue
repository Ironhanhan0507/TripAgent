<script setup lang="ts">
import { computed } from 'vue'
import type { ActivityCategory, Itinerary, TravelRequirement } from '@/types'

// Budget 视图：总预算对比 + 分类预算条（人均）+ 每日预算柱状图（人均）。
const props = defineProps<{ itinerary: Itinerary | null; requirement: TravelRequirement | null }>()

const catMeta: Record<ActivityCategory, { label: string; color: string }> = {
  sightseeing: { label: '门票', color: '#0ea5e9' },
  dining: { label: '餐饮', color: '#f59e0b' },
  shopping: { label: '购物', color: '#ec4899' },
  transport: { label: '交通', color: '#8b5cf6' },
  hotel: { label: '住宿', color: '#6366f1' },
  other: { label: '其他', color: '#94a3b8' },
}

const catTotals = computed(() => {
  const acc: Record<string, number> = {}
  for (const d of props.itinerary?.days ?? []) {
    for (const a of d.activities) acc[a.category] = (acc[a.category] ?? 0) + (a.cost || 0)
  }
  return (Object.keys(acc) as ActivityCategory[])
    .filter((k) => acc[k] > 0)
    .map((k) => ({ category: k, label: catMeta[k].label, color: catMeta[k].color, amount: acc[k] }))
    .sort((a, b) => b.amount - a.amount)
})

const dayTotals = computed(() =>
  (props.itinerary?.days ?? []).map((d) => ({
    dayIndex: d.dayIndex,
    date: d.date,
    title: d.title,
    amount: d.activities.reduce((s, a) => s + (a.cost || 0), 0),
  })),
)

const perPersonTotal = computed(() => catTotals.value.reduce((s, c) => s + c.amount, 0))
const travelers = computed(() => props.requirement?.travelers ?? 1)
const grandTotal = computed(() => perPersonTotal.value * travelers.value)
const budget = computed(() => props.itinerary?.totalBudget ?? props.requirement?.budget ?? null)
const currency = computed(() => props.itinerary?.currency ?? props.requirement?.currency ?? 'CNY')

const budgetPct = computed(() => (budget.value ? Math.round((grandTotal.value / budget.value) * 100) : 0))
const budgetTone = computed(() => {
  if (budgetPct.value >= 105) return { bar: 'bg-red-500', text: 'text-red-600', note: `超出预算 ${Math.round(grandTotal.value - budget.value!)} 元` }
  if (budgetPct.value >= 90) return { bar: 'bg-amber-500', text: 'text-amber-600', note: '接近预算上限' }
  return { bar: 'bg-brand-500', text: 'text-brand-600', note: `剩余约 ${Math.round(budget.value! - grandTotal.value)} 元` }
})

const maxDay = computed(() => Math.max(...dayTotals.value.map((d) => d.amount), 0))
const perDayBudget = computed(() => (budget.value && (props.itinerary?.days.length ?? 0) > 0 ? budget.value / props.itinerary!.days.length / travelers.value : null))

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(0)
}
</script>

<template>
  <div v-if="itinerary" class="space-y-5">
    <!-- 总预算对比 -->
    <div class="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <div class="mb-2 flex items-baseline justify-between">
        <p class="text-xs text-slate-400">总预算对比（{{ travelers }} 人）</p>
        <p class="text-xs" :class="budgetTone.text">
          {{ fmt(grandTotal) }} / {{ budget ? fmt(budget) : '未设' }} {{ currency }}
        </p>
      </div>
      <div class="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          class="h-full rounded-full transition-all"
          :class="budgetTone.bar"
          :style="{ width: `${Math.min(budgetPct, 100)}%` }"
        />
      </div>
      <p v-if="budget" class="mt-1.5 text-[11px] text-slate-400">{{ budgetTone.note }}</p>
      <p v-else class="mt-1.5 text-[11px] text-slate-400">未设置预算，仅展示预估花费</p>
    </div>

    <!-- 分类预算条（人均） -->
    <div>
      <p class="mb-2 text-xs font-medium text-slate-500">分类花费（人均）</p>
      <div class="space-y-2.5">
        <div v-for="c in catTotals" :key="c.category" class="flex items-center gap-2">
          <span class="w-8 shrink-0 text-xs text-slate-500">{{ c.label }}</span>
          <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              class="h-full rounded-full transition-all"
              :style="{ width: `${perPersonTotal ? (c.amount / perPersonTotal) * 100 : 0}%`, background: c.color }"
            />
          </div>
          <span class="w-12 shrink-0 text-right text-xs text-slate-500">¥{{ fmt(c.amount) }}</span>
        </div>
      </div>
      <div class="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs">
        <span class="text-slate-400">人均合计</span>
        <span class="font-medium text-slate-700">¥{{ fmt(perPersonTotal) }}</span>
      </div>
    </div>

    <!-- 每日预算柱状图（人均） -->
    <div>
      <p class="mb-2 text-xs font-medium text-slate-500">每日花费（人均）</p>
      <div class="flex items-end justify-between gap-2" style="height: 120px">
        <div v-for="d in dayTotals" :key="d.dayIndex" class="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span class="text-[10px] text-slate-400">¥{{ fmt(d.amount) }}</span>
          <div
            class="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400 transition-all"
            :style="{ height: `${maxDay ? (d.amount / maxDay) * 72 : 0}%` }"
          />
          <span class="text-[10px] text-slate-500">D{{ d.dayIndex + 1 }}</span>
        </div>
      </div>
      <p v-if="perDayBudget" class="mt-1.5 text-[11px] text-slate-400">
        日均预算参考：¥{{ fmt(perDayBudget) }} / 人 / 天
      </p>
    </div>
  </div>

  <div v-else class="flex h-full flex-col items-center justify-center py-10 text-center">
    <p class="text-sm text-slate-400">暂无预算数据</p>
    <p class="mt-1 text-xs text-slate-300">行程生成后展示费用分布</p>
  </div>
</template>
