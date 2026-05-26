/**
 * 待办事项服务
 */
import apiClient from './api'
import { API_ENDPOINTS } from '../config/api'
import { taskService, Task } from './task'
import { workOrderService, WorkOrder } from './workOrder'
import { opportunityService, Opportunity } from './opportunity'
import dayjs from 'dayjs'

export type TodoType = 'task' | 'work_order' | 'opportunity' | 'user'

export type TodoPriority = 'high' | 'medium' | 'low'

export type TodoActionType = 'assign' | 'accept' | 'confirm' | 'submit' | 'waiting' | 'approve' | null 
// assign: 需要转派, accept: 需要接单, confirm: 需要确认, submit: 需要提交, waiting: 等待他人操作, approve: 需要审核

export interface TodoItem {
  id: number
  type: TodoType
  priority: TodoPriority
  title: string
  description?: string
  dueDate?: string
  due_date?: string  // 后端返回的字段名
  isOverdue: boolean
  is_overdue?: boolean  // 后端返回的字段名
  link: string
  actionType?: TodoActionType
  action_type?: TodoActionType  // 后端返回的字段名
  sales_unit?: string
  resource_id?: number
  metadata?: {
    task?: Task
    workOrder?: WorkOrder
    opportunity?: Opportunity
  }
}

export interface TodoStatistics {
  total: number
  overdue: number
  high_priority: number
  by_type: {
    task: number
    work_order: number
    opportunity: number
    user: number
  }
  by_action_type: {
    assign: number
    accept: number
    confirm: number
    submit: number
    waiting: number
    approve: number
  }
}

export interface TodoListResponse {
  items: TodoItem[]
  statistics: TodoStatistics
  total: number
}

export interface TodoListParams {
  type_filter?: 'task' | 'work_order' | 'opportunity' | 'user'
  action_type_filter?: 'assign' | 'accept' | 'confirm' | 'submit' | 'waiting' | 'approve'
  priority_filter?: 'high' | 'medium' | 'low'
  overdue_only?: boolean
  search?: string
}

export interface TodayAction {
  id: number
  type: TodoType
  priority: TodoPriority
  title: string
  description: string
  action: string
  link: string
  reason: string
  metadata: {
    task?: Task
    workOrder?: WorkOrder
    opportunity?: Opportunity
  }
}

/**
 * 规范化待办事项项，统一字段名
 */
const normalizeTodoItem = (item: TodoItem): TodoItem => {
  return {
    ...item,
    dueDate: item.due_date || item.dueDate,
    isOverdue: item.is_overdue !== undefined ? item.is_overdue : item.isOverdue,
    actionType: item.action_type || item.actionType,
  }
}

/**
 * 获取待办事项列表（使用后端API）
 */
export const getTodos = async (params?: TodoListParams): Promise<TodoItem[]> => {
  try {
    const response = await apiClient.get<TodoListResponse>(API_ENDPOINTS.TODOS, {
      params: {
        type_filter: params?.type_filter,
        action_type_filter: params?.action_type_filter,
        priority_filter: params?.priority_filter,
        overdue_only: params?.overdue_only,
        search: params?.search,
      },
    }) as unknown as TodoListResponse
    
    return response.items.map(normalizeTodoItem)
  } catch (error) {
    const { logError } = require('../utils/errorHandler')
    logError('获取待办事项失败', error)
    // 如果后端API失败，回退到旧的实现（保持兼容性）
    return getTodosLegacy()
  }
}

/**
 * 获取待办事项统计信息
 */
export const getTodoStatistics = async (params?: TodoListParams): Promise<TodoStatistics | null> => {
  try {
    const response = await apiClient.get<TodoListResponse>(API_ENDPOINTS.TODOS, {
      params: {
        type_filter: params?.type_filter,
        action_type_filter: params?.action_type_filter,
        priority_filter: params?.priority_filter,
        overdue_only: params?.overdue_only,
        search: params?.search,
      },
    }) as unknown as TodoListResponse
    
    return response.statistics
  } catch (error) {
    const { logError } = require('../utils/errorHandler')
    logError('获取待办事项统计失败', error)
    return null
  }
}

/**
 * 获取待办事项列表（旧实现，作为回退方案）
 * @deprecated 使用 getTodos 代替
 */
