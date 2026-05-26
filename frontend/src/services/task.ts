/**
 * 任务服务
 */
import apiClient from './api'
import axios from 'axios'
import { API_ENDPOINTS, API_BASE_URL } from '../config/api'
import { PaginatedResponse } from '../types/common'

export interface Task {
  id: number
  task_name: string
  sales_unit: string
  start_date: string
  end_date: string
  fde_count: number
  customer_unit?: string
  industry_type?: string
  requirement_content?: string
  expected_visit_time?: string
  status: string
  rejection_reason?: string
  initiator_id: number
  manager_id?: number
  sales_contact_id?: number
  created_at: string
  updated_at: string
  confirmed_at?: string
  detail_submitted_at?: string
  is_task_initiator_created?: boolean  // 是否由专项任务发起人创建
}

export interface TaskCreate {
  task_name: string
  sales_unit: string
  start_date: string
  end_date: string
  fde_count: number
  // 仅在已确认后的修改场景使用，创建任务时不需要传递
  modify_reason?: string
}

export interface TaskDetailUpdate {
  customer_unit: string
  industry_type: string
  customer_source: string
  requirement_content: string
  expected_visit_time?: string
  customer_visit_address?: string
  customer_manager_name?: string
  customer_manager_contact?: string
}

export interface TaskDetailRequirement {
  id: number
  task_id: number
  customer_unit: string
  industry_type: string
  customer_source?: string
  requirement_content: string
  expected_visit_time?: string
  customer_visit_address?: string
  customer_manager_name?: string
  customer_manager_contact?: string
  sales_contact_id: number
  sales_contact_name?: string
  sales_contact_unit?: string
  created_at: string
  updated_at: string
  work_order_id?: number
  work_order_no?: string
  is_dispatched: boolean
  acceptor_id?: number  // 接单人ID（成员ID或组长ID）
  acceptor_name?: string  // 接单人姓名
}

export interface BatchImportResponse {
  success_count: number
  failed_count: number
  errors: string[]
  imported_requirements: TaskDetailRequirement[]
}

export interface TaskConfirm {
  confirmed: boolean
  sales_contact_id?: number
  rejection_reason?: string
}

export interface TaskClose {
  close_reason?: string
}

export interface TaskListParams {
  status?: string
  /** 任务名称模糊搜索 */
  task_name?: string
  /** 销售单位模糊搜索 */
  sales_unit?: string
  page?: number
  page_size?: number
}

export const taskService = {
  /**
   * 获取任务列表（支持分页和搜索）
   */
  getTasks: async (params?: TaskListParams): Promise<PaginatedResponse<Task>> => {
    const queryParams: any = {}
    if (params?.status) queryParams.status_filter = params.status
    if (params?.task_name) queryParams.task_name = params.task_name
    if (params?.sales_unit) queryParams.sales_unit = params.sales_unit
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    return apiClient.get(API_ENDPOINTS.TASKS, { params: queryParams })
  },

  /**
   * 获取任务详情
   */
  getTask: async (id: number): Promise<Task> => {
    return apiClient.get(API_ENDPOINTS.TASK_DETAIL(id))
  },

  /**
   * 创建任务
   */
  createTask: async (data: TaskCreate): Promise<Task> => {
    return apiClient.post(API_ENDPOINTS.TASKS, data)
  },

  /**
   * 更新任务（仅用于草稿状态的任务）
   */
  updateTask: async (id: number, data: TaskCreate): Promise<Task> => {
    return apiClient.put(API_ENDPOINTS.TASK_UPDATE(id), data)
  },

  /**
   * 删除任务（仅草稿状态，且创建者可以删除）
   */
  deleteTask: async (id: number): Promise<void> => {
    return apiClient.delete(API_ENDPOINTS.TASK_DELETE(id))
  },

  /**
   * 发起任务（将草稿状态改为待确认）
   */
  submitTask: async (id: number): Promise<Task> => {
    return apiClient.post(API_ENDPOINTS.TASK_SUBMIT(id))
  },

  /**
   * 撤回任务（创建者撤回已发起的任务）
   */
  revokeTask: async (id: number): Promise<Task> => {
    return apiClient.post(API_ENDPOINTS.TASK_REVOKE(id))
  },

  /**
   * 确认或拒绝任务
   */
  confirmTask: async (id: number, data: TaskConfirm): Promise<Task> => {
    return apiClient.post(API_ENDPOINTS.TASK_CONFIRM(id), data)
  },

  /**
   * 关闭任务
   */
  closeTask: async (id: number, data: TaskClose): Promise<Task> => {
    return apiClient.post(API_ENDPOINTS.TASK_CLOSE(id), data)
  },

  /**
   * 提交详细需求单
   */
  submitDetail: async (id: number, data: TaskDetailUpdate): Promise<Task> => {
    return apiClient.put(API_ENDPOINTS.TASK_DETAIL_SUBMIT(id), data)
  },

  /**
   * 下载详细需求单 Excel 模板
   */
  downloadDetailRequirementTemplate: async (id: number): Promise<Blob> => {
    const response = await axios.get(
      `${API_BASE_URL}${API_ENDPOINTS.TASK_DETAIL_REQUIREMENTS_TEMPLATE(id)}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        responseType: 'blob',
      }
    )
    return response.data
  },

  /**
   * 批量导入详细需求单
   */
  batchImportDetailRequirements: async (id: number, file: File): Promise<BatchImportResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post(API_ENDPOINTS.TASK_DETAIL_REQUIREMENTS_BATCH_IMPORT(id), formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  /**
   * 获取任务的详细需求列表
   */
  getTaskDetailRequirements: async (id: number, params?: { page?: number; page_size?: number }): Promise<PaginatedResponse<TaskDetailRequirement>> => {
    return apiClient.get(API_ENDPOINTS.TASK_DETAIL_REQUIREMENTS(id), {
      params
    })
  },

  /**
   * 针对详细需求派单
   */
  dispatchDetailRequirement: async (task_id: number, requirement_id: number, team_leader_id: number): Promise<any> => {
    return apiClient.post(API_ENDPOINTS.TASK_DETAIL_REQUIREMENT_DISPATCH(task_id, requirement_id), {
      team_leader_id
    })
  },

  /**
   * 删除/作废详细需求
   */
  deleteTaskDetailRequirement: async (task_id: number, requirement_id: number): Promise<void> => {
    return apiClient.delete(API_ENDPOINTS.TASK_DETAIL_REQUIREMENT_DELETE(task_id, requirement_id))
  },
}

