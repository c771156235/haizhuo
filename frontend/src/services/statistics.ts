/**
 * 统计服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'

export interface TaskStatistics {
  total: number
  pending: number
  confirmed: number
  detail_submitted: number
  dispatched: number
  in_progress: number
  completed: number
  rejected: number
  cancelled: number
  completion_rate: number
}

export interface OpportunityStatistics {
  total: number
  created: number
  in_progress: number
  lost: number
  won: number
  conversion_rate: number
  loss_rate: number
}

export interface WorkOrderStatistics {
  total: number
  pending: number
  accepted: number
  in_progress: number
  completed: number
  cancelled: number
  completion_rate: number
}

export interface VisitLogStatistics {
  total: number
  with_opportunity: number
  without_opportunity: number
  opportunity_rate: number
}

export interface ReviewStatistics {
  total: number
}

export interface MemberWorkload {
  member_id: number
  member_name: string
  work_order_count: number
  visit_log_count: number
  completed_work_orders: number
}

export interface DashboardStatistics {
  tasks: TaskStatistics
  opportunities: OpportunityStatistics
  work_orders: WorkOrderStatistics
  visit_logs: VisitLogStatistics
  reviews: ReviewStatistics
  member_workloads: MemberWorkload[]
}

export interface TimeRangeStatistics {
  date: string
  task_count: number
  work_order_count: number
  visit_log_count: number
  opportunity_count: number
}

export interface SalesUnitStatistics {
  sales_unit: string
  task_count: number
  work_order_count: number
  opportunity_count: number
  conversion_rate: number
}

export interface SalesUnitPerformanceStatistics {
  sales_unit: string
  appointments_made: number  // 已预约（工单数量）
  visits_completed: number  // 已拜访（拜访日志数量）
  effective_appointment_rate: number  // 有效预约率
  has_decision_authority: number  // 有拜访对象权限（建议权或决策权）
  effective_visit_rate: number  // 有效拜访率
  lead_count: number  // 线索数量
  opportunity_count: number  // 商机数量
  lead_mining_rate: number  // 线索挖掘率
  lead_conversion_rate: number  // 线索转化率
}

export interface RequirementDirectionStatistics {
  direction: string
  count: number
}

export interface RequirementDirectionGroupStatistics {
  category: string
  directions: RequirementDirectionStatistics[]
}

export interface MemberDetailStatistics {
  member_id: number
  member_name: string
  appointments_made: number
  visits_completed: number
  effective_appointment_rate: number
  has_decision_authority: number
  effective_visit_rate: number
  lead_count: number
  opportunity_count: number
  lead_mining_rate: number
  lead_conversion_rate: number
}

export interface SalesUnitPerformanceResponse {
  statistics: SalesUnitPerformanceStatistics[]
  requirement_directions: RequirementDirectionGroupStatistics[]
  member_details?: MemberDetailStatistics[]
}

export interface OpportunityConvertedAmountStatistics {
  member_id?: number
  member_name?: string
  group_id?: number
  group_name?: string
  converted_count: number
  total_amount: number
}

export const statisticsService = {
  /**
   * 获取工作台统计数据
   */
  getDashboardStatistics: async (params?: {
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<DashboardStatistics> => {
    const queryParams: any = {}
    if (params?.group_id) queryParams.group_id = params.group_id
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    return apiClient.get(API_ENDPOINTS.STATISTICS_DASHBOARD, {
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined
    })
  },

  /**
   * 获取任务统计
   */
  getTaskStatistics: async (params?: {
    start_date?: string
    end_date?: string
  }): Promise<TaskStatistics> => {
    const queryParams: any = {}
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    return apiClient.get(API_ENDPOINTS.STATISTICS_TASKS, {
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined
    })
  },

  /**
   * 获取商机统计
   */
  getOpportunityStatistics: async (params?: {
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<OpportunityStatistics> => {
    const queryParams: any = {}
    if (params?.group_id) queryParams.group_id = params.group_id
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    return apiClient.get(API_ENDPOINTS.STATISTICS_OPPORTUNITIES, {
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined
    })
  },

  /**
   * 获取工单统计
   */
  getWorkOrderStatistics: async (params?: {
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<WorkOrderStatistics> => {
    const queryParams: any = {}
    if (params?.group_id) queryParams.group_id = params.group_id
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    return apiClient.get(API_ENDPOINTS.STATISTICS_WORK_ORDERS, {
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined
    })
  },

  /**
   * 获取成员工作量统计
   */
  getMemberWorkloads: async (params?: {
    limit?: number
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<MemberWorkload[]> => {
    const queryParams: any = {}
    if (params?.limit) queryParams.limit = params.limit
    if (params?.group_id) queryParams.group_id = params.group_id
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    return apiClient.get(API_ENDPOINTS.STATISTICS_MEMBER_WORKLOAD, {
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined
    })
  },

  /**
   * 获取时间段统计
   */
  getTimeRangeStatistics: async (params?: {
    start_date?: string
    end_date?: string
    group_by?: 'day' | 'week' | 'month'
    group_id?: number
  }): Promise<TimeRangeStatistics[]> => {
    return apiClient.get(API_ENDPOINTS.STATISTICS_TIME_RANGE, {
      params
    })
  },

  /**
   * 获取销售单位统计
   */
  getSalesUnitStatistics: async (params?: {
    group_id?: number
    start_date?: string
    end_date?: string
  }): Promise<SalesUnitStatistics[]> => {
    const queryParams: any = {}
    if (params?.group_id) queryParams.group_id = params.group_id
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    return apiClient.get(API_ENDPOINTS.STATISTICS_SALES_UNITS, {
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined
    })
  },

  /**
   * 获取销售单位绩效统计
   */
  getSalesUnitPerformanceStatistics: async (params?: {
    group_id?: number
    include_member_details?: boolean
    start_date?: string
    end_date?: string
  }): Promise<SalesUnitPerformanceResponse> => {
    const queryParams: any = {}
    if (params?.group_id) queryParams.group_id = params.group_id
    if (params?.include_member_details) queryParams.include_member_details = params.include_member_details
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    return apiClient.get(API_ENDPOINTS.STATISTICS_SALES_UNITS_PERFORMANCE, {
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined
    })
  },

  /**
   * 获取转订商机总金额统计
   */
  getOpportunityConvertedAmountStatistics: async (params?: {
    group_id?: number
    include_member_details?: boolean
    start_date?: string
    end_date?: string
  }): Promise<OpportunityConvertedAmountStatistics[]> => {
    const queryParams: any = {}
    if (params?.group_id) queryParams.group_id = params.group_id
    if (params?.include_member_details) queryParams.include_member_details = params.include_member_details
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    return apiClient.get(API_ENDPOINTS.STATISTICS_OPPORTUNITY_CONVERTED_AMOUNT, {
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined
    })
  },
}