const getTodosLegacy = async (currentUser?: { id: number; role: string }): Promise<TodoItem[]> => {
  const todos: TodoItem[] = []
  const now = dayjs()

  try {
    // 获取待处理任务
    const pendingTasks = await taskService.getTasks({
      status: 'pending',
      page_size: 20,
    })
    
    if (pendingTasks?.items) {
      pendingTasks.items.forEach((task) => {
        // 根据角色判断操作类型
        let actionType: TodoActionType = null
        if (currentUser?.role === 'manager') {
          // 总管需要确认任务
          actionType = 'confirm'
        } else if (currentUser?.role === 'task_initiator' && task.initiator_id === currentUser.id) {
          // 专项任务发起人看到自己发起的任务，等待总管确认
          actionType = 'waiting'
        } else if (currentUser?.role === 'sales_contact') {
          // 销售单位接口人看到自己销售单位的任务，等待总管确认
          actionType = 'waiting'
        }
        
        todos.push({
          id: task.id,
          type: 'task',
          priority: 'high',
          title: `待确认任务：${task.task_name}`,
          description: `销售单位：${task.sales_unit}`,
          dueDate: task.end_date,
          isOverdue: now.isAfter(dayjs(task.end_date)),
          link: `/tasks/${task.id}`,
          actionType,
          metadata: { task },
        })
      })
    }

    // 获取待提交详细需求的任务
    const confirmedTasks = await taskService.getTasks({
      status: 'confirmed',
      page_size: 20,
    })
    
    if (confirmedTasks?.items) {
      confirmedTasks.items.forEach((task) => {
        // 已确认的任务需要提交详细需求
        // 对于专项任务发起人和销售单位接口人，这是需要自己操作的
        let actionType: TodoActionType = null
        if (currentUser?.role === 'task_initiator' && task.initiator_id === currentUser.id) {
          actionType = 'submit'
        } else if (currentUser?.role === 'sales_contact') {
          actionType = 'submit'
        }
        
        todos.push({
          id: task.id + 10000, // 避免ID冲突
          type: 'task',
          priority: 'medium',
          title: `待提交详细需求：${task.task_name}`,
          description: `销售单位：${task.sales_unit}`,
          dueDate: task.end_date,
          isOverdue: now.isAfter(dayjs(task.end_date)),
          link: `/tasks/${task.id}`,
          actionType,
          metadata: { task },
        })
      })
    }

    // 获取待接单工单
    const pendingWorkOrders = await workOrderService.getWorkOrders({
      status: 'pending',
      page_size: 20,
    })
    
    if (pendingWorkOrders?.items) {
      pendingWorkOrders.items.forEach((workOrder) => {
        // 判断操作类型：如果 member_id 为空，需要组长转派；否则需要成员接单
        const actionType: TodoActionType = workOrder.member_id ? 'accept' : 'assign'
        const title = actionType === 'assign' 
          ? `待转派工单：${workOrder.work_order_no}`
          : `待接单工单：${workOrder.work_order_no}`
        
        todos.push({
          id: workOrder.id + 20000,
          type: 'work_order',
          priority: 'high',
          title,
          description: workOrder.task_name || `任务ID：${workOrder.task_id}`,
          link: `/work-orders/${workOrder.id}`,
          isOverdue: false,
          actionType,
          metadata: { workOrder },
        })
      })
    }

    // 获取进行中的商机（需要跟进）
    const inProgressOpportunities = await opportunityService.getOpportunities({
      status: 'in_progress',
      page_size: 20,
    })
    
    if (inProgressOpportunities?.items) {
      inProgressOpportunities.items.forEach((opportunity) => {
      // 如果商机超过7天未更新，标记为需要跟进
      const daysSinceUpdate = now.diff(dayjs(opportunity.updated_at), 'day')
      if (daysSinceUpdate >= 7) {
        todos.push({
          id: opportunity.id + 30000,
          type: 'opportunity',
          priority: daysSinceUpdate >= 14 ? 'high' : 'medium',
          title: `需要跟进商机：${opportunity.customer_unit}`,
          description: `${daysSinceUpdate}天未更新 - ${opportunity.opportunity_no}`,
          link: `/opportunities/${opportunity.id}`,
          isOverdue: daysSinceUpdate >= 14,
          metadata: { opportunity },
        })
      }
      })
    }
  } catch (error) {
    const { logError } = require('../utils/errorHandler')
    logError('获取待办事项失败', error)
  }

  // 按优先级和是否逾期排序
  return todos.sort((a, b) => {
    // 逾期优先
    if (a.isOverdue && !b.isOverdue) return -1
    if (!a.isOverdue && b.isOverdue) return 1
    
    // 高优先级优先
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }
    
    // 有截止日期的优先
    if (a.dueDate && !b.dueDate) return -1
    if (!a.dueDate && b.dueDate) return 1
    
    return 0
  })
}

