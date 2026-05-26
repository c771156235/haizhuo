/**
 * 日志工具
 * 根据环境变量控制日志输出，生产环境不暴露敏感信息
 */

const isDevelopment = process.env.NODE_ENV === 'development'

export const logger = {
  /**
   * 错误日志
   * @param message 错误消息
   * @param error 错误对象（可选，仅开发环境输出）
   */
  error: (message: string, error?: any) => {
    if (isDevelopment) {
      console.error(message, error)
    } else {
      // 生产环境只输出简化的错误消息，不包含错误对象详情
      console.error(message)
      // 可以在这里集成错误监控服务（如 Sentry）
      // errorTrackingService.captureException(error)
    }
  },

  /**
   * 警告日志
   * @param message 警告消息
   * @param args 额外参数（可选，仅开发环境输出）
   */
  warn: (message: string, ...args: any[]) => {
    if (isDevelopment) {
      console.warn(message, ...args)
    }
    // 生产环境不输出警告日志
  },

  /**
   * 信息日志
   * @param message 信息消息
   * @param args 额外参数（可选，仅开发环境输出）
   */
  log: (message: string, ...args: any[]) => {
    if (isDevelopment) {
      console.log(message, ...args)
    }
    // 生产环境不输出普通日志
  },

  /**
   * 调试日志
   * @param message 调试消息
   * @param args 额外参数（可选，仅开发环境输出）
   */
  debug: (message: string, ...args: any[]) => {
    if (isDevelopment) {
      console.debug(message, ...args)
    }
    // 生产环境不输出调试日志
  },
}

export default logger
