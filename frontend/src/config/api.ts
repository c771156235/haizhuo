/**
 * API 配置
 *
 * 默认 `API_BASE_URL` 为 `/api`：
 * - 开发：发到当前页面的 origin（如 http://同一内网IP:3000），由 Vite 代理到本机 localhost:8000
 * - 生产：由部署的反代转发 /api；覆盖请设 `VITE_API_BASE_URL`（如需直连后端可写完整 URL）
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const API_ENDPOINTS = {
  // 认证
  LOGIN: '/auth/login',
  REFRESH: '/auth/refresh',
  ME: '/auth/me',
  REGISTER: '/auth/register',
  CHECK_USERNAME: '/auth/check-username',
  CHANGE_PASSWORD: '/auth/change-password',
  SWITCH_ROLE: '/auth/switch-role',
  CAPTCHA: '/auth/captcha',  // 验证码接口
  
  // 用户
  USERS: '/users',
  USER_DETAIL: (id: number) => `/users/${id}`,
  
  // 任务
  TASKS: '/tasks',
  TASK_DETAIL: (id: number) => `/tasks/${id}`,
  TASK_UPDATE: (id: number) => `/tasks/${id}`,
  TASK_DELETE: (id: number) => `/tasks/${id}`,
  TASK_SUBMIT: (id: number) => `/tasks/${id}/submit`,
  TASK_REVOKE: (id: number) => `/tasks/${id}/revoke`,
  TASK_CONFIRM: (id: number) => `/tasks/${id}/confirm`,
  TASK_CLOSE: (id: number) => `/tasks/${id}/close`,
  TASK_DETAIL_SUBMIT: (id: number) => `/tasks/${id}/detail`,
  TASK_DETAIL_REQUIREMENTS: (id: number) => `/tasks/${id}/detail-requirements`,
  TASK_DETAIL_REQUIREMENTS_TEMPLATE: (id: number) => `/tasks/${id}/detail-requirements/template`,
  TASK_DETAIL_REQUIREMENTS_BATCH_IMPORT: (id: number) => `/tasks/${id}/detail-requirements/batch-import`,
  TASK_DETAIL_REQUIREMENT_DISPATCH: (task_id: number, requirement_id: number) => `/tasks/${task_id}/detail-requirements/${requirement_id}/dispatch`,
  TASK_DETAIL_REQUIREMENT_DELETE: (task_id: number, requirement_id: number) => `/tasks/${task_id}/detail-requirements/${requirement_id}`,
  
  // 工单
  WORK_ORDERS: '/work-orders',
  WORK_ORDER_DETAIL: (id: number) => `/work-orders/${id}`,
  WORK_ORDER_CLAIM: (id: number) => `/work-orders/${id}/claim`,
  WORK_ORDER_ASSIGN: (id: number) => `/work-orders/${id}/assign`,
  WORK_ORDER_ACCEPT: (id: number) => `/work-orders/${id}/accept`,
  WORK_ORDER_COMPLETE: (id: number) => `/work-orders/${id}/complete`,
  WORK_ORDER_CANCEL: (id: number) => `/work-orders/${id}/cancel`,
  WORK_ORDER_REVOKE: (id: number) => `/work-orders/${id}/revoke`,
  WORK_ORDER_TRANSFER: (id: number) => `/work-orders/${id}/transfer`,
  WORK_ORDER_INTRA_GROUP_TRANSFER_MEMBERS: (id: number) =>
    `/work-orders/${id}/transfer/intra-group-members`,
  WORK_ORDER_UPDATE_TEAM_LEADER: (id: number) => `/work-orders/${id}/team-leader`,
  
  // 拜访日志
  VISIT_LOGS: '/visit-logs',
  VISIT_LOG_DETAIL: (id: number) => `/visit-logs/${id}`,
  
  // 线索
  LEADS: '/leads',
  LEAD_DETAIL: (id: number) => `/leads/${id}`,
  
  // 复盘
  REVIEWS: '/reviews',
  REVIEW_DETAIL: (id: number) => `/reviews/${id}`,
  
  // 商机
  OPPORTUNITIES: '/opportunities',
  OPPORTUNITY_DETAIL: (id: number) => `/opportunities/${id}`,
  OPPORTUNITY_COLLABORATIVE_MEMBERS: (id: number) => `/opportunities/${id}/collaborative-members`,
  
  // 文件上传
  UPLOAD_AVATAR: '/upload/avatar',
  GET_AVATAR: (filename: string) => `/upload/avatars/${filename}`,
  // 统计
  STATISTICS_DASHBOARD: '/statistics/dashboard',
  STATISTICS_TASKS: '/statistics/tasks',
  STATISTICS_OPPORTUNITIES: '/statistics/opportunities',
  STATISTICS_WORK_ORDERS: '/statistics/work-orders',
  STATISTICS_MEMBER_WORKLOAD: '/statistics/members/workload',
  STATISTICS_TIME_RANGE: '/statistics/time-range',
  STATISTICS_SALES_UNITS: '/statistics/sales-units',
  STATISTICS_SALES_UNITS_PERFORMANCE: '/statistics/sales-units/performance',
  STATISTICS_OPPORTUNITY_CONVERTED_AMOUNT: '/statistics/opportunities/converted-amount',
  // 导出
  EXPORT_TASKS_EXCEL: '/export/tasks/excel',
  EXPORT_TASKS_PDF: '/export/tasks/pdf',
  EXPORT_WORK_ORDERS_EXCEL: '/export/work-orders/excel',
  EXPORT_WORK_ORDERS_PDF: '/export/work-orders/pdf',
  EXPORT_OPPORTUNITIES_EXCEL: '/export/opportunities/excel',
  EXPORT_OPPORTUNITIES_PDF: '/export/opportunities/pdf',
  EXPORT_LEADS_EXCEL: '/export/leads/excel',
  EXPORT_LEADS_PDF: '/export/leads/pdf',
  EXPORT_VISIT_LOGS_EXCEL: '/export/visit-logs/excel',
  EXPORT_VISIT_LOGS_PDF: '/export/visit-logs/pdf',
  // 统计导出
  EXPORT_STATISTICS_OPPORTUNITY_CONVERTED_AMOUNT_EXCEL: '/export/statistics/opportunity-converted-amount/excel',
  EXPORT_STATISTICS_OPPORTUNITY_CONVERTED_AMOUNT_PDF: '/export/statistics/opportunity-converted-amount/pdf',
  EXPORT_STATISTICS_TIME_RANGE_EXCEL: '/export/statistics/time-range/excel',
  EXPORT_STATISTICS_TIME_RANGE_PDF: '/export/statistics/time-range/pdf',
  EXPORT_STATISTICS_SALES_UNIT_EXCEL: '/export/statistics/sales-unit/excel',
  EXPORT_STATISTICS_SALES_UNIT_PDF: '/export/statistics/sales-unit/pdf',
  EXPORT_STATISTICS_SALES_UNIT_PERFORMANCE_EXCEL: '/export/statistics/sales-unit-performance/excel',
  EXPORT_STATISTICS_SALES_UNIT_PERFORMANCE_PDF: '/export/statistics/sales-unit-performance/pdf',
  EXPORT_STATISTICS_REQUIREMENT_DIRECTION_EXCEL: '/export/statistics/requirement-direction/excel',
  EXPORT_STATISTICS_REQUIREMENT_DIRECTION_PDF: '/export/statistics/requirement-direction/pdf',
  EXPORT_STATISTICS_MEMBER_WORKLOAD_EXCEL: '/export/statistics/member-workload/excel',
  EXPORT_STATISTICS_MEMBER_WORKLOAD_PDF: '/export/statistics/member-workload/pdf',
  // 操作日志
  AUDIT_LOGS: '/audit-logs',
  AUDIT_LOG_DETAIL: (id: number) => `/audit-logs/${id}`,
  AUDIT_LOG_DELETE: (id: number) => `/audit-logs/${id}`,
  
  // 组管理
  GROUPS: '/groups',
  GROUP_DETAIL: (id: number) => `/groups/${id}`,
  GROUP_MEMBERS: (id: number) => `/groups/${id}/members`,
  GROUP_ADD_MEMBERS: (id: number) => `/groups/${id}/members`,
  GROUP_REMOVE_MEMBERS: (id: number) => `/groups/${id}/members`,
  MY_GROUP: '/groups/me/my-group',
  
  // 待办事项
  TODOS: '/todos',
} as const