/**
 * 获取今日行动清单 - 只返回今天需要立即处理的高优先级事项
 */
export const getTodayActions = async (): Promise<TodayAction[]> => {
  const actions: TodayAction[] = []
  const now = dayjs()
  const today = now.format('YYYY-MM-DD')

  try {
    // 获取今天截止或逾期的高优先级任务
    const allTasks = await taskService.getTasks({
      page_size: 50,
    })
    
    if (allTasks?.items) {
      allTasks.items.forEach((task) => {
        const dueDate = task.end_date ? dayjs(task.end_date).format('YYYY-MM-DD') : null
        const isToday = dueDate === today
        const isOverdue = dueDate && now.isAfter(dayjs(task.end_date))
        const isHighPriority = isOverdue || isToday
        
        // 只处理今天截止、逾期或高优先级的任务
        if (isHighPriority && (task.status === 'pending' || task.status === 'confirmed')) {
          let action = ''
          let reason = ''
          
          if (task.status === 'pending') {
            action = '确认或拒绝任务'
            reason = isOverdue ? '任务已逾期，需要立即处理' : isToday ? '任务今日截止，需要及时响应' : '待处理任务需要及时响应'
          } else if (task.status === 'confirmed') {
            action = '提交详细需求单'
            reason = isOverdue ? '任务已逾期，需要立即提交' : isToday ? '任务今日截止，需要立即提交' : '已确认任务需要补充详细信息'
          }
          
          if (action) {
            actions.push({
              id: task.id + (task.status === 'confirmed' ? 10000 : 0),
              type: 'task',
              priority: isOverdue ? 'high' : 'medium',
              title: task.status === 'pending' ? `待确认任务：${task.task_name}` : `待提交详细需求：${task.task_name}`,
              description: `销售单位：${task.sales_unit}`,
              action,
              link: `/tasks/${task.id}`,
              reason,
              metadata: { task },
            })
          }
        }
      })
    }

    // 获取待接单工单（高优先级）
    const pendingWorkOrders = await workOrderService.getWorkOrders({
      status: 'pending',
      page_size: 20,
    })
    
    if (pendingWorkOrders?.items) {
      pendingWorkOrders.items.forEach((workOrder) => {
        actions.push({
          id: workOrder.id + 20000,
          type: 'work_order',
          priority: 'high',
          title: `待接单工单：${workOrder.work_order_no}`,
          description: workOrder.task_name || `任务ID：${workOrder.task_id}`,
          action: '接单处理',
          link: `/work-orders/${workOrder.id}`,
          reason: '待接单工单需要及时处理',
          metadata: { workOrder },
        })
      })
    }

    // 获取逾期或需要紧急跟进的商机
    const inProgressOpportunities = await opportunityService.getOpportunities({
      status: 'in_progress',
      page_size: 20,
    })
    
    if (inProgressOpportunities?.items) {
      inProgressOpportunities.items.forEach((opportunity) => {
        const daysSinceUpdate = now.diff(dayjs(opportunity.updated_at), 'day')
        // 只显示超过14天未更新的商机（高优先级）
        if (daysSinceUpdate >= 14) {
          actions.push({
            id: opportunity.id + 30000,
            type: 'opportunity',
            priority: 'high',
            title: `需要紧急跟进商机：${opportunity.customer_unit}`,
            description: `${daysSinceUpdate}天未更新 - ${opportunity.opportunity_no}`,
            action: '跟进商机',
            link: `/opportunities/${opportunity.id}`,
            reason: '商机长时间未更新，需要紧急跟进',
            metadata: { opportunity },
          })
        }
      })
    }
  } catch (error) {
    const { logError } = require('../utils/errorHandler')
    logError('获取今日行动清单失败', error)
  }

  // 按优先级和是否逾期排序
  return actions.sort((a, b) => {
    // 逾期优先
    const aIsOverdue = a.metadata.task && a.metadata.task.end_date && now.isAfter(dayjs(a.metadata.task.end_date))
    const bIsOverdue = b.metadata.task && b.metadata.task.end_date && now.isAfter(dayjs(b.metadata.task.end_date))
    if (aIsOverdue && !bIsOverdue) return -1
    if (!aIsOverdue && bIsOverdue) return 1
    
    // 高优先级优先
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }
    
    return 0
  })
}

