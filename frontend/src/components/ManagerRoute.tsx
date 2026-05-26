/**
 * 总管权限路由保护组件
 */
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Spin } from 'antd'

interface ManagerRouteProps {
  children: React.ReactNode
}

const ManagerRoute: React.FC<ManagerRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // 只有总管可以访问（基于当前激活角色）
  if (currentRole?.role !== 'manager') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default ManagerRoute

