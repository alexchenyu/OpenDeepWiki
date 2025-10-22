import { fetchService, type FetchOptions } from '@/services/fetch'

type RequestOptions = FetchOptions

const getAuthToken = (): string => localStorage.getItem('auth-token') ?? ''

const requestInterceptor = (headers: HeadersInit = {}): HeadersInit => {
  const token = getAuthToken()
  return {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

const withAuthHeaders = (options?: RequestOptions): RequestOptions => ({
  ...options,
  headers: requestInterceptor(options?.headers)
})

export const request = {
  async get<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return fetchService.get<T>(url, withAuthHeaders(options))
  },

  async post<T = unknown, D = unknown>(url: string, data?: D, options?: RequestOptions): Promise<T> {
    return fetchService.post<T, D>(url, data, withAuthHeaders(options))
  },

  async put<T = unknown, D = unknown>(url: string, data?: D, options?: RequestOptions): Promise<T> {
    return fetchService.put<T, D>(url, data, withAuthHeaders(options))
  },

  async delete<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return fetchService.delete<T>(url, withAuthHeaders(options))
  }
}

export default request
