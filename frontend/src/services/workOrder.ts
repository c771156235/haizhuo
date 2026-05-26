/**
 * 工单服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'
import { PaginatedResponse } from '../types/common'

export interface WorkOrder {
  id: number
  work_order_no: string
  task_id: number
  team_leader_id?: number
  member_id?: number
  status: string
  created_at: string
  updated_at: string
  accepted_at?: string
  completed_at?: string
  cancelled_at?: string
  cancellation_reason?: string
  // 关联信息
  task_name?: string
  task_sales_unit?: string
  team_leader_name?: string
  team_leader_username?: string
  /** 工单组长所属 FDE 组名 */
  group_name?: string
  member_name?: string
  member_username?: string
  // 详细需求信息
  detail_requirement_id?: number
  customer_unit?: string
  industry_type?: string
  customer_source?: string
  requirement_content?: string
  expected_visit_time?: string
  customer_visit_address?: string
  customer_manager_name?: string
  customer_manager_contact?: string
  sales_contact_name?: string
  sales_contact_unit?: string
}

export interface WorkOrderCreate {
  work_order_no: string
  task_id: number
  team_leader_id: number
  member_id?: number
}

export interface WorkOrderAssign {
  member_id: number
}

export interface WorkOrderTeamLeaderUpdate {
  team_leader_id: number
  reason?: string
}

export interface WorkOrderCancel {
  cancellation_reason?: string
}

export interface WorkOrderTransfer {
  target_type: 'member' | 'team_leader'
  target_user_id: number
  reason?: string
}

/** 「转给组内成员」时下拉候选（与后端同组校验一致） */
export interface IntraGroupTransferMember {
  id: number
  username: string
  real_name: string
}

export interface WorkOrderListParams {
  task_id?: number
  status?: string
  search?: string
  team_leader_id?: number
  member_id?: number
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}

export const workOrderService = {
  /**
   * 获取工单列表（支持分页和搜索）
   */
  getWorkOrders: async (params?: WorkOrderListParams): Promise<PaginatedResponse<WorkOrder>> => {
    const queryParams: any = {}
    if (params?.task_id) queryParams.task_id = params.task_id
    if (params?.status) queryParams.status = params.status
    if (params?.search) queryParams.search = params.search
    if (params?.team_leader_id) queryParams.team_leader_id = params.team_leader_id
    if (params?.member_id) queryParams.member_id = params.member_id
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    return apiClient.get(API_ENDPOINTS.WORK_ORDERS, { params: queryParams })
  },

  /**
   * 获取工单详情
   */
  getWorkOrder: async (id: number): Promise<WorkOrder> => {
    return apiClient.get(API_ENDPOINTS.WORK_ORDER_DETAIL(id))
  },

  /**
   * 创建工单
   */
  createWorkOrder: async (data: WorkOrderCreate): Promise<WorkOrder> => {
    return apiClient.post(API_ENDPOINTS.WORK_ORDERS, data)
  },

  /**
   * 转派工单给成员
   */
  claimWorkOrder: async (id: number): Promise<WorkOrder> => {
    return apiClient.post(API_ENDPOINTS.WORK_ORDER_CLAIM(id))
  },

  assignWorkOrder: async (id: number, data: WorkOrderAssign): Promise<WorkOrder> => {
    return apiClient.post(API_ENDPOINTS.WORK_ORDER_ASSIGN(id), data)
  },

  /**
   * 接单
   */
  acceptWorkOrder: async (id: number): Promise<WorkOrder> => {
    return apiClient.post(API_ENDPOINTS.WORK_ORDER_ACCEPT(id))
  },

  /**
   * 标记工单为已拜访（调用完成接口）
   */
  completeWorkOrder: async (id: number): Promise<WorkOrder> => {
    return apiClient.post(API_ENDPOINTS.WORK_ORDER_COMPLETE(id))
  },

  /**
   * 取消工单
   */
  cancelWorkOrder: async (id: number, data: WorkOrderCancel): Promise<WorkOrder> => {
    return apiClient.post(API_ENDPOINTS.WORK_ORDER_CANCEL(id), data)
  },

  /**
   * 撤回工单转派（组长）
   */
  revokeWorkOrder: async (id: number): Promise<WorkOrder> => {
    return apiClient.post(API_ENDPOINTS.WORK_ORDER_REVOKE(id))
  },

  /**
   * 成员转单（同组转成员 / 跨组转组长）
   */
  transferWorkOrder: async (id: number, data: WorkOrderTransfer): Promise<WorkOrder> => {
    return apiClient.post(API_ENDPOINTS.WORK_ORDER_TRANSFER(id), data)
  },

  /**
   * 成员转单：组内成员候选（仅本组组长所属组、已审核成员角色，不含自己）
   */
  getIntraGroupTransferMembers: async (workOrderId: number): Promise<IntraGroupTransferMember[]> => {
    return apiClient.get(API_ENDPOINTS.WORK_ORDER_INTRA_GROUP_TRANSFER_MEMBERS(workOrderId))
  },

  /**
   * 修改工单组长（总管）
   */
  updateWorkOrderTeamLeader: async (id: number, data: WorkOrderTeamLeaderUpdate): Promise<WorkOrder> => {
    return apiClient.put(API_ENDPOINTS.WORK_ORDER_UPDATE_TEAM_LEADER(id), data)
  },
}
