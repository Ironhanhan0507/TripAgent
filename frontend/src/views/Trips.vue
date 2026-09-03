<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Compass, Delete, Edit, Location, View } from '@element-plus/icons-vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { tripsApi } from '@/api/trips'
import type { SavedTrip } from '@/types'

const router = useRouter()
const trips = ref<SavedTrip[]>([])
const loading = ref(false)

function dayCount(t: SavedTrip): number {
  return t.itineraryData?.days?.length ?? 0
}

function cost(t: SavedTrip): number {
  return (t.itineraryData?.days ?? []).reduce((s, d) => s + d.activities.reduce((x, a) => x + (a.cost || 0), 0), 0)
}

function fmtDate(s: string): string {
  if (!s) return ''
  const [, m, d] = s.split('-')
  return `${m}月${d}日`
}

async function load() {
  loading.value = true
  try {
    trips.value = await tripsApi.list()
  } finally {
    loading.value = false
  }
}

async function onDelete(t: SavedTrip) {
  try {
    await ElMessageBox.confirm(`确定删除「${t.title}」吗？此操作不可恢复。`, '删除行程', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await tripsApi.remove(t.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="flex min-h-full flex-col bg-slate-50">
    <AppHeader />
    <div class="mx-auto w-full max-w-6xl flex-1 p-6">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">我的旅行</h1>
          <p class="mt-1 text-sm text-slate-400">已保存的 {{ trips.length }} 份行程</p>
        </div>
        <router-link to="/chat">
          <el-button type="primary" round><el-icon class="mr-1"><Compass /></el-icon>去规划一次旅行</el-button>
        </router-link>
      </div>

      <div v-loading="loading">
        <div v-if="trips.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="t in trips"
            :key="t.id"
            class="group flex cursor-pointer flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
            @click="router.push({ name: 'trip-detail', params: { id: t.id } })"
          >
            <div class="flex items-start justify-between gap-2">
              <h3 class="line-clamp-1 text-base font-semibold text-slate-900">{{ t.title }}</h3>
              <span class="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">v{{ t.version }}</span>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span class="inline-flex items-center gap-1"><el-icon :size="13"><Location /></el-icon>{{ t.destination }}</span>
              <span class="inline-flex items-center gap-1"><el-icon :size="13"><Calendar /></el-icon>{{ fmtDate(t.startDate) }} ~ {{ fmtDate(t.endDate) }}</span>
            </div>

            <p class="mt-1 text-xs text-slate-400">{{ dayCount(t) }} 天行程 · 预估人均 ¥{{ Math.round(cost(t)) }} {{ t.currency }}</p>

            <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <span class="text-[11px] text-slate-300">更新于 {{ new Date(t.updatedAt).toLocaleDateString() }}</span>
              <div class="flex gap-1 opacity-0 transition group-hover:opacity-100" @click.stop>
                <el-button size="small" circle text @click="router.push({ name: 'trip-edit', params: { id: t.id } })">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-button size="small" circle text type="danger" @click="onDelete(t)">
                  <el-icon><Delete /></el-icon>
                </el-button>
                <el-button size="small" circle text @click="router.push({ name: 'trip-detail', params: { id: t.id } })">
                  <el-icon><View /></el-icon>
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!loading" class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
          <el-icon class="text-4xl text-slate-200"><Compass /></el-icon>
          <p class="mt-4 text-slate-400">还没有保存的行程</p>
          <router-link to="/chat" class="mt-4">
            <el-button type="primary" round>去规划一次旅行</el-button>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
