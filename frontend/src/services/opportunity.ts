/**
 * 商机服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'
import { PaginatedResponse } from '../types/common'

export interface CollaborativeMember {
  id: number
  opportunity_id: number
  member_id: number
  role?: string
  description?: string
  created_at: string
  // 关联信息
  member_name?: string
  member_username?: string
}

export interface Opportunity {
  id: number
  opportunity_no: string
  lead_id: number
  task_id: number
  team_leader_id: number
  customer_unit: string
  required_products?: string
  description?: string
  expected_amount?: string
  status: string
  lost_reason?: string
  won_amount?: string
  created_at: string
  updated_at: string
  status_changed_at?: string
  collaborative_members?: CollaborativeMember[]
  // 关联信息
  lead_customer_name?: string
  lead_requirement_direction?: string
  task_name?: string
  task_sales_unit?: string
  team_leader_name?: string
  team_leader_username?: string
}

export interface OpportunityCreate {
  opportunity_no: string
  lead_id: number
  task_id: number
  team_leader_id: number
  customer_unit: string
  required_products?: string
  description?: string
  expected_amount?: string
}

export interface OpportunityUpdate {
  customer_unit?: string
  required_products?: string
  description?: string
  expected_amount?: string
  status?: string
  lost_reason?: string
  won_amount?: string
}

export interface CollaborativeMemberCreate {
  member_id: number
  role?: string
  description?: string
}

export interface OpportunityListParams {
  task_id?: number
  status?: string
  member_id?: number
  required_product?: string
  start_date?: string
  end_date?: string
  search?: string
  page?: number
  page_size?: number
}

export const opportunityService = {
  /**
   * 获取商机列表（支持分页和搜索）
   */
  getOpportunities: async (params?: OpportunityListParams): Promise<PaginatedResponse<Opportunity>> => {
    const queryParams: any = {}
    if (params?.task_id) queryParams.task_id = params.task_id
    if (params?.status) queryParams.status = params.status
    if (params?.member_id) queryParams.member_id = params.member_id
    if (params?.required_product) queryParams.required_product = params.required_product
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    if (params?.search) queryParams.search = params.search
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    return apiClient.get(API_ENDPOINTS.OPPORTUNITIES, { params: queryParams })
  },

  /**
   * 获取商机详情
   */
  getOpportunity: async (id: number): Promise<Opportunity> => {
    return apiClient.get(API_ENDPOINTS.OPPORTUNITY_DETAIL(id))
  },

  /**
   * 创建商机
   */
  createOpportunity: async (data: OpportunityCreate): Promise<Opportunity> => {
    return apiClient.post(API_ENDPOINTS.OPPORTUNITIES, data)
  },

  /**
   * 更新商机
   */
  updateOpportunity: async (id: number, data: OpportunityUpdate): Promise<Opportunity> => {
    return apiClient.put(API_ENDPOINTS.OPPORTUNITY_DETAIL(id), data)
  },

  /**
   * 添加协同人员
   */
  addCollaborativeMember: async (id: number, data: CollaborativeMemberCreate): Promise<CollaborativeMember> => {
    return apiClient.post(API_ENDPOINTS.OPPORTUNITY_COLLABORATIVE_MEMBERS(id), data)
  },
}

