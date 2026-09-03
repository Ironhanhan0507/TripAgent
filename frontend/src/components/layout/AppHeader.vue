<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Compass } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

async function onLogout() {
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-slate-100 bg-white/80 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
      <router-link to="/" class="flex items-center gap-2">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
          <el-icon :size="20"><Compass /></el-icon>
        </div>
        <span class="text-lg font-semibold tracking-tight text-slate-900">TripAgent</span>
      </router-link>
      <nav class="flex items-center gap-1 text-sm">
        <router-link to="/" class="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">首页</router-link>
        <router-link to="/chat" class="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">AI 助手</router-link>
        <router-link to="/trips" class="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">我的旅行</router-link>
        <el-dropdown v-if="auth.user" trigger="click">
          <button class="ml-2 flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1.5 hover:bg-slate-50">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {{ (auth.user.name || auth.user.email).slice(0, 1).toUpperCase() }}
            </span>
            <span class="max-w-28 truncate text-slate-700">{{ auth.user.name || auth.user.email }}</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="onLogout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </nav>
    </div>
  </header>
</template>
