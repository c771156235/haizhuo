/**
 * 拜访日志服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'
import { PaginatedResponse } from '../types/common'

export interface VisitLog {
  id: number
  work_order_id: number
  member_id: number
  visit_date: string
  visit_content: string
  remark?: string | null
  visit_object_position?: string
  /** 建议权 | 决策权 | 无 */
  has_decision_authority?: string | null
  has_clue?: boolean
  /** 线索对应产品（JSON数组格式，支持多选） */
  clue_related_products?: string | null
  /** 服务端按 option_configs 解析后的可读文本（与导出一致）；旧接口可能无此字段 */
  clue_related_products_display?: string | null
  /** 当前阶段 */
  current_stage?: string | null
  /** 阶段人员与时长 JSON：[{sub_phase, people, days}] */
  stage_effort_breakdown?: string | null
  /** 推进进展 */
  promotion_progress?: string | null
  /** 推进进展追加历史（JSON 数组字符串） */
  promotion_progress_history?: string | null
  /** 推进要求 */
  promotion_requirements?: string | null
  /** 是否定开 */
  is_customized_development?: boolean
  /** 定开要求（是否定开为是时填写） */
  customized_development_requirements?: string | null
  /** 预估金额（万元） */
  project_amount?: string | null
  /** 客户是否梳理过需求场景 */
  has_requirement_scenario_sorted?: boolean
  /** 需求场景分类（JSON数组格式，支持多选） */
  requirement_scenario_category?: string | null
  opportunity_no?: string
  /** 手动填写，与任务无关联 */
  industry?: string
  /** 大型企业 | 小微企业 | 中型企业 | 事业单位 | 政府单位 */
  enterprise_type?: string
  /** 详细需求快照：拜访地址 / 客户经理 / 联系方式 */
  customer_visit_address?: string
  customer_manager_name?: string
  customer_manager_contact?: string
  /** 陪跑人员（手动填写） */
  escort_staff?: string
  created_at: string
  updated_at: string
  // 关联信息
  work_order_no?: string
  work_order_task_id?: number
  work_order_task_name?: string
  work_order_task_sales_unit?: string
  work_order_customer_unit?: string  // 客户单位
  /** 创建时落库：工单所属任务的面向销售单位 */
  sales_unit?: string | null
  /** 创建时落库的组长所属 FDE 组名 */
  group_name?: string
  /** 创建时落库的客户单位快照 */
  customer_unit?: string
  member_name?: string
  member_username?: string
}

export interface VisitLogCreate {
  work_order_id: number
  visit_date: string
  visit_content: string
  remark?: string
  visit_object_position?: string
  has_decision_authority?: string
  has_clue?: boolean
  clue_related_products?: string
  current_stage?: string
  stage_effort_breakdown?: string | null
  promotion_progress?: string
  promotion_requirements?: string
  is_customized_development?: boolean
  customized_development_requirements?: string | null
  project_amount?: string
  has_requirement_scenario_sorted?: boolean
  requirement_scenario_category?: string
  opportunity_no?: string
  industry: string
  enterprise_type: string
  escort_staff?: string
}

/** 线索维护窄域更新（PUT /visit-logs/:id） */
export interface VisitLogMaintenancePayload {
  clue_related_products?: string | null
  project_amount?: string | null
  current_stage?: string | null
  stage_effort_breakdown?: string | null
  promotion_requirements?: string | null
  promotion_progress_append?: string
}

export interface VisitLogListParams {
  work_order_id?: number
  work_order_no?: string
  task_id?: number
  member_id?: number
  has_clue?: boolean
  has_requirement_scenario_sorted?: boolean
  has_decision_authority?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}

export const visitLogService = {
  /**
   * 获取拜访日志列表（支持分页和筛选）
   */
  getVisitLogs: async (params?: VisitLogListParams): Promise<PaginatedResponse<VisitLog>> => {
    const queryParams: any = {}
    if (params?.work_order_id) queryParams.work_order_id = params.work_order_id
    if (params?.work_order_no) queryParams.work_order_no = params.work_order_no
    if (params?.task_id) queryParams.task_id = params.task_id
    if (params?.member_id) queryParams.member_id = params.member_id
    if (params?.has_clue !== undefined) queryParams.has_clue = params.has_clue
    if (params?.has_requirement_scenario_sorted !== undefined) queryParams.has_requirement_scenario_sorted = params.has_requirement_scenario_sorted
    if (params?.has_decision_authority !== undefined) queryParams.has_decision_authority = params.has_decision_authority
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    return apiClient.get(API_ENDPOINTS.VISIT_LOGS, { params: queryParams })
  },

  /**
   * 获取拜访日志详情
   */
  getVisitLog: async (id: number): Promise<VisitLog> => {
    return apiClient.get(API_ENDPOINTS.VISIT_LOG_DETAIL(id))
  },

  /**
   * 创建拜访日志
   */
  createVisitLog: async (data: VisitLogCreate): Promise<VisitLog> => {
    return apiClient.post(API_ENDPOINTS.VISIT_LOGS, data)
  },

  /**
   * 更新拜访日志
   */
  updateVisitLog: async (id: number, data: VisitLogMaintenancePayload): Promise<VisitLog> => {
    return apiClient.put(API_ENDPOINTS.VISIT_LOG_DETAIL(id), data)
  },
}

