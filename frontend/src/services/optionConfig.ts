/**
 * 选项配置服务
 */
import apiClient from './api'

export type OptionType = 'requirement_direction' | 'product' | 'member_menu_visibility'

export interface OptionConfig {
  id: number
  option_type: OptionType
  value: string
  label: string
  parent_id: number | null
  level: number
  sort_order: number
  is_active: boolean
  description: string | null
  created_at: string
  updated_at: string
  children?: OptionConfig[]
}

export interface OptionConfigCreate {
  option_type: OptionType
  value: string
  label: string
  parent_id?: number | null
  sort_order?: number
  is_active?: boolean
  description?: string | null
}

export interface OptionConfigUpdate {
  value?: string
  label?: string
  parent_id?: number | null
  sort_order?: number
  is_active?: boolean
  description?: string | null
}

export interface OptionConfigListResponse {
  items: OptionConfig[]
}

export interface MemberMenuVisibilityItem {
  menu_key: string
  label: string
  is_visible: boolean
}

export interface MemberMenuVisibilityListResponse {
  items: MemberMenuVisibilityItem[]
}

export const optionConfigService = {
  /**
   * 获取选项配置列表（公开接口，所有用户可访问）
   */
  getOptionConfigs: async (optionType: OptionType): Promise<OptionConfigListResponse> => {
    // apiClient 的响应拦截器已经返回了 response.data，所以这里直接返回 response
    const response = await apiClient.get<OptionConfigListResponse>(
      `/option-configs/${optionType}`
    )
    return response as unknown as OptionConfigListResponse
  },

  /**
   * 获取选项配置列表（管理接口，仅总管可访问，包含禁用项）
   */
  getOptionConfigsAdmin: async (optionType: OptionType): Promise<OptionConfigListResponse> => {
    // apiClient 的响应拦截器已经返回了 response.data，所以这里直接返回 response
    const response = await apiClient.get<OptionConfigListResponse>(
      `/option-configs/admin/${optionType}`
    )
    return response as unknown as OptionConfigListResponse
  },

  /**
   * 创建选项配置
   */
  createOptionConfig: async (data: OptionConfigCreate): Promise<OptionConfig> => {
    // apiClient 的响应拦截器已经返回了 response.data，所以这里直接返回 response
    const response = await apiClient.post<OptionConfig>(
      '/option-configs',
      data
    )
    return response as unknown as OptionConfig
  },

  /**
   * 更新选项配置
   */
  updateOptionConfig: async (id: number, data: OptionConfigUpdate): Promise<OptionConfig> => {
    // apiClient 的响应拦截器已经返回了 response.data，所以这里直接返回 response
    const response = await apiClient.put<OptionConfig>(
      `/option-configs/${id}`,
      data
    )
    return response as unknown as OptionConfig
  },

  /**
   * 删除选项配置（软删除：设置为禁用状态）
   */
  deleteOptionConfig: async (id: number): Promise<void> => {
    await apiClient.delete(`/option-configs/${id}`)
  },

  /**
   * 获取成员菜单可见性配置
   */
  getMemberMenuVisibility: async (): Promise<MemberMenuVisibilityListResponse> => {
    const response = await apiClient.get<MemberMenuVisibilityListResponse>(
      '/option-configs/member-menu-visibility'
    )
    return response as unknown as MemberMenuVisibilityListResponse
  },

  /**
   * 更新成员菜单可见性配置（仅总管）
   */
  updateMemberMenuVisibility: async (menuKey: string, isVisible: boolean): Promise<MemberMenuVisibilityItem> => {
    const response = await apiClient.put<MemberMenuVisibilityItem>(
      '/option-configs/member-menu-visibility',
      { menu_key: menuKey, is_visible: isVisible }
    )
    return response as unknown as MemberMenuVisibilityItem
  },
}

