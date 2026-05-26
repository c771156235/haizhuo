/**
 * 认证服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'

export interface LoginRequest {
  username: string
  password: string
  captcha_token: string  // 验证码token
  captcha_answer: number  // 用户输入的验证码答案
}

export interface UserRoleInfo {
  id: number
  role: string
  sales_unit?: string
  is_current: boolean
  is_active: boolean
  approval_status: string
  rejection_reason?: string
  approved_at?: string
  created_at: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  roles?: UserRoleInfo[]
  current_role?: UserRoleInfo
}

export interface RefreshTokenRequest {
  refresh_token: string
}

export interface User {
  id: number
  username: string
  real_name: string
  email?: string
  phone?: string
  role?: string  // 向后兼容字段
  sales_unit?: string  // 向后兼容字段
  avatar?: string
  is_active: boolean
  created_at: string
  updated_at: string
  roles?: UserRoleInfo[]  // 所有角色列表
  current_role?: UserRoleInfo  // 当前激活的角色
}

export interface CaptchaResponse {
  image: string  // base64图片
  captcha_token: string  // JWT token
  question?: string  // 题目文字 (调试用)
}

export const authService = {
  /**
   * 获取验证码
   */
  getCaptcha: async (): Promise<CaptchaResponse> => {
    return apiClient.get(API_ENDPOINTS.CAPTCHA)
  },

  /**
   * 登录
   */
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    return apiClient.post(API_ENDPOINTS.LOGIN, data)
  },

  /**
   * 刷新令牌
   */
  refreshToken: async (refreshToken: string): Promise<LoginResponse> => {
    return apiClient.post(API_ENDPOINTS.REFRESH, { refresh_token: refreshToken })
  },

  /**
   * 获取当前用户信息
   */
  getCurrentUser: async (): Promise<User> => {
    return apiClient.get(API_ENDPOINTS.ME)
  },

  /**
   * 修改密码
   */
  changePassword: async (data: { old_password: string; new_password: string }): Promise<{ message: string }> => {
    return apiClient.post(API_ENDPOINTS.CHANGE_PASSWORD, data)
  },

  /**
   * 切换角色
   */
  switchRole: async (roleId: number): Promise<LoginResponse> => {
    return apiClient.post(API_ENDPOINTS.SWITCH_ROLE, { role_id: roleId })
  },
}

export interface UserRegister {
  username: string
  real_name: string
  email?: string
  phone?: string
  password: string
  sales_unit?: string
}

export interface CheckUsernameResponse {
  available: boolean
  message: string
}

export const registerService = {
  /**
   * 检查用户名是否可用
   */
  checkUsername: async (username: string): Promise<CheckUsernameResponse> => {
    return apiClient.get(API_ENDPOINTS.CHECK_USERNAME, {
      params: { username }
    })
  },

  /**
   * 用户注册
   */
  register: async (data: UserRegister): Promise<User> => {
    return apiClient.post(API_ENDPOINTS.REGISTER, data)
  },
}

