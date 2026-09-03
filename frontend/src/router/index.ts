import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/Home.vue') },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: { guestOnly: true, title: '登录' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/Register.vue'),
    meta: { guestOnly: true, title: '注册' },
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/views/Chat.vue'),
    meta: { requiresAuth: true, title: 'AI 旅行助手' },
  },
  {
    path: '/trips',
    name: 'trips',
    component: () => import('@/views/Trips.vue'),
    meta: { requiresAuth: true, title: '我的旅行' },
  },
  {
    path: '/trips/:id',
    name: 'trip-detail',
    component: () => import('@/views/TripDetail.vue'),
    meta: { requiresAuth: true, title: '行程详情' },
  },
  {
    path: '/trips/:id/edit',
    name: 'trip-edit',
    component: () => import('@/views/TripEdit.vue'),
    meta: { requiresAuth: true, title: '编辑行程' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  document.title = to.meta.title ? `${to.meta.title} · TripAgent` : 'TripAgent · AI 旅行规划助手'

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'chat' }
  }
  if (auth.isAuthenticated && !auth.user) {
    auth.fetchMe().catch(() => {
      /* 拉取用户信息失败不阻塞路由 */
    })
  }
  return true
})

export default router
