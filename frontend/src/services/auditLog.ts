/**
 * 操作日志服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'
import { PaginatedResponse } from '../types/common'

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  VIEW = 'view',
  CONFIRM = 'confirm',
  REJECT = 'reject',
  DISPATCH = 'dispatch',
  ASSIGN = 'assign',
  ACCEPT = 'accept',
  SUBMIT = 'submit',
  RESET_PASSWORD = 'reset_password',
}

export enum AuditResource {
  TASK = 'task',
  WORK_ORDER = 'work_order',
  OPPORTUNITY = 'opportunity',
  VISIT_LOG = 'visit_log',
  DELIVERY_CASE = 'delivery_case',
  REVIEW = 'review',
  USER = 'user',
  GROUP = 'group',
  LEAD = 'lead',
  OPTION_CONFIG = 'option_config',
  UNKNOWN = 'unknown',
}

export const AuditActionLabels: Record<AuditAction, string> = {
  [AuditAction.CREATE]: '创建',
  [AuditAction.UPDATE]: '更新',
  [AuditAction.DELETE]: '删除',
  [AuditAction.VIEW]: '查看',
  [AuditAction.CONFIRM]: '确认',
  [AuditAction.REJECT]: '拒绝',
  [AuditAction.DISPATCH]: '派单',
  [AuditAction.ASSIGN]: '分配',
  [AuditAction.ACCEPT]: '接单',
  [AuditAction.SUBMIT]: '提交',
  [AuditAction.RESET_PASSWORD]: '重置密码',
}

export const AuditResourceLabels: Record<AuditResource, string> = {
  [AuditResource.TASK]: '任务',
  [AuditResource.WORK_ORDER]: '工单',
  [AuditResource.OPPORTUNITY]: '商机',
  [AuditResource.VISIT_LOG]: '拜访日志',
  [AuditResource.DELIVERY_CASE]: '交付案例',
  [AuditResource.REVIEW]: '复盘',
  [AuditResource.USER]: '用户',
  [AuditResource.GROUP]: '组',
  [AuditResource.LEAD]: '线索',
  [AuditResource.OPTION_CONFIG]: '选项配置',
  [AuditResource.UNKNOWN]: '其他',
}

export interface AuditLog {
  id: number
  user_id: number
  user_name?: string
  user_username?: string
  action: AuditAction
  resource: AuditResource | string
  resource_id?: number
  description?: string
  details?: Record<string, any>
  ip_address?: string
  user_agent?: string
  created_at: string
}

export interface AuditLogListParams {
  user_id?: number
  action?: AuditAction
  resource?: AuditResource
  resource_id?: number
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}

export const auditLogService = {
  /**
   * 获取操作日志列表
   */
  getAuditLogs: async (params?: AuditLogListParams): Promise<PaginatedResponse<AuditLog>> => {
    const queryParams: any = {}
    if (params?.user_id) queryParams.user_id = params.user_id
    if (params?.action) queryParams.action = params.action
    if (params?.resource) queryParams.resource = params.resource
    if (params?.resource_id) queryParams.resource_id = params.resource_id
    if (params?.start_date) queryParams.start_date = params.start_date
    if (params?.end_date) queryParams.end_date = params.end_date
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    
    return apiClient.get(API_ENDPOINTS.AUDIT_LOGS, { params: queryParams })
  },

  /**
   * 获取操作日志详情
   */
  getAuditLog: async (id: number): Promise<AuditLog> => {
    return apiClient.get(API_ENDPOINTS.AUDIT_LOG_DETAIL(id))
  },

  deleteAuditLog: async (id: number): Promise<void> => {
    await apiClient.delete(API_ENDPOINTS.AUDIT_LOG_DELETE(id))
  },
}

