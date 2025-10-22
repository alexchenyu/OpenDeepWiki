// 用户认证状态管理Store

import { create } from 'zustand'
import { authService } from '@/services/auth.service'
import type { LoginResponse, RegisterRequest } from '@/services/auth.service'
import { getErrorMessage } from '@/lib/errors'
interface AuthUser {
  id: string
  username: string
  email: string
  role?: string
  avatar?: string
  bio?: string
  location?: string
  website?: string
  company?: string
  createdAt?: string
  updatedAt?: string
  lastLoginAt?: string
}

interface AuthState {
  // 状态
  user: AuthUser | null
  token: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  
  // Actions
  login: (username: string, password: string) => Promise<boolean>
  register: (data: RegisterRequest) => Promise<boolean>
  logout: () => void
  refreshTokenHandle: () => Promise<boolean>
  getCurrentUser: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  clearError: () => void
  initializeAuth: () => void
}

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('userToken')
}

const getStoredRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('refreshToken')
}

const getStoredUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null
  try {
    const userInfo = localStorage.getItem('userInfo')
    if (!userInfo) {
      return null
    }
    const parsed = JSON.parse(userInfo) as Partial<AuthUser>
    if (parsed && typeof parsed.id === 'string' && typeof parsed.username === 'string' && typeof parsed.email === 'string') {
      return {
        id: parsed.id,
        username: parsed.username,
        email: parsed.email,
        role: parsed.role,
        avatar: parsed.avatar,
        bio: parsed.bio,
        location: parsed.location,
        website: parsed.website,
        company: parsed.company,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        lastLoginAt: parsed.lastLoginAt,
      }
    }
    return null
  } catch {
    return null
  }
}

const storeAuthData = (data: LoginResponse) => {
  if (typeof window === 'undefined') return

  if (data.token) {
    localStorage.setItem('userToken', data.token)
  }
  if (data.refreshToken) {
    localStorage.setItem('refreshToken', data.refreshToken)
  }
  const adaptedUser = mapToUser(data.user)
  if (adaptedUser) {
    localStorage.setItem('userInfo', JSON.stringify(adaptedUser))
  }
}

const clearAuthData = () => {
  if (typeof window === 'undefined') return
  
  localStorage.removeItem('userToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('userInfo')
  localStorage.removeItem('redirectPath')
}

const mapToUser = (user?: LoginResponse['user']): AuthUser | null => {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.roleName,
    avatar: user.avatar,
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // 初始状态
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  // 登录
  login: async (username: string, password: string) => {
    set({ loading: true, error: null })
    
    try {
      const response = await authService.login(username, password)
      
      if (response.data.success) {
        storeAuthData(response.data)

        set({
          user: mapToUser(response.data.user),
          token: response.data.token || null,
          refreshToken: response.data.refreshToken || null,
          isAuthenticated: true,
          loading: false,
        })

        return true
      } else {
        set({
          error: response.data.errorMessage || '登录失败',
          loading: false,
        })
        return false
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, '登录过程中发生错误')
      set({
        error: message,
        loading: false,
      })
      return false
    }
  },

  // 注册
  register: async (data: RegisterRequest) => {
    set({ loading: true, error: null })
    
    try {
      const response = await authService.register(data)
      
      if (response.data.success) {
        storeAuthData(response.data)

        set({
          user: mapToUser(response.data.user),
          token: response.data.token || null,
          refreshToken: response.data.refreshToken || null,
          isAuthenticated: true,
          loading: false,
        })

        return true
      } else {
        set({
          error: response.data.errorMessage || '注册失败',
          loading: false,
        })
        return false
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, '注册过程中发生错误')
      set({
        error: message,
        loading: false,
      })
      return false
    }
  },

  // 登出
  logout: () => {
    clearAuthData()
    
    // 调用后端登出接口（可选，不影响前端状态）
    authService.logout().catch(console.error)
    
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null,
    })
  },

  // 刷新Token
  refreshTokenHandle: async () => {
    const { refreshToken } = get()
    if (!refreshToken) return false
    
    try {
      const response = await authService.refreshToken(refreshToken)
      
      if (response.success) {
        storeAuthData(response)

        set({
          user: mapToUser(response.user),
          token: response.token || null,
          refreshToken: response.refreshToken || refreshToken,
          isAuthenticated: true,
        })
        
        return true
      } else {
        get().logout()
        return false
      }
    } catch (error: unknown) {
      console.error('刷新Token失败:', error)
      get().logout()
      return false
    }
  },

  // 获取当前用户信息
  getCurrentUser: async () => {
    if (!get().isAuthenticated) return
    
    try {
      const loginUser = await authService.getCurrentUser()
      const adapted = mapToUser(loginUser)
      if (adapted) {
        localStorage.setItem('userInfo', JSON.stringify(adapted))
        set({ user: adapted })
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  },

  // 设置用户信息
  setUser: (user) => {
    set({ user })
    if (user) {
      localStorage.setItem('userInfo', JSON.stringify(user))
    }
  },

  // 清除错误
  clearError: () => {
    set({ error: null })
  },

  // 初始化认证状态
  initializeAuth: () => {
    const token = getStoredToken()
    const refreshToken = getStoredRefreshToken()
    const user = getStoredUser()
    
    if (token && user) {
      set({
        user,
        token,
        refreshToken,
        isAuthenticated: true,
      })
    }
  },
}))

// 自动初始化认证状态
if (typeof window !== 'undefined') {
  useAuthStore.getState().initializeAuth()
}

export default useAuthStore
