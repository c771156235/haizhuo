/**
 * 用户服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'
import { PaginatedResponse } from '../types/common'

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
  approval_status?: string
  rejection_reason?: string
  approved_at?: string
  approved_by?: number
  created_at: string
  updated_at: string
  roles?: UserRoleInfo[]  // 所有角色列表
  current_role?: UserRoleInfo  // 当前激活的角色
  leader_groups?: Array<{ id: number; name: string }>  // 组长所属的组信息（仅当用户是组长时才有值）
}

export interface UserCreate {
  username: string
  real_name: string
  email: string
  phone: string
  role: string
  sales_unit?: string
  password: string
}

export interface UserUpdate {
  real_name?: string
  email?: string
  phone?: string
  sales_unit?: string
  avatar?: string
  is_active?: boolean
}

export interface UserListParams {
  role?: string
  search?: string
  approval_status?: string
  my_group?: boolean  // 仅获取当前用户组内的成员（仅组长可用）
  page?: number
  page_size?: number
}

export interface UserRegister {
  username: string
  real_name: string
  email?: string
  phone?: string
  password: string
  sales_unit?: string
}

export interface UserApprovalRequest {
  action: 'approve' | 'reject'
  rejection_reason?: string
}

export interface AddUserRoleRequest {
  role: string
  sales_unit?: string
}

export const userService = {
  /**
   * 获取用户列表（支持分页和搜索）
   */
  getUsers: async (params?: UserListParams): Promise<PaginatedResponse<User>> => {
    const queryParams: any = {}
    if (params?.role) queryParams.role = params.role
    if (params?.search) queryParams.search = params.search
    if (params?.approval_status) queryParams.approval_status = params.approval_status
    if (params?.my_group !== undefined) queryParams.my_group = params.my_group
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    return apiClient.get(API_ENDPOINTS.USERS, { params: queryParams })
  },

  /**
   * 获取用户详情
   */
  getUser: async (id: number): Promise<User> => {
    return apiClient.get(`${API_ENDPOINTS.USERS}/${id}`)
  },

  /**
   * 创建用户
   */
  createUser: async (data: UserCreate): Promise<User> => {
    return apiClient.post(API_ENDPOINTS.USERS, data)
  },

  /**
   * 更新用户
   */
  updateUser: async (id: number, data: UserUpdate): Promise<User> => {
    return apiClient.put(`${API_ENDPOINTS.USERS}/${id}`, data)
  },

  /**
   * 删除用户（软删除）
   */
  deleteUser: async (id: number): Promise<void> => {
    return apiClient.delete(`${API_ENDPOINTS.USERS}/${id}`)
  },

  /**
   * 重置用户密码
   */
  resetPassword: async (id: number): Promise<User> => {
    return apiClient.post(`${API_ENDPOINTS.USERS}/${id}/reset-password`)
  },

  /**
   * 审核用户
   */
  approveUser: async (id: number, data: UserApprovalRequest): Promise<User> => {
    return apiClient.post(`${API_ENDPOINTS.USERS}/${id}/approve`, data)
  },

  /**
   * 添加用户角色
   */
  addUserRole: async (userId: number, data: AddUserRoleRequest): Promise<User> => {
    return apiClient.post(`${API_ENDPOINTS.USERS}/${userId}/roles`, data)
  },

  /**
   * 删除用户角色
   */
  removeUserRole: async (userId: number, roleId: number): Promise<User> => {
    return apiClient.delete(`${API_ENDPOINTS.USERS}/${userId}/roles/${roleId}`)
  },
}
