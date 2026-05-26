/**
 * 用户类型定义
 */
export enum UserRole {
  TASK_INITIATOR = 'task_initiator',
  MANAGER = 'manager',
  SALES_CONTACT = 'sales_contact',
  TEAM_LEADER = 'team_leader',
  MEMBER = 'member',
}

export const UserRoleLabels: Record<UserRole, string> = {
  [UserRole.TASK_INITIATOR]: '专项任务发起人',
  [UserRole.MANAGER]: '总管',
  [UserRole.SALES_CONTACT]: '销售单位接口人',
  [UserRole.TEAM_LEADER]: '组长',
  [UserRole.MEMBER]: '成员',
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export const ApprovalStatusLabels: Record<ApprovalStatus, string> = {
  [ApprovalStatus.PENDING]: '待审核',
  [ApprovalStatus.APPROVED]: '已通过',
  [ApprovalStatus.REJECTED]: '已拒绝',
}

