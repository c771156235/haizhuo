/**
 * 工作台布局设置组件
 */
import { Modal, Switch, Button, Space, Typography, Divider, message } from 'antd'
import {
  SettingOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  DragOutlined,
  ReloadOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import {
  DashboardLayoutConfig,
  DashboardModule,
  getDashboardLayout,
  updateModuleVisibility,
  updateModuleOrder,
  resetDashboardLayout,
  DashboardModuleId,
} from '../services/dashboardLayout'
import { useAuth } from '../contexts/AuthContext'

const { Text } = Typography

interface SortableItemProps {
  module: DashboardModule
  index: number
  total: number
  onToggle: (id: DashboardModuleId, visible: boolean) => void
  onMoveUp: () => void
  onMoveDown: () => void
}

const SortableItem = ({ module, index, total, onToggle, onMoveUp, onMoveDown }: SortableItemProps) => {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', module.id)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        padding: '12px 16px',
        marginBottom: '8px',
        background: '#fff',
        border: '1px solid #e8e8e8',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'move',
        opacity: isDragging ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#1890ff'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(24, 144, 255, 0.15)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e8e8e8'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <Space size="middle" style={{ flex: 1 }}>
        <DragOutlined style={{ color: '#8c8c8c' }} />
        <Text style={{ fontSize: '14px', color: '#262626' }}>{module.title}</Text>
      </Space>
      <Space size="small">
        <Button
          type="text"
          size="small"
          icon={<UpOutlined />}
          onClick={onMoveUp}
          disabled={index === 0}
          style={{ padding: '0 8px' }}
        />
        <Button
          type="text"
          size="small"
          icon={<DownOutlined />}
          onClick={onMoveDown}
          disabled={index === total - 1}
          style={{ padding: '0 8px' }}
        />
        <Switch
          checked={module.visible}
          onChange={(checked) => onToggle(module.id, checked)}
          checkedChildren={<EyeOutlined />}
          unCheckedChildren={<EyeInvisibleOutlined />}
        />
      </Space>
    </div>
  )
}

interface DashboardLayoutSettingsProps {
  open: boolean
  onClose: () => void
  onConfigChange: (config: DashboardLayoutConfig) => void
}

export const DashboardLayoutSettings = ({
  open,
  onClose,
  onConfigChange,
}: DashboardLayoutSettingsProps) => {
  const { user } = useAuth()
  const [config, setConfig] = useState<DashboardLayoutConfig>(() =>
    getDashboardLayout(user?.id)
  )
  const [modules, setModules] = useState<DashboardModule[]>(config.modules)

  useEffect(() => {
    const currentConfig = getDashboardLayout(user?.id)
    setConfig(currentConfig)
    setModules([...currentConfig.modules].sort((a, b) => a.order - b.order))
  }, [user?.id, open])

  const handleToggle = (moduleId: DashboardModuleId, visible: boolean) => {
    const updatedConfig = updateModuleVisibility(user?.id, moduleId, visible)
    setConfig(updatedConfig)
    setModules([...updatedConfig.modules].sort((a, b) => a.order - b.order))
    onConfigChange(updatedConfig)
    message.success(`${visible ? '显示' : '隐藏'}模块成功`)
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const newModules = [...modules]
    ;[newModules[index - 1], newModules[index]] = [newModules[index], newModules[index - 1]]
    setModules(newModules)
    
    const moduleIds = newModules.map((m) => m.id) as DashboardModuleId[]
    const updatedConfig = updateModuleOrder(user?.id, moduleIds)
    setConfig(updatedConfig)
    onConfigChange(updatedConfig)
    message.success('模块顺序已更新')
  }

  const handleMoveDown = (index: number) => {
    if (index === modules.length - 1) return
    const newModules = [...modules]
    ;[newModules[index], newModules[index + 1]] = [newModules[index + 1], newModules[index]]
    setModules(newModules)
    
    const moduleIds = newModules.map((m) => m.id) as DashboardModuleId[]
    const updatedConfig = updateModuleOrder(user?.id, moduleIds)
    setConfig(updatedConfig)
    onConfigChange(updatedConfig)
    message.success('模块顺序已更新')
  }

  const handleReset = () => {
    Modal.confirm({
      title: '确认重置',
      content: '确定要重置为默认布局吗？此操作不可撤销。',
      onOk: () => {
        const defaultConfig = resetDashboardLayout(user?.id)
        setConfig(defaultConfig)
        setModules(defaultConfig.modules)
        onConfigChange(defaultConfig)
        message.success('已重置为默认布局')
      },
    })
  }

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          <Text strong>工作台布局设置</Text>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="reset" icon={<ReloadOutlined />} onClick={handleReset}>
          重置默认
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          完成
        </Button>,
      ]}
      width={600}
    >
      <div style={{ marginBottom: '16px' }}>
        <Text type="secondary" style={{ fontSize: '13px' }}>
          使用上下箭头调整顺序，使用开关可显示/隐藏模块
        </Text>
      </div>
      <Divider style={{ margin: '16px 0' }} />
      <div>
        {modules.map((module, index) => (
          <SortableItem
            key={module.id}
            module={module}
            index={index}
            total={modules.length}
            onToggle={handleToggle}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
          />
        ))}
      </div>
    </Modal>
  )
}

