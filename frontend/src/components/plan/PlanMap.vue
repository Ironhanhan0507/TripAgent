<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Activity, ActivityCategory, Itinerary } from '@/types'

// Map 视图：Leaflet + OpenStreetMap 渲染活动标记与每日路线。
// 数据来自 Itinerary 中 Planner 注入的 lat/lng（来自 PlacesProvider，渲染与数据源解耦）。
const props = defineProps<{ itinerary: Itinerary | null; active: boolean }>()

const mapEl = ref<HTMLElement | null>(null)
let map: L.Map | null = null
let layerGroup: L.LayerGroup | null = null
let lineGroup: L.LayerGroup | null = null

const activeDay = ref<number | 'all'>('all')

const categoryColor: Record<ActivityCategory, string> = {
  sightseeing: '#0ea5e9',
  dining: '#f59e0b',
  shopping: '#ec4899',
  transport: '#8b5cf6',
  hotel: '#6366f1',
  other: '#94a3b8',
}

const categoryLabel: Record<ActivityCategory, string> = {
  sightseeing: '景点',
  dining: '餐饮',
  shopping: '购物',
  transport: '交通',
  hotel: '住宿',
  other: '其他',
}

interface Point extends Activity {
  dayIndex: number
}

const points = computed<Point[]>(() => {
  const out: Point[] = []
  for (const d of props.itinerary?.days ?? []) {
    for (const a of d.activities) {
      if (typeof a.lat === 'number' && typeof a.lng === 'number') out.push({ ...a, dayIndex: d.dayIndex })
    }
  }
  return out
})

const dayChips = computed<Array<{ key: number | 'all'; label: string }>>(() => [
  { key: 'all', label: '全部' },
  ...(props.itinerary?.days ?? []).map((d) => ({ key: d.dayIndex, label: `D${d.dayIndex + 1}` })),
])

function pinHtml(a: Point, n: number): string {
  const hotel = a.category === 'hotel'
  return `<div class="ta-pin" style="background:${categoryColor[a.category]};${hotel ? 'border-radius:6px' : ''}">${n}</div>`
}

function renderLines(pts: Point[]) {
  lineGroup?.clearLayers()
  const days = [...new Set(pts.map((p) => p.dayIndex))]
  for (const di of days) {
    const isActive = activeDay.value === 'all' || activeDay.value === di
    const dayPts = pts.filter((p) => p.dayIndex === di).sort((a, b) => a.orderIndex - b.orderIndex)
    if (dayPts.length < 2) continue
    L.polyline(
      dayPts.map((p) => [p.lat!, p.lng!] as [number, number]),
      {
        color: isActive ? '#0d9488' : '#cbd5e1',
        weight: isActive ? 3 : 2,
        opacity: isActive ? 0.9 : 0.45,
        dashArray: isActive ? undefined : '4 4',
      },
    ).addTo(lineGroup!)
  }
}

function render() {
  if (!map) return
  layerGroup?.clearLayers()
  const pts = points.value
  if (!pts.length) return
  pts.forEach((p, i) => {
    const icon = L.divIcon({
      className: 'ta-div-icon',
      html: pinHtml(p, i + 1),
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14],
    })
    L.marker([p.lat!, p.lng!], { icon })
      .addTo(layerGroup!)
      .bindPopup(
        `<div style="font-size:12px;line-height:1.7"><b>${p.name}</b><br/>${p.startTime}–${p.endTime}<br/><span style="opacity:.65">${categoryLabel[p.category]} · ¥${p.cost}</span></div>`,
      )
  })
  renderLines(pts)
  map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat!, p.lng!] as [number, number])), { padding: [36, 36] })
}

onMounted(() => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, { zoomControl: false }).setView([30, 110], 10)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map)
  layerGroup = L.layerGroup().addTo(map)
  lineGroup = L.layerGroup().addTo(map)
  render()
})

watch(
  () => props.itinerary,
  () => {
    activeDay.value = 'all'
    render()
  },
)

watch(activeDay, () => renderLines(points.value))

watch(
  () => props.active,
  (v) => {
    if (v) nextTick(() => map?.invalidateSize())
  },
)

onBeforeUnmount(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div class="relative h-[420px] overflow-hidden rounded-xl border border-slate-200">
    <div ref="mapEl" class="absolute inset-0" />
    <div class="absolute left-2 top-2 z-[1000] flex max-w-[calc(100%-1rem)] flex-wrap gap-1 rounded-lg bg-white/95 p-1 shadow-sm backdrop-blur">
      <button
        v-for="c in dayChips"
        :key="c.key"
        class="rounded-md px-2 py-1 text-xs font-medium transition"
        :class="activeDay === c.key ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-100'"
        @click="activeDay = c.key"
      >
        {{ c.label }}
      </button>
    </div>
    <p v-if="!points.length" class="absolute inset-0 flex items-center justify-center bg-white text-sm text-slate-400">
      暂无坐标数据，无法渲染地图
    </p>
  </div>
</template>

<style>
/* leaflet divIcon 注入到地图容器 DOM，样式需为全局（非 scoped） */
.ta-div-icon {
  background: transparent;
  border: none;
}
.ta-pin {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35);
  box-sizing: border-box;
}
</style>
