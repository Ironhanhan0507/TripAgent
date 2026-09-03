<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Delete, Edit } from '@element-plus/icons-vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import PlanBudget from '@/components/plan/PlanBudget.vue'
import PlanMap from '@/components/plan/PlanMap.vue'
import PlanTimeline from '@/components/plan/PlanTimeline.vue'
import { tripsApi } from '@/api/trips'
import type { SavedTrip } from '@/types'

const route = useRoute()
const router = useRouter()
const trip = ref<SavedTrip | null>(null)
const loading = ref(false)
const view = ref<'dayplan' | 'map' | 'budget'>('dayplan')

const views = [
  { key: 'dayplan', label: '日计划' },
  { key: 'map', label: '地图' },
  { key: 'budget', label: '预算' },
] as const

async function load() {
  loading.value = true
  try {
    trip.value = await tripsApi.detail(String(route.params.id))
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function onDelete() {
  if (!trip.value) return
  try {
    await ElMessageBox.confirm(`确定删除「${trip.value.title}」吗？`, '删除行程', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  await tripsApi.remove(trip.value.id)
  ElMessage.success('已删除')
  router.replace({ name: 'trips' })
}

function fmtDate(s: string): string {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

onMounted(load)
</script>

<template>
  <div class="flex min-h-full flex-col bg-slate-50">
    <AppHeader />
    <div class="mx-auto w-full max-w-6xl flex-1 p-6">
      <div v-loading="loading">
        <template v-if="trip">
          <!-- 头部 -->
          <div class="mb-6">
            <button class="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-brand-600" @click="router.push({ name: 'trips' })">
              <el-icon :size="14"><ArrowLeft /></el-icon>返回我的旅行
            </button>
            <div class="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <h1 class="text-2xl font-bold text-slate-900">{{ trip.title }}</h1>
                  <span class="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">v{{ trip.version }}</span>
                </div>
                <p class="mt-1 text-sm text-slate-500">
                  {{ trip.destination }} · {{ trip.itineraryData.days.length }} 天 · {{ fmtDate(trip.startDate) }} ~ {{ fmtDate(trip.endDate) }}
                </p>
              </div>
              <div class="flex gap-2">
                <el-button @click="router.push({ name: 'trip-edit', params: { id: trip.id } })">
                  <el-icon class="mr-1"><Edit /></el-icon>编辑行程
                </el-button>
                <el-button type="danger" plain @click="onDelete">
                  <el-icon class="mr-1"><Delete /></el-icon>删除
                </el-button>
              </div>
            </div>
          </div>

          <!-- 视图切换 -->
          <div class="mb-4 flex w-fit gap-1 rounded-lg bg-white p-1 shadow-sm">
            <button
              v-for="v in views"
              :key="v.key"
              class="rounded-md px-4 py-1.5 text-sm font-medium transition"
              :class="view === v.key ? 'bg-brand-500 text-white' : 'text-slate-500 hover:text-slate-700'"
              @click="view = v.key"
            >
              {{ v.label }}
            </button>
          </div>

          <div class="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <PlanTimeline v-show="view === 'dayplan'" :itinerary="trip.itineraryData" />
            <PlanMap v-show="view === 'map'" :itinerary="trip.itineraryData" :active="view === 'map'" />
            <PlanBudget v-show="view === 'budget'" :itinerary="trip.itineraryData" :requirement="trip.requirement" />
          </div>
        </template>

        <div v-else-if="!loading" class="py-20 text-center text-slate-400">行程不存在或已删除</div>
      </div>
    </div>
  </div>
</template>
