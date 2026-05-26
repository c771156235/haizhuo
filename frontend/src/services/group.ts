/**
 * 组管理服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'
import { PaginatedResponse } from '../types/common'

export interface GroupMemberInfo {
  id: number
  username: string
  real_name: string
  email?: string
  phone?: string
}

export interface Group {
  id: number
  name: string
  description?: string
  leader_id?: number  // 主组长ID（向后兼容）
  leader_name?: string  // 主组长名称（向后兼容）
  leader_ids?: number[]  // 所有组长ID列表
  leader_names?: string[]  // 所有组长名称列表
  member_count: number
  members: GroupMemberInfo[]
  created_at: string
  updated_at: string
}

export interface GroupCreate {
  name: string
  description?: string
  leader_ids?: number[]  // 组长ID列表（支持多个组长）
  member_ids?: number[]
}

export interface GroupUpdate {
  name?: string
  description?: string
  leader_ids?: number[]  // 组长ID列表（支持多个组长）
}

export interface GroupMemberAdd {
  user_ids: number[]
}

export interface GroupMemberRemove {
  user_ids: number[]
}

export interface GroupListParams {
  search?: string
  my_group?: boolean
  page?: number
  page_size?: number
}

export const groupService = {
  /**
   * 获取组列表（支持分页和搜索）
   */
  getGroups: async (params?: GroupListParams): Promise<PaginatedResponse<Group>> => {
    const queryParams: any = {}
    if (params?.search) queryParams.search = params.search
    if (params?.my_group !== undefined) queryParams.my_group = params.my_group
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    return apiClient.get(API_ENDPOINTS.GROUPS, { params: queryParams })
  },

  /**
   * 获取组详情
   */
  getGroup: async (id: number): Promise<Group> => {
    return apiClient.get(API_ENDPOINTS.GROUP_DETAIL(id))
  },

  /**
   * 创建组
   */
  createGroup: async (data: GroupCreate): Promise<Group> => {
    return apiClient.post(API_ENDPOINTS.GROUPS, data)
  },

  /**
   * 更新组
   */
  updateGroup: async (id: number, data: GroupUpdate): Promise<Group> => {
    return apiClient.put(API_ENDPOINTS.GROUP_DETAIL(id), data)
  },

  /**
   * 删除组
   */
  deleteGroup: async (id: number): Promise<void> => {
    return apiClient.delete(API_ENDPOINTS.GROUP_DETAIL(id))
  },

  /**
   * 添加组成员
   */
  addGroupMembers: async (id: number, data: GroupMemberAdd): Promise<Group> => {
    return apiClient.post(API_ENDPOINTS.GROUP_ADD_MEMBERS(id), data)
  },

  /**
   * 移除组成员
   */
  removeGroupMembers: async (id: number, data: GroupMemberRemove): Promise<Group> => {
    return apiClient.delete(API_ENDPOINTS.GROUP_REMOVE_MEMBERS(id), { data })
  },

  /**
   * 获取组成员列表
   */
  getGroupMembers: async (id: number): Promise<GroupMemberInfo[]> => {
    return apiClient.get(API_ENDPOINTS.GROUP_MEMBERS(id))
  },

  /**
   * 获取当前用户所属的组信息
   * 如果用户尚未被分配到任何组，返回 null（而不是抛出错误）
   */
  getMyGroup: async (): Promise<Group | null> => {
    return apiClient.get(API_ENDPOINTS.MY_GROUP)
  },
}

