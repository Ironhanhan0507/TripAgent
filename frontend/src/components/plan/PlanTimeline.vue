<script setup lang="ts">
import type { ActivityCategory, DayPlan, Itinerary } from '@/types'

// 只读行程时间线：详情页 / 聊天页共用（聊天页保留自身实现，本组件供详情页使用）。
const props = defineProps<{ itinerary: Itinerary | null }>()

const categoryMeta: Record<ActivityCategory, { label: string; badge: string }> = {
  sightseeing: { label: '景点', badge: 'bg-sky-50 text-sky-600' },
  dining: { label: '餐饮', badge: 'bg-amber-50 text-amber-600' },
  shopping: { label: '购物', badge: 'bg-pink-50 text-pink-600' },
  transport: { label: '交通', badge: 'bg-violet-50 text-violet-600' },
  hotel: { label: '住宿', badge: 'bg-indigo-50 text-indigo-600' },
  other: { label: '其他', badge: 'bg-slate-100 text-slate-500' },
}

function dayTotal(day: DayPlan): number {
  return day.activities.reduce((s, a) => s + (a.cost || 0), 0)
}
</script>

<template>
  <div v-if="itinerary">
    <div v-for="d in itinerary.days" :key="d.dayIndex" class="mb-5">
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
    <div v-if="itinerary.notes?.length" class="mt-2 rounded-xl bg-slate-50 p-3">
      <p class="mb-1 text-xs font-medium text-slate-500">行程说明</p>
      <ul class="list-disc space-y-1 pl-4 text-xs text-slate-500">
        <li v-for="(n, i) in itinerary.notes" :key="i">{{ n }}</li>
      </ul>
    </div>
  </div>
  <div v-else class="flex flex-col items-center justify-center py-16 text-center">
    <p class="text-sm text-slate-400">暂无行程数据</p>
  </div>
</template>
