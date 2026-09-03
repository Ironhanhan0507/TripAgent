import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { tokenStorage } from '@/api/token'
import type { AuthResponse, User } from '@/types'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    accessToken: tokenStorage.access,
  }),
  getters: {
    isAuthenticated: (state) => !!state.accessToken,
  },
  actions: {
    async login(email: string, password: string) {
      this.applyAuth(await authApi.login({ email, password }))
    },
    async register(email: string, password: string, name?: string) {
      this.applyAuth(await authApi.register({ email, password, name }))
    },
    applyAuth(res: AuthResponse) {
      tokenStorage.set(res.accessToken, res.refreshToken)
      this.accessToken = res.accessToken
      this.user = res.user
    },
    async fetchMe() {
      if (!this.accessToken) return
      this.user = await authApi.me()
    },
    async refresh() {
      const rt = tokenStorage.refresh
      if (!rt) throw new Error('no refresh token')
      this.applyAuth(await authApi.refresh(rt))
    },
    async logout() {
      const rt = tokenStorage.refresh
      if (rt) {
        authApi.logout(rt).catch(() => {
          /* 注销失败忽略 */
        })
      }
      tokenStorage.clear()
      this.accessToken = null
      this.user = null
    },
  },
})
