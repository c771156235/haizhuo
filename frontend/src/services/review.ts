/**
 * 复盘服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'
import { PaginatedResponse } from '../types/common'

export interface Review {
  id: number
  visit_log_id: number
  team_leader_id: number
  comment?: string
  review_summary?: string
  created_at: string
  updated_at: string
  // 关联信息
  visit_log_visit_date?: string
  visit_log_work_order_no?: string
  visit_log_task_name?: string
  visit_log_task_sales_unit?: string
  team_leader_name?: string
  team_leader_username?: string
}

export interface ReviewCreate {
  visit_log_id: number
  comment?: string
  review_summary?: string
}

export interface ReviewUpdate {
  comment?: string
  review_summary?: string
}

export interface ReviewListParams {
  visit_log_id?: number
  page?: number
  page_size?: number
}

export const reviewService = {
  /**
   * 获取复盘列表（支持分页）
   */
  getReviews: async (params?: ReviewListParams): Promise<PaginatedResponse<Review>> => {
    const queryParams: any = {}
    if (params?.visit_log_id) queryParams.visit_log_id = params.visit_log_id
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    return apiClient.get(API_ENDPOINTS.REVIEWS, { params: queryParams })
  },

  /**
   * 获取复盘详情
   */
  getReview: async (id: number): Promise<Review> => {
    return apiClient.get(API_ENDPOINTS.REVIEW_DETAIL(id))
  },

  /**
   * 创建复盘
   */
  createReview: async (data: ReviewCreate): Promise<Review> => {
    return apiClient.post(API_ENDPOINTS.REVIEWS, data)
  },

  /**
   * 更新复盘
   */
  updateReview: async (id: number, data: ReviewUpdate): Promise<Review> => {
    return apiClient.put(API_ENDPOINTS.REVIEW_DETAIL(id), data)
  },
}

