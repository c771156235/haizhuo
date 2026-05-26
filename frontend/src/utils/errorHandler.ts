/**
 * 错误处理工具
 * 区分业务逻辑错误和系统错误，使用合适的日志级别
 */
import logger from './logger'

/**
 * 判断是否是业务逻辑错误（400、401、403、404、422、423、429等）
 * 这些错误是正常的业务逻辑，不应该记录为error
 */
export const isBusinessLogicError = (status?: number): boolean => {
  if (!status) return false
  return status >= 400 && status < 500
}

/**
 * 判断是否是系统错误（500+）
 * 这些是真正的系统错误，应该记录为error
 */
export const isSystemError = (status?: number): boolean => {
  if (!status) return false
  return status >= 500
}

/**
 * 判断是否是网络错误（没有response）
 */
export const isNetworkError = (error: any): boolean => {
  return !error?.response && (error?.request || error?.code === 'ERR_NETWORK' || error?.code === 'ECONNABORTED')
}

/**
 * 记录错误日志，根据错误类型使用合适的日志级别
 * @param context 上下文信息（如：'登录失败'、'获取数据失败'）
 * @param error 错误对象
 * @param options 可选配置
 */
export const logError = (
  context: string,
  error: any,
  options?: {
    /** 是否强制记录为error（即使它是业务逻辑错误） */
    forceError?: boolean
    /** 额外的日志数据 */
    extra?: Record<string, any>
  }
) => {
  const status = error?.response?.status
  const isBusinessError = isBusinessLogicError(status)
  const isSysError = isSystemError(status)
  const isNetError = isNetworkError(error)

  // 系统错误或网络错误：记录为error
  if (isSysError || isNetError || options?.forceError) {
    logger.error(`${context}`, { ...options?.extra, error, status })
    return
  }

  // 业务逻辑错误：使用debug级别（开发环境可见，生产环境不输出）
  if (isBusinessError) {
    logger.debug(`${context}：业务逻辑错误 (${status})`, {
      ...options?.extra,
      status,
      message: error?.response?.data?.detail || error?.message,
    })
    return
  }

  // 其他未知错误：使用warn级别
  logger.warn(`${context}`, { ...options?.extra, error, status })
}

/**
 * 提取错误消息
 */
export const extractErrorMessage = (error: any, defaultMessage: string = '操作失败，请稍后重试'): string => {
  if (!error) {
    return defaultMessage
  }

  // api 拦截器在原始 error 上挂载的友好文案（与 response 二选一即可）
  if (typeof error.friendlyMessage === 'string' && error.friendlyMessage.trim()) {
    return error.friendlyMessage.trim()
  }

  // 网络错误
  if (!error.response) {
    if (error.request) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return '请求超时，请检查网络连接后重试'
      }
      return '网络连接失败，请检查您的网络设置后重试'
    }
    return error.message || defaultMessage
  }

  // HTTP错误
  const { data } = error.response
  if (data?.detail) {
    if (Array.isArray(data.detail)) {
      return data.detail.map((item: any) => item.msg || JSON.stringify(item)).join('; ')
    } else if (typeof data.detail === 'string') {
      return data.detail
    }
  }

  return defaultMessage
}

