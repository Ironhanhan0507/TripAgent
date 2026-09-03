import client from './client'
import type { AuthResponse, User } from '@/types'

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload extends LoginPayload {
  name?: string
}

export const authApi = {
  register: (data: RegisterPayload) =>
    client.post<AuthResponse>('/api/v1/auth/register', data).then((r) => r.data),
  login: (data: LoginPayload) =>
    client.post<AuthResponse>('/api/v1/auth/login', data).then((r) => r.data),
  refresh: (refreshToken: string) =>
    client.post<AuthResponse>('/api/v1/auth/refresh', { refreshToken }).then((r) => r.data),
  logout: (refreshToken: string) =>
    client.post('/api/v1/auth/logout', { refreshToken }).then((r) => r.data),
  me: () => client.get<User>('/api/v1/auth/me').then((r) => r.data),
}
