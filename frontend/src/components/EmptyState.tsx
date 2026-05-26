/**
 * 空状态组件
 */
import { Empty, Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

interface EmptyStateProps {
  description?: string
  showCreateButton?: boolean
  onCreateClick?: () => void
  createButtonText?: string
}

const EmptyState: React.FC<EmptyStateProps> = ({
  description = '暂无数据',
  showCreateButton = false,
  onCreateClick,
  createButtonText = '创建',
}) => {
  return (
    <Empty
      description={description}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    >
      {showCreateButton && onCreateClick && (
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreateClick}>
          {createButtonText}
        </Button>
      )}
    </Empty>
  )
}

export default EmptyState

