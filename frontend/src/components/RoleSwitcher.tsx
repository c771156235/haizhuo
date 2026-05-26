/**
 * 角色切换组件
 */
import React from 'react'
import { Select, message, Tag, Space, Typography } from 'antd'
import { useAuth } from '../contexts/AuthContext'

const { Text } = Typography

const roleLabels: Record<string, string> = {
  manager: '总管',
  task_initiator: '专项任务发起人',
  sales_contact: '销售单位接口人',
  team_leader: '组长',
  member: '成员',
}

interface RoleSwitcherProps {
  style?: React.CSSProperties
  size?: 'small' | 'middle' | 'large'
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ style, size = 'middle' }) => {
  const { user, switchRole, getCurrentRole, getAvailableRoles } = useAuth()
  const [loading, setLoading] = React.useState(false)

  const currentRole = getCurrentRole()
  const availableRoles = getAvailableRoles()

  // 调试日志（开发环境）
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('RoleSwitcher Debug:', {
        user,
        currentRole,
        availableRoles,
        rolesCount: availableRoles.length,
        userRoles: user?.roles,
        allRolesCount: user?.roles?.length || 0
      })
    }
  }, [user, currentRole, availableRoles])

  // 如果没有当前角色，不显示
  if (!currentRole) {
    return null
  }

  // 如果只有一个已审核通过的角色，检查是否有其他待审核的角色
  if (availableRoles.length <= 1) {
    const allRoles = user?.roles || []
    const pendingRoles = allRoles.filter((r: any) => r.approval_status === 'pending')
    
    // 如果有待审核的角色，显示提示信息
    if (pendingRoles.length > 0) {
      return (
        <Space size={8} align="center" wrap>
          <Text type="secondary" style={{ fontSize: 13 }}>
            当前角色：
          </Text>
          <Tag color="blue">{roleLabels[currentRole.role] || currentRole.role}</Tag>
          <Text type="warning" style={{ fontSize: 12 }}>
            （{pendingRoles.length} 个角色待审核）
          </Text>
        </Space>
      )
    }
    // 如果只有一个角色且没有待审核的，不显示切换器
    return null
  }

  const handleRoleChange = async (roleId: number) => {
    if (roleId === currentRole?.id) {
      return
    }

    setLoading(true)
    try {
      await switchRole(roleId)
      message.success('角色切换成功')
      // 刷新页面以更新权限
      window.location.reload()
    } catch (error: any) {
      const { logError, extractErrorMessage } = require('../utils/errorHandler')
      logError('角色切换失败', error)
      message.error(extractErrorMessage(error, '角色切换失败，请重试'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Space size={8} align="center" wrap>
      <Text type="secondary" style={{ fontSize: 13 }}>
        角色：
      </Text>
      <Select
        value={currentRole.id}
        onChange={handleRoleChange}
        loading={loading}
        style={{ minWidth: 180, ...style }}
        size={size}
        placeholder="选择角色"
      >
        {availableRoles.map((role) => (
          <Select.Option key={role.id} value={role.id}>
            {roleLabels[role.role] || role.role}
            {role.sales_unit && ` (${role.sales_unit})`}
            {role.is_current && ' ✓'}
          </Select.Option>
        ))}
      </Select>
    </Space>
  )
}

