import type { ApiError } from '@/services/fetch'

export interface NormalizedError {
  message: string
  status?: number
  code?: string
  cause?: unknown
}

const UNKNOWN_ERROR = '出现未知错误'

export const normalizeError = (error: unknown, fallback: string = UNKNOWN_ERROR): NormalizedError => {
  if (error instanceof Error) {
    return {
      message: error.message || fallback,
      status: 'status' in error && typeof (error as { status?: number }).status === 'number'
        ? (error as { status?: number }).status
        : undefined,
      cause: error.cause
    }
  }

  if (typeof error === 'string') {
    return { message: error }
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Partial<ApiError> & {
      errorMessage?: unknown
      error?: unknown
      detail?: unknown
    }

    const message =
      typeof candidate.message === 'string'
        ? candidate.message
        : typeof candidate.errorMessage === 'string'
          ? candidate.errorMessage
          : typeof candidate.error === 'string'
            ? candidate.error
            : typeof candidate.detail === 'string'
              ? candidate.detail
              : fallback

    return {
      message,
      status: typeof candidate.status === 'number' ? candidate.status : undefined,
      code: typeof candidate.code === 'string' ? candidate.code : undefined
    }
  }

  return { message: fallback }
}

export const getErrorMessage = (error: unknown, fallback: string = UNKNOWN_ERROR): string =>
  normalizeError(error, fallback).message

export default getErrorMessage
