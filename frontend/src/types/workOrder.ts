/**
 * 工单状态枚举
 */
export enum WorkOrderStatus {
  PENDING_GROUP_CLAIM = 'pending_group_claim', // 待组内认领（派单至组，任一组长认领）
  PENDING_ASSIGN = 'pending_assign', // 待转派（组长尚未转派给成员）
  PENDING_ACCEPT = 'pending_accept', // 待接单（已转派，等待成员接单）
  ACCEPTED = 'accepted', // 已接单
  /** @deprecated 仅兼容旧库数据；新流程不再产生，界面不展示该状态 */
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed', // 已拜访
  CANCELLED = 'cancelled', // 已取消
}

export const WorkOrderStatusLabels: Record<string, string> = {
  [WorkOrderStatus.PENDING_GROUP_CLAIM]: '待组内认领',
  [WorkOrderStatus.PENDING_ASSIGN]: '待转派',
  [WorkOrderStatus.PENDING_ACCEPT]: '待接单',
  [WorkOrderStatus.ACCEPTED]: '已接单',
  [WorkOrderStatus.COMPLETED]: '已拜访',
  [WorkOrderStatus.CANCELLED]: '已取消',
}

export const WorkOrderStatusColors: Record<string, string> = {
  [WorkOrderStatus.PENDING_GROUP_CLAIM]: 'gold',
  [WorkOrderStatus.PENDING_ASSIGN]: 'orange',
  [WorkOrderStatus.PENDING_ACCEPT]: 'orange',
  [WorkOrderStatus.ACCEPTED]: 'blue',
  [WorkOrderStatus.COMPLETED]: 'success',
  [WorkOrderStatus.CANCELLED]: 'default',
}

