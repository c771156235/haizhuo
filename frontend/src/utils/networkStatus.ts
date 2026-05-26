/**
 * 网络状态检测工具
 * 检测网络连接状态，在网络断开时暂停 API 请求
 */

type NetworkStatusListener = (isOnline: boolean) => void

class NetworkStatusManager {
  private isOnline: boolean = navigator.onLine
  private listeners: Set<NetworkStatusListener> = new Set()
  private offlineMessageShown: boolean = false

  constructor() {
    // 监听浏览器网络状态变化
    window.addEventListener('online', this.handleOnline.bind(this))
    window.addEventListener('offline', this.handleOffline.bind(this))
    
    // 初始化时检查网络状态
    this.updateNetworkStatus()
  }

  /**
   * 获取当前网络状态
   */
  getStatus(): boolean {
    return this.isOnline
  }

  /**
   * 检查网络是否在线
   */
  isNetworkOnline(): boolean {
    return navigator.onLine && this.isOnline
  }

  /**
   * 添加网络状态监听器
   */
  addListener(listener: NetworkStatusListener): () => void {
    this.listeners.add(listener)
    // 返回取消监听的函数
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 移除网络状态监听器
   */
  removeListener(listener: NetworkStatusListener): void {
    this.listeners.delete(listener)
  }

  /**
   * 更新网络状态并通知所有监听器
   */
  private updateNetworkStatus(): void {
    const wasOnline = this.isOnline
    this.isOnline = navigator.onLine

    // 如果状态发生变化，通知所有监听器
    if (wasOnline !== this.isOnline) {
      this.listeners.forEach(listener => {
        listener(this.isOnline)
      })
    }
  }

  /**
   * 处理网络恢复事件
   */
  private handleOnline(): void {
    this.updateNetworkStatus()
    this.offlineMessageShown = false
  }

  /**
   * 处理网络断开事件
   */
  private handleOffline(): void {
    this.updateNetworkStatus()
  }

  /**
   * 标记离线消息已显示（用于避免重复提示）
   */
  markOfflineMessageShown(): void {
    this.offlineMessageShown = true
  }

  /**
   * 检查离线消息是否已显示
   */
  shouldShowOfflineMessage(): boolean {
    return !this.isOnline && !this.offlineMessageShown
  }

  /**
   * 清理资源
   */
  destroy(): void {
    window.removeEventListener('online', this.handleOnline.bind(this))
    window.removeEventListener('offline', this.handleOffline.bind(this))
    this.listeners.clear()
  }
}

// 创建单例实例
export const networkStatusManager = new NetworkStatusManager()

// 导出便捷方法
export const isNetworkOnline = () => networkStatusManager.isNetworkOnline()
export const getNetworkStatus = () => networkStatusManager.getStatus()

