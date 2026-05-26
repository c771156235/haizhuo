/**
 * 线索服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'
import { PaginatedResponse } from '../types/common'

export interface Lead {
  id: number
  visit_log_id: number
  task_id: number
  member_id: number
  customer_name: string
  requirement_direction: string
  detail_description: string
  created_at: string
  updated_at: string
  // 关联信息
  task_name?: string
  task_sales_unit?: string
  member_name?: string
  member_username?: string
  // 工单信息（用于创建商机时确定team_leader_id）
  work_order_team_leader_id?: number  // 工单的组长ID
  
  // 商机信息
  has_opportunity?: boolean  // 是否已转换为商机
  opportunity_id?: number  // 关联的商机ID
}

export interface LeadCreate {
  visit_log_id: number
  task_id: number
  customer_name: string
  requirement_direction: string
  detail_description: string
}

export interface LeadUpdate {
  customer_name?: string
  requirement_direction?: string
  detail_description?: string
}

export interface LeadListParams {
  task_id?: number
  member_id?: number
  has_opportunity?: boolean
  requirement_direction?: string
  start_date?: string
  end_date?: string
  search?: string
  page?: number
  page_size?: number
}

export const leadService = {
  /**
   * 获取线索列表（支持分页和筛选）
   */
  getLeads: async (params?: LeadListParams): Promise<PaginatedResponse<Lead>> => {
    const queryParams: any = {}
    if (params?.task_id) queryParams.task_id = params.task_id
    if (params?.member_id) queryParams.member_id = params.member_id
    if (params?.has_opportunity !== undefined) queryParams.has_opportunity = params.has_opportunity
    if (params?.requirement_direction) queryParams.requirement_direction = params.requirement_direction
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    if (params?.search) queryParams.search = params.search
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    return apiClient.get(API_ENDPOINTS.LEADS, { params: queryParams })
  },

  /**
   * 获取线索详情
   */
  getLead: async (id: number): Promise<Lead> => {
    return apiClient.get(API_ENDPOINTS.LEAD_DETAIL(id))
  },

  /**
   * 创建线索
   */
  createLead: async (data: LeadCreate): Promise<Lead> => {
    return apiClient.post(API_ENDPOINTS.LEADS, data)
  },

  /**
   * 更新线索
   */
  updateLead: async (id: number, data: LeadUpdate): Promise<Lead> => {
    return apiClient.put(API_ENDPOINTS.LEAD_DETAIL(id), data)
  },

  /**
   * 删除线索
   */
  deleteLead: async (id: number): Promise<void> => {
    return apiClient.delete(API_ENDPOINTS.LEAD_DETAIL(id))
  },
}

