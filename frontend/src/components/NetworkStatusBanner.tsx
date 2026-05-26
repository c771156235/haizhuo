/**
 * 网络状态提示横幅组件
 * 在网络断开时显示提示，网络恢复时自动隐藏
 */
import { Alert } from 'antd'
import { DisconnectOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { networkStatusManager } from '../utils/networkStatus'

const NetworkStatusBanner = () => {
  const [isOnline, setIsOnline] = useState(networkStatusManager.getStatus())

  useEffect(() => {
    // 监听网络状态变化
    const removeListener = networkStatusManager.addListener((online) => {
      setIsOnline(online)
    })

    // 清理监听器
    return () => {
      removeListener()
    }
  }, [])

  // 如果网络在线，不显示横幅
  if (isOnline) {
    return null
  }

  return (
    <Alert
      message="网络连接已断开"
      description="请检查您的网络设置，网络恢复后将自动重连"
      type="warning"
      icon={<DisconnectOutlined />}
      showIcon
      closable={false}
      style={{
        position: 'fixed',
        top: 64, // Header 高度为 64px，横幅显示在 Header 下方
        left: 0,
        right: 0,
        zIndex: 1000, // 高于 Header 的 z-index (999)，但低于其他重要元素
        borderRadius: 0,
        textAlign: 'center',
      }}
      banner
    />
  )
}

export default NetworkStatusBanner

