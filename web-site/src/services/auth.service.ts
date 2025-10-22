// 认证相关API服务

import { fetchService } from './fetch'

// 登录接口参数
export interface LoginRequest {
  username: string
  password: string
}

// 登录响应（匹配后端 LoginDto 结构）
export interface LoginResponse {
  success: boolean
  token?: string
  refreshToken?: string
  user?: {
    id: string
    username: string  // 后端返回的是 name 而不是 username
    email: string
    roleName: string  // 后端返回的是单个 role 字符串
    avatar?: string
  }
  errorMessage?: string
}

// 第三方登录提供商
export interface ThirdPartyLoginProvider {
  name: string
  icon: string
  clientId: string
  redirectUri: string
}

// 第三方登录响应
export interface ThirdPartyLoginResponse {
  code: number
  data?: ThirdPartyLoginProvider[]
  message?: string
}

// 注册接口参数
export interface RegisterRequest {
  username: string
  email: string
  password: string
  confirmPassword: string
}

type UnknownRecord = Record<string, unknown>

interface RawLoginPayload extends Partial<LoginResponse> {
  Success?: boolean
  Token?: string
  RefreshToken?: string
  User?: LoginResponse['user']
  ErrorMessage?: string
}

interface WrappedResponse<T> {
  code: number
  data?: T
  message?: string
  success?: boolean
}

const isUnknownRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null

const isWrappedLoginResponse = (value: unknown): value is WrappedResponse<RawLoginPayload> =>
  isUnknownRecord(value) && typeof value.code === 'number'

const isLoginResponse = (value: unknown): value is LoginResponse =>
  isUnknownRecord(value) && typeof value.success === 'boolean'

const normalizeLoginPayload = (payload: RawLoginPayload): LoginResponse => ({
  success: Boolean(payload.success ?? payload.Success),
  token: (payload.token ?? payload.Token) ?? undefined,
  refreshToken: (payload.refreshToken ?? payload.RefreshToken) ?? undefined,
  user: (payload.user ?? payload.User) ?? undefined,
  errorMessage: (payload.errorMessage ?? payload.ErrorMessage) ?? undefined
})

const wrapLoginResponse = (data: LoginResponse): { data: LoginResponse } => ({ data })

const isWrappedThirdPartyResponse = (
  value: unknown
): value is WrappedResponse<ThirdPartyLoginProvider[]> =>
  isUnknownRecord(value) && typeof value.code === 'number'

class AuthService {
  private basePath = '/api/Auth'

  /**
   * 用户登录
   */
  async login(username: string, password: string): Promise<{ data: LoginResponse }> {
    const response = await fetchService.post<unknown>(`${this.basePath}/Login`, {
      username,
      password,
    })

    if (isWrappedLoginResponse(response) && response.data) {
      return wrapLoginResponse(normalizeLoginPayload(response.data))
    }

    if (isLoginResponse(response)) {
      return wrapLoginResponse(response)
    }

    // 兼容直接返回的格式
    return wrapLoginResponse({
      success: false,
      token: undefined,
      refreshToken: undefined,
      user: undefined,
      errorMessage: isUnknownRecord(response) && typeof response.message === 'string'
        ? response.message
        : '登录失败'
    })
  }

  /**
   * 用户注册
   */
  async register(data: RegisterRequest): Promise<{ data: LoginResponse }> {
    const response = await fetchService.post<unknown>(`${this.basePath}/Register`, {
      userName: data.username,
      email: data.email,
      password: data.password
    })

    if (isWrappedLoginResponse(response) && response.data) {
      return wrapLoginResponse(normalizeLoginPayload(response.data))
    }

    if (isLoginResponse(response)) {
      return wrapLoginResponse(response)
    }

    return wrapLoginResponse({
      success: false,
      token: undefined,
      refreshToken: undefined,
      user: undefined,
      errorMessage: isUnknownRecord(response) && typeof response.message === 'string'
        ? response.message
        : '注册失败'
    })
  }

  /**
   * 获取支持的第三方登录方式
   */
  async getSupportedThirdPartyLogins(): Promise<ThirdPartyLoginResponse> {
    const response = await fetchService.get<unknown>(`${this.basePath}/GetSupportedThirdPartyLogins`)

    if (isWrappedThirdPartyResponse(response)) {
      return {
        code: response.code,
        data: response.data,
        message: response.message
      }
    }

    if (Array.isArray(response)) {
      return { code: 200, data: response }
    }

    return { code: 200, data: [], message: undefined }
  }

  /**
   * 刷新Token
   */
  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    return fetchService.post<LoginResponse>(`${this.basePath}/refresh-token`, {
      refreshToken,
    })
  }

  /**
   * 用户登出
   */
  async logout(): Promise<void> {
    return fetchService.post<void>(`${this.basePath}/logout`)
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<LoginResponse['user']> {
    return fetchService.get<LoginResponse['user']>(`${this.basePath}/me`)
  }

  /**
   * OAuth回调处理
   */
  async oauthCallback(code: string, state?: string): Promise<LoginResponse> {
    return fetchService.post<LoginResponse>(`${this.basePath}/oauth/callback`, {
      code,
      state,
    })
  }

  /**
   * 忘记密码
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message?: string }> {
    return fetchService.post<{ success: boolean; message?: string }>(`${this.basePath}/forgot-password`, {
      email,
    })
  }

  /**
   * 重置密码
   */
  async resetPassword(token: string, password: string): Promise<{ success: boolean; message?: string }> {
    return fetchService.post<{ success: boolean; message?: string }>(`${this.basePath}/reset-password`, {
      token,
      password,
    })
  }
}

// 导出单例实例
export const authService = new AuthService()

// 导出便捷方法（保持与原版兼容）
export const login = authService.login.bind(authService)
export const getSupportedThirdPartyLogins = authService.getSupportedThirdPartyLogins.bind(authService)

export default AuthService
