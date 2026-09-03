import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiErrorBody } from '@/types'
import { tokenStorage } from './token'
import { authApi } from './auth'

// API 基址：默认同源（dev 走 Vite 代理），生产可用 VITE_API_BASE 指向后端。
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? '',
  timeout: 20000,
})

client.interceptors.request.use((config) => {
  const token = tokenStorage.access
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

// 401 且非认证接口：自动用 refresh token 刷新后重放请求。
client.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as RetriableConfig | undefined
    const status = error.response?.status
    const url = original?.url ?? ''

    if (status === 401 && original && !original._retry && !url.includes('/auth/')) {
      original._retry = true
      const refreshToken = tokenStorage.refresh
      if (refreshToken) {
        try {
          const res = await authApi.refresh(refreshToken)
          tokenStorage.set(res.accessToken, res.refreshToken)
          original.headers.Authorization = `Bearer ${res.accessToken}`
          return client(original)
        } catch {
          tokenStorage.clear()
        }
      }
    }
    return Promise.reject(error)
  },
)

// 从错误对象提取可读信息（优先后端 message，其次 HTTP 状态文案）。
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? error.message ?? '请求失败，请稍后重试'
  }
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

export default client
