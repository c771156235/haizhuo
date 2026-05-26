/**
 * 商机类型定义
 */
export enum OpportunityStatus {
  CREATED = 'created',      // 已创建
  IN_PROGRESS = 'in_progress',  // 进行中
  LOST = 'lost',           // 流失
  WON = 'won',             // 转定（成功）
}

export const OpportunityStatusLabels: Record<OpportunityStatus | string, string> = {
  [OpportunityStatus.CREATED]: '已创建',
  [OpportunityStatus.IN_PROGRESS]: '进行中',
  [OpportunityStatus.LOST]: '流失',
  [OpportunityStatus.WON]: '转定',
}

export const OpportunityStatusColors: Record<OpportunityStatus | string, string> = {
  [OpportunityStatus.CREATED]: 'blue',
  [OpportunityStatus.IN_PROGRESS]: 'processing',
  [OpportunityStatus.LOST]: 'red',
  [OpportunityStatus.WON]: 'success',
}

