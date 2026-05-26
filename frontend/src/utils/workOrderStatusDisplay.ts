import { WorkOrderStatusColors, WorkOrderStatusLabels } from '../types/workOrder'

/**
 * 工单状态展示（新流程不再产生 in_progress；旧数据请执行迁移 SQL 后该分支不再出现）。
 * 若仍存在 in_progress，在列表/详情中按「已拜访」展示，避免再出现「待标记已拜访」等中间文案。
 */
export function getWorkOrderStatusDisplay(status: string): { label: string; color: string } {
  if (status === 'pending') {
    return {
      label: WorkOrderStatusLabels.pending_accept,
      color: WorkOrderStatusColors.pending_accept,
    }
  }
  if (status === 'in_progress') {
    return {
      label: WorkOrderStatusLabels['completed'],
      color: WorkOrderStatusColors['completed'],
    }
  }
  return {
    label: WorkOrderStatusLabels[status] || status,
    color: WorkOrderStatusColors[status] || 'default',
  }
}
