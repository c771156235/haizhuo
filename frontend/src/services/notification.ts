/**
 * 通知服务
 */
import apiClient from './api'
import { PaginatedResponse } from '../types/common'

export enum NotificationType {
  TASK_PENDING = 'task_pending',
  TASK_CONFIRMED = 'task_confirmed',
  TASK_REJECTED = 'task_rejected',
  TASK_DETAIL_SUBMITTED = 'task_detail_submitted',
  TASK_DISPATCHED = 'task_dispatched',
  WORK_ORDER_ASSIGNED = 'work_order_assigned',
  WORK_ORDER_ACCEPTED = 'work_order_accepted',
  WORK_ORDER_COMPLETED = 'work_order_completed',
  WORK_ORDER_CANCELLED = 'work_order_cancelled',
  VISIT_LOG_CREATED = 'visit_log_created',
  REVIEW_CREATED = 'review_created',
  OPPORTUNITY_CREATED = 'opportunity_created',
  OPPORTUNITY_STATUS_CHANGED = 'opportunity_status_changed',
  LEAD_CREATED = 'lead_created',
  COLLABORATIVE_MEMBER_ADDED = 'collaborative_member_added',
  USER_REGISTRATION_PENDING = 'user_registration_pending',
  USER_APPROVED = 'user_approved',
  USER_REJECTED = 'user_rejected',
}

export const NotificationTypeLabels: Record<NotificationType, string> = {
  [NotificationType.TASK_PENDING]: '待确认任务',
  [NotificationType.TASK_CONFIRMED]: '任务已确认',
  [NotificationType.TASK_REJECTED]: '任务已拒绝',
  [NotificationType.TASK_DETAIL_SUBMITTED]: '详细需求已提交',
  [NotificationType.TASK_DISPATCHED]: '任务已派单',
  [NotificationType.WORK_ORDER_ASSIGNED]: '工单已分配',
  [NotificationType.WORK_ORDER_ACCEPTED]: '工单已接单',
  [NotificationType.WORK_ORDER_COMPLETED]: '工单已拜访',
  [NotificationType.WORK_ORDER_CANCELLED]: '工单已取消',
  [NotificationType.VISIT_LOG_CREATED]: '新的拜访日志',
  [NotificationType.REVIEW_CREATED]: '复盘已完成',
  [NotificationType.OPPORTUNITY_CREATED]: '新商机',
  [NotificationType.OPPORTUNITY_STATUS_CHANGED]: '商机状态变更',
  [NotificationType.LEAD_CREATED]: '新线索',
  [NotificationType.COLLABORATIVE_MEMBER_ADDED]: '协同人员已添加',
  [NotificationType.USER_REGISTRATION_PENDING]: '用户注册待审核',
  [NotificationType.USER_APPROVED]: '用户审核通过',
  [NotificationType.USER_REJECTED]: '用户审核拒绝',
}

export interface Notification {
  id: number
  user_id: number
  notification_type: NotificationType | string  // 支持字符串类型，因为后端可能返回字符串
  title: string
  content?: string
  resource_type?: string
  resource_id?: number
  is_read: boolean
  created_at: string
  read_at?: string
}

export interface NotificationListParams {
  is_read?: boolean
  notification_type?: NotificationType
  page?: number
  page_size?: number
}

export interface UnreadCountResponse {
  unread_count: number
}

const API_ENDPOINTS = {
  NOTIFICATIONS: '/notifications',
  NOTIFICATION_DETAIL: (id: number) => `/notifications/${id}`,
  NOTIFICATION_READ: (id: number) => `/notifications/${id}/read`,
  NOTIFICATION_READ_ALL: '/notifications/read-all',
  NOTIFICATION_UNREAD_COUNT: '/notifications/unread-count',
}

export const notificationService = {
  /**
   * 获取通知列表
   */
  getNotifications: async (params?: NotificationListParams): Promise<PaginatedResponse<Notification>> => {
    const queryParams: any = {}
    if (params?.is_read !== undefined) queryParams.is_read = params.is_read
    if (params?.notification_type) queryParams.notification_type = params.notification_type
    if (params?.page) queryParams.page = params.page
    if (params?.page_size) queryParams.page_size = params.page_size
    return apiClient.get(API_ENDPOINTS.NOTIFICATIONS, { params: queryParams })
  },

  /**
   * 获取通知详情
   */
  getNotification: async (id: number): Promise<Notification> => {
    return apiClient.get(API_ENDPOINTS.NOTIFICATION_DETAIL(id))
  },

  /**
   * 获取未读通知数量
   */
  getUnreadCount: async (): Promise<UnreadCountResponse> => {
    return apiClient.get(API_ENDPOINTS.NOTIFICATION_UNREAD_COUNT)
  },

  /**
   * 标记通知为已读
   */
  markAsRead: async (id: number): Promise<Notification> => {
    return apiClient.put(API_ENDPOINTS.NOTIFICATION_READ(id))
  },

  /**
   * 标记所有通知为已读
   */
  markAllAsRead: async (): Promise<{ message: string; count: number }> => {
    return apiClient.put(API_ENDPOINTS.NOTIFICATION_READ_ALL)
  },

  /**
   * 删除通知
   */
  deleteNotification: async (id: number): Promise<void> => {
    return apiClient.delete(API_ENDPOINTS.NOTIFICATION_DETAIL(id))
  },

  /**
   * 删除所有通知（或所有已读通知）
   */
  deleteAllNotifications: async (is_read?: boolean): Promise<void> => {
    const params = is_read !== undefined ? { is_read } : {}
    return apiClient.delete(API_ENDPOINTS.NOTIFICATIONS, { params })
  },
}

