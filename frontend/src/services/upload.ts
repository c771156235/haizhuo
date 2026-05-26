/**
 * 文件上传服务
 */
import apiClient from './api'
import { API_ENDPOINTS, API_BASE_URL } from '../config/api'

export interface UploadAvatarResponse {
  url: string
  message: string
}

export const uploadService = {
  /**
   * 上传头像
   */
  uploadAvatar: async (file: File): Promise<UploadAvatarResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    
    return apiClient.post(API_ENDPOINTS.UPLOAD_AVATAR, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  /**
   * 获取头像URL（完整路径）
   */
  getAvatarUrl: (avatarPath?: string): string | undefined => {
    if (!avatarPath) return undefined
    // 如果已经是完整URL，直接返回
    if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) {
      return avatarPath
    }
    // 后端返回的路径格式是 /api/upload/avatars/{filename}
    // API_BASE_URL 是 http://localhost:8000/api
    // 需要去掉 API_BASE_URL 的 /api 后缀，然后拼接路径
    if (avatarPath.startsWith('/api/')) {
      const baseUrl = API_BASE_URL.replace(/\/api$/, '')
      return `${baseUrl}${avatarPath}`
    }
    // 其他相对路径
    if (avatarPath.startsWith('/')) {
      return `${API_BASE_URL}${avatarPath}`
    }
    return `${API_BASE_URL}/${avatarPath}`
  },
}

