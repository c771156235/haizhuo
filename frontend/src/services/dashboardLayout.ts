/**
 * 工作台布局配置服务
 */
import logger from '../utils/logger'

export type DashboardModuleId = 
  | 'welcome' 
  | 'overview_stats' 
  | 'detail_stats' 
  | 'todo_center' 
  | 'today_actions'

export interface DashboardModule {
  id: DashboardModuleId
  title: string
  visible: boolean
  order: number
}

export interface DashboardLayoutConfig {
  modules: DashboardModule[]
  version: number
}

const DEFAULT_LAYOUT: DashboardLayoutConfig = {
  modules: [
    { id: 'welcome', title: '欢迎区域', visible: true, order: 0 },
    { id: 'overview_stats', title: '概览统计', visible: true, order: 1 },
    { id: 'detail_stats', title: '详细统计', visible: true, order: 2 },
    { id: 'todo_center', title: '待办中心', visible: true, order: 3 },
  ],
  version: 1,
}

const cloneLayout = (layout: DashboardLayoutConfig): DashboardLayoutConfig => ({
  version: layout.version,
  modules: layout.modules.map((m) => ({ ...m })),
})

const STORAGE_KEY_PREFIX = 'dashboard_layout_'

/**
 * 获取存储键名
 */
const getStorageKey = (userId: number | undefined): string => {
  return `${STORAGE_KEY_PREFIX}${userId || 'guest'}`
}

/**
 * 获取用户布局配置
 */
export const getDashboardLayout = (userId: number | undefined): DashboardLayoutConfig => {
  try {
    const key = getStorageKey(userId)
    const stored = localStorage.getItem(key)
    if (stored) {
      const config = JSON.parse(stored) as DashboardLayoutConfig
      // 合并默认配置，确保新增的模块也能显示
      const defaultModuleIds = DEFAULT_LAYOUT.modules.map(m => m.id)
      const storedModuleIds = config.modules.map(m => m.id)
      
      // 添加新模块
      DEFAULT_LAYOUT.modules.forEach(defaultModule => {
        if (!storedModuleIds.includes(defaultModule.id)) {
          config.modules.push({
            ...defaultModule,
            order: config.modules.length > 0 ? Math.max(...config.modules.map(m => m.order)) + 1 : defaultModule.order,
          })
        }
      })
      
      // 移除已删除的模块
      config.modules = config.modules.filter(m => defaultModuleIds.includes(m.id))
      
      // 重新排序
      config.modules.sort((a, b) => a.order - b.order)
      
      return cloneLayout(config)
    }
  } catch (error) {
    logger.error('读取布局配置失败', error)
  }
  
  return cloneLayout(DEFAULT_LAYOUT)
}

/**
 * 保存用户布局配置
 */
export const saveDashboardLayout = (
  userId: number | undefined,
  config: DashboardLayoutConfig
): void => {
  try {
    const key = getStorageKey(userId)
    localStorage.setItem(key, JSON.stringify(config))
  } catch (error) {
    logger.error('保存布局配置失败', error)
  }
}

/**
 * 更新模块可见性
 */
export const updateModuleVisibility = (
  userId: number | undefined,
  moduleId: DashboardModuleId,
  visible: boolean
): DashboardLayoutConfig => {
  const config = getDashboardLayout(userId)
  const module = config.modules.find(m => m.id === moduleId)
  if (module) {
    module.visible = visible
    saveDashboardLayout(userId, config)
  }
  return cloneLayout(config)
}

/**
 * 更新模块顺序
 */
export const updateModuleOrder = (
  userId: number | undefined,
  moduleIds: DashboardModuleId[]
): DashboardLayoutConfig => {
  const config = getDashboardLayout(userId)
  moduleIds.forEach((moduleId, index) => {
    const module = config.modules.find(m => m.id === moduleId)
    if (module) {
      module.order = index
    }
  })
  saveDashboardLayout(userId, config)
  return cloneLayout(config)
}

/**
 * 重置为默认布局
 */
export const resetDashboardLayout = (userId: number | undefined): DashboardLayoutConfig => {
  const defaultConfig = cloneLayout(DEFAULT_LAYOUT)
  saveDashboardLayout(userId, defaultConfig)
  return defaultConfig
}

