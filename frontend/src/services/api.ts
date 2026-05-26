/**
 * API 服务
 */
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { message } from 'antd'
import { API_BASE_URL } from '../config/api'
import { authService } from './auth'
import { networkStatusManager, isNetworkOnline } from '../utils/networkStatus'

// 创建 axios 实例
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 是否正在刷新 token
let isRefreshing = false
// 等待刷新完成的请求队列
let failedQueue: Array<{
  resolve: (value?: any) => void
  reject: (error?: any) => void
}> = []

// 处理等待队列
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 检查网络状态，如果网络断开则直接拒绝请求
    if (!isNetworkOnline()) {
      // 显示离线提示（避免重复提示）
      if (networkStatusManager.shouldShowOfflineMessage()) {
        networkStatusManager.markOfflineMessageShown()
        message.warning('网络连接已断开，请检查网络设置', 3)
      }
      
      // 创建一个网络错误，直接拒绝请求
      const networkError = new Error('网络连接已断开')
      ;(networkError as any).code = 'ERR_NETWORK_OFFLINE'
      ;(networkError as any).isNetworkError = true
      return Promise.reject(networkError)
    }

    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // 如果是FormData，不设置Content-Type，让浏览器自动设置（包含boundary）
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 提取错误消息的辅助函数
const extractErrorMessage = (data: any): string => {
  if (!data) return '请求失败，请稍后重试'
  
  // FastAPI 验证错误格式：{ detail: [{ msg: "...", ... }] }
  if (Array.isArray(data.detail)) {
    return data.detail.map((item: any) => item.msg || JSON.stringify(item)).join('; ')
  }
  
  // 普通错误格式：{ detail: "错误消息" }
  if (typeof data.detail === 'string') {
    return data.detail
  }
  
  // 其他格式
  return JSON.stringify(data.detail) || '请求失败，请稍后重试'
}

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    return response.data
  },
  async (error: AxiosError<{ detail: string | Array<any> }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    
    if (error.response) {
      const { status, data } = error.response
      
      // 401 错误：尝试刷新 token
      if (status === 401 && originalRequest && !originalRequest._retry) {
        const currentPath = window.location.pathname
        
        // 如果是认证相关接口（登录、刷新、获取当前用户），不进行自动刷新
        if (originalRequest.url?.includes('/auth/login') || 
            originalRequest.url?.includes('/auth/refresh') ||
            originalRequest.url?.includes('/auth/me')) {
          return Promise.reject(error)
        }
        
        // 如果已经在刷新，将请求加入队列
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject })
          })
            .then((token) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`
              }
              return apiClient(originalRequest)
            })
            .catch((err) => {
              return Promise.reject(err)
            })
        }
        
        originalRequest._retry = true
        isRefreshing = true
        
        const refreshToken = localStorage.getItem('refresh_token')
        
        if (refreshToken) {
          try {
            const response = await authService.refreshToken(refreshToken)
            const { access_token, refresh_token: new_refresh_token } = response
            
            localStorage.setItem('token', access_token)
            localStorage.setItem('refresh_token', new_refresh_token)
            
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${access_token}`
            }
            
            processQueue(null, access_token)
            isRefreshing = false
            
            // 重试原始请求
            return apiClient(originalRequest)
          } catch (refreshError) {
            // 刷新失败，清除所有 token
            processQueue(refreshError, null)
            isRefreshing = false
            localStorage.removeItem('token')
            localStorage.removeItem('refresh_token')
            
            // 如果不在登录页面，才跳转并提示
            if (currentPath !== '/login') {
              window.location.href = '/login'
              message.error('登录已过期，请重新登录')
            }
            return Promise.reject(refreshError)
          }
        } else {
          // 没有 refresh token，清除 token 并跳转登录
          isRefreshing = false
          localStorage.removeItem('token')
          localStorage.removeItem('refresh_token')
          
          if (currentPath !== '/login') {
            window.location.href = '/login'
            message.error('登录已过期，请重新登录')
          }
          return Promise.reject(error)
        }
      } else if (status === 400) {
        // 400 业务错误交给各页面用 message / 表单展示；此处必须 reject，否则请求 Promise 不落定，会出现按钮一直 loading
        if (import.meta.env.DEV) {
          console.warn('业务逻辑错误 (400):', extractErrorMessage(data))
        }
        return Promise.reject(error)
      } else if (status === 401) {
        // 401 错误：登录接口的错误由登录页面自己处理，不在这里显示全局提示
        // 其他401错误（如token过期）由各自的错误处理逻辑处理
        const isLoginEndpoint = originalRequest?.url?.includes('/auth/login')
        if (isLoginEndpoint) {
          // 登录接口的401错误（用户名或密码错误）是正常的业务逻辑，不输出到控制台
          // 登录页面会处理并显示友好的错误提示
        } else {
          // 非登录接口的401错误，已经在上面处理（token刷新逻辑）
          // 这里不需要额外处理
        }
      } else if (status === 403) {
        // 登录接口和详情页面的错误由各自页面自己处理，不在这里显示全局提示
        // 详情页面的错误由页面组件自己处理（通过 ErrorBoundary），避免重复显示错误提示
        const isDetailPage = originalRequest?.url?.match(/\/api\/(tasks|work-orders|opportunities|visit-logs|reviews)\/\d+$/)
        // Profile 页面的错误也由页面自己处理
        const isProfilePage = originalRequest?.url?.includes('/api/auth/me')
        const isLoginEndpoint = originalRequest?.url?.includes('/auth/login')
        if (!isLoginEndpoint && !isDetailPage && !isProfilePage) {
          message.error(extractErrorMessage(data) || '无权访问')
        }
      } else if (status === 404) {
        // 详情页面的错误由页面组件自己处理（通过 ErrorBoundary），避免重复显示错误提示
        const isDetailPage = originalRequest?.url?.match(/\/api\/(tasks|work-orders|opportunities|visit-logs|reviews)\/\d+$/)
        // /my-group 接口现在返回 null 而不是 404，但为了保险起见也排除它
        const isMyGroupEndpoint = originalRequest?.url?.includes('/groups/me/my-group')
        // 头像文件不存在时，前端已有 onError 处理，不需要显示全局错误提示
        const isAvatarEndpoint = originalRequest?.url?.includes('/upload/avatars/')
        if (!isDetailPage && !isMyGroupEndpoint && !isAvatarEndpoint) {
          message.error('资源不存在')
        }
      } else if (status === 422) {
        // 422 验证错误 - 登录接口和详情页面的错误由各自页面自己处理
        const isDetailPage = originalRequest?.url?.match(/\/api\/(tasks|work-orders|opportunities|visit-logs|reviews)\/\d+$/)
        const isLoginEndpoint = originalRequest?.url?.includes('/auth/login')
        if (!isLoginEndpoint && !isDetailPage) {
          const errorMsg = extractErrorMessage(data)
          message.error(`参数验证失败: ${errorMsg}`)
        }
      } else if (status === 423) {
        // 423 账户锁定 - 登录接口和详情页面的错误由各自页面自己处理
        const isDetailPage = originalRequest?.url?.match(/\/api\/(tasks|work-orders|opportunities|visit-logs|reviews)\/\d+$/)
        const isLoginEndpoint = originalRequest?.url?.includes('/auth/login')
        if (!isLoginEndpoint && !isDetailPage) {
          message.error(extractErrorMessage(data) || '账户已被锁定')
        }
      } else if (status === 429) {
        // 429 请求过于频繁 - 登录接口的错误由登录页面自己处理
        const isLoginEndpoint = originalRequest?.url?.includes('/auth/login')
        if (!isLoginEndpoint) {
          message.error(extractErrorMessage(data) || '请求过于频繁，请稍后再试')
        }
      } else {
        // 其他错误 - 详情页面的错误由页面组件自己处理
        const isDetailPage = originalRequest?.url?.match(/\/api\/(tasks|work-orders|opportunities|visit-logs|reviews)\/\d+$/)
        if (!isDetailPage) {
          message.error(extractErrorMessage(data) || '请求失败，请稍后重试')
        }
      }
    } else if (error.request) {
      // 检查是否是网络断开错误
      const isNetworkOffline = (error as any).isNetworkError || 
                                error.code === 'ERR_NETWORK_OFFLINE' ||
                                !isNetworkOnline()
      
      if (isNetworkOffline) {
        // 网络断开，显示离线提示
        if (networkStatusManager.shouldShowOfflineMessage()) {
          networkStatusManager.markOfflineMessageShown()
          message.warning('网络连接已断开，请检查网络设置', 3)
        }
        // 在开发环境下记录错误
        if (import.meta.env.DEV) {
          console.warn('网络连接错误:', error.message || '网络请求失败')
        }
        return Promise.reject(error)
      }
      
      // 对于创建任务的POST请求，不显示全局错误，由组件自己处理
      // 因为组件有逻辑检查任务是否真的创建成功（即使遇到CORS错误）
      const isCreateTaskRequest = originalRequest?.method?.toUpperCase() === 'POST' && 
                                   originalRequest?.url?.includes('/api/tasks') &&
                                   !originalRequest?.url?.includes('/api/tasks/') // 排除其他POST请求如确认、派单等
      
      if (!isCreateTaskRequest) {
        message.error('网络错误，请检查网络连接')
      }
      
      // 在开发环境下记录错误
      if (import.meta.env.DEV) {
        console.warn('网络请求失败:', error.message || '请求超时或网络错误')
      }
    } else {
      // 检查是否是网络断开错误
      const isNetworkOffline = (error as any).isNetworkError || 
                                error.code === 'ERR_NETWORK_OFFLINE' ||
                                !isNetworkOnline()
      
      if (isNetworkOffline) {
        // 网络断开，显示离线提示
        if (networkStatusManager.shouldShowOfflineMessage()) {
          networkStatusManager.markOfflineMessageShown()
          message.warning('网络连接已断开，请检查网络设置', 3)
        }
        // 在开发环境下记录错误
        if (import.meta.env.DEV) {
          console.warn('网络连接错误:', error.message || '网络连接已断开')
        }
        return Promise.reject(error)
      }
      
      message.error('请求失败，请稍后重试')
      
      // 在开发环境下记录错误
      if (import.meta.env.DEV) {
        console.warn('请求错误:', error.message || '未知错误')
      }
    }

    // 必须 reject 原始 AxiosError：用 { ...error } 展开会丢失 response 等非枚举字段，
    // 导致各页面 error?.response?.data?.detail 取不到、React Query 状态异常（按钮一直 loading）
    const friendlyMessage = error.response
      ? extractErrorMessage(error.response.data)
      : error.message || '请求失败，请稍后重试'
    ;(error as any).friendlyMessage = friendlyMessage
    ;(error as any)._handled = true
    return Promise.reject(error)
  }
)

export default apiClient

