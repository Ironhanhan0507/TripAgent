// Token 存取：与 Pinia / axios 解耦，避免循环依赖。
const ACCESS_KEY = 'tripagent_access_token'
const REFRESH_KEY = 'tripagent_refresh_token'

export const tokenStorage = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}
