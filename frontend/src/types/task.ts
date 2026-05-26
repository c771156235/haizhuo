/**
 * 任务类型定义
 */
export enum TaskStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  REJECTED = 'rejected',
  CONFIRMED = 'confirmed',
  DETAIL_REQUIRED = 'detail_required',
  DETAIL_SUBMITTED = 'detail_submitted',
  DISPATCHED = 'dispatched',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export const TaskStatusLabels: Record<TaskStatus, string> = {
  [TaskStatus.DRAFT]: '草稿',
  [TaskStatus.PENDING]: '待确认',
  [TaskStatus.REJECTED]: '已拒绝',
  [TaskStatus.CONFIRMED]: '已确认',
  [TaskStatus.DETAIL_REQUIRED]: '未填写详细需求',
  [TaskStatus.DETAIL_SUBMITTED]: '详细需求已提交',
  [TaskStatus.DISPATCHED]: '已派单',
  [TaskStatus.IN_PROGRESS]: '进行中',
  [TaskStatus.COMPLETED]: '已完成',
  [TaskStatus.CANCELLED]: '已关闭',
}

export const TaskStatusColors: Record<TaskStatus, string> = {
  [TaskStatus.DRAFT]: 'default',
  [TaskStatus.PENDING]: 'orange',
  [TaskStatus.REJECTED]: 'red',
  [TaskStatus.CONFIRMED]: 'blue',
  [TaskStatus.DETAIL_REQUIRED]: 'cyan',
  [TaskStatus.DETAIL_SUBMITTED]: 'geekblue',
  [TaskStatus.DISPATCHED]: 'geekblue',
  [TaskStatus.IN_PROGRESS]: 'processing',
  [TaskStatus.COMPLETED]: 'success',
  [TaskStatus.CANCELLED]: 'default',
}

