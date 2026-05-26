/**
 * 待办/提醒中心组件
 */
import { Card, List, Tag, Typography, Space, Empty, Button } from 'antd'
import {
  FileTextOutlined,
  SolutionOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  UserSwitchOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useQuery } from 'react-query'
import { getTodos, TodoItem, TodoType } from '../services/todo'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import dayjs from 'dayjs'

const { Text } = Typography

const getTypeIcon = (type: TodoType) => {
  switch (type) {
    case 'task':
      return <FileTextOutlined style={{ color: '#1890ff' }} />
    case 'work_order':
      return <SolutionOutlined style={{ color: '#52c41a' }} />
    case 'opportunity':
      return <DollarOutlined style={{ color: '#fa8c16' }} />
    case 'user':
      return <UserOutlined style={{ color: '#eb2f96' }} />
    default:
      return <FileTextOutlined />
  }
}

const getTypeLabel = (type: TodoType) => {
  switch (type) {
    case 'task':
      return '任务'
    case 'work_order':
      return '工单'
    case 'opportunity':
      return '商机'
    case 'user':
      return '用户'
    default:
      return '待办'
  }
}

const getPriorityColor = (priority: string, isOverdue: boolean) => {
  if (isOverdue) return 'red'
  switch (priority) {
    case 'high':
      return 'orange'
    case 'medium':
      return 'blue'
    case 'low':
      return 'default'
    default:
      return 'default'
  }
}

const getPriorityText = (priority: string, isOverdue: boolean) => {
  if (isOverdue) return '已逾期'
  switch (priority) {
    case 'high':
      return '高优先级'
    case 'medium':
      return '中优先级'
    case 'low':
      return '低优先级'
    default:
      return ''
  }
}

// 获取操作类型标签
const getActionTypeTag = (actionType?: 'assign' | 'accept' | 'confirm' | 'submit' | 'waiting' | 'approve' | null) => {
  switch (actionType) {
    case 'assign':
      return {
        text: '需转派',
        color: '#ff7a00',
        bgColor: '#fff7e6',
        icon: <UserSwitchOutlined style={{ fontSize: '12px' }} />,
      }
    case 'accept':
      return {
        text: '待接单',
        color: '#52c41a',
        bgColor: '#f6ffed',
        icon: <CheckCircleOutlined style={{ fontSize: '12px' }} />,
      }
    case 'confirm':
      return {
        text: '需确认',
        color: '#1890ff',
        bgColor: '#e6f7ff',
        icon: <CheckCircleOutlined style={{ fontSize: '12px' }} />,
      }
    case 'submit':
      return {
        text: '需提交',
        color: '#722ed1',
        bgColor: '#f9f0ff',
        icon: <FileTextOutlined style={{ fontSize: '12px' }} />,
      }
    case 'waiting':
      return {
        text: '等待中',
        color: '#8c8c8c',
        bgColor: '#f5f5f5',
        icon: <ClockCircleOutlined style={{ fontSize: '12px' }} />,
      }
    case 'approve':
      return {
        text: '需审核',
        color: '#eb2f96',
        bgColor: '#fff0f6',
        icon: <CheckCircleOutlined style={{ fontSize: '12px' }} />,
      }
    default:
      return null
  }
}

interface TodoCenterProps {
  maxItems?: number
}

export const TodoCenter = ({ maxItems = 8 }: TodoCenterProps) => {
  const navigate = useNavigate()
  const { user, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const { data: todos = [], isLoading, refetch } = useQuery(
    ['todos', user?.id, currentRole?.role],
    () => getTodos(),
    {
      refetchInterval: 6000, // 每6秒刷新一次，提高实时性
      enabled: !!user, // 只有用户登录后才获取待办事项
    }
  )

  const displayTodos = todos.slice(0, maxItems)

  return (
    <Card
      title={
        <Space>
          <div
            style={{
              width: '4px',
              height: '18px',
              background: '#1890ff',
              borderRadius: '2px',
            }}
          />
          <Text strong style={{ fontSize: '16px', color: '#262626' }}>
            待办/提醒中心
          </Text>
          {todos.length > 0 && (
            <Tag color="red" style={{ marginLeft: '8px' }}>
              {todos.length}
            </Tag>
          )}
          <Text type="secondary" style={{ fontSize: '12px', marginLeft: '8px' }}>
            所有待办事项
          </Text>
        </Space>
      }
      style={{
        borderRadius: '10px',
        border: '1px solid #e8e8e8',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
        height: '100%',
      }}
      styles={{
        header: {
          borderBottom: '1px solid #f0f0f0',
          padding: '14px 16px',
        },
        body: { padding: '12px' },
      }}
      loading={isLoading}
      extra={
        <Space>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => refetch()}
            style={{ padding: 0 }}
            title="刷新"
          />
          <Button
            type="link"
            size="small"
            onClick={() => navigate('/todos')}
            style={{ padding: 0 }}
          >
            查看全部
          </Button>
        </Space>
      }
    >
      {displayTodos.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无待办事项"
          style={{ margin: '40px 0' }}
        />
      ) : (
        <List
          dataSource={displayTodos}
          renderItem={(item: TodoItem) => (
            <List.Item
              style={{
                padding: '10px 0',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                transition: 'all 0.2s',
              }}
              onClick={() => navigate(item.link)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <List.Item.Meta
                avatar={
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: item.type === 'task' 
                        ? item.actionType === 'confirm'
                          ? '#e6f7ff'  // 需确认：蓝色背景
                          : item.actionType === 'submit'
                          ? '#f9f0ff'  // 需提交：紫色背景
                          : item.actionType === 'waiting'
                          ? '#f5f5f5'  // 等待中：灰色背景
                          : '#e6f7ff'  // 默认：蓝色背景
                        : item.type === 'work_order'
                        ? item.actionType === 'assign'
                          ? '#fff7e6'  // 需转派：橙色背景
                          : '#f6ffed'  // 待接单：绿色背景
                        : item.type === 'user'
                        ? '#fff0f6'  // 用户审核：粉色背景
                        : '#fff7e6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      border: item.actionType === 'assign' 
                        ? '2px solid #ff7a00' 
                        : item.actionType === 'accept'
                        ? '2px solid #52c41a'
                        : item.actionType === 'confirm'
                        ? '2px solid #1890ff'
                        : item.actionType === 'submit'
                        ? '2px solid #722ed1'
                        : item.actionType === 'waiting'
                        ? '2px solid #d9d9d9'
                        : item.actionType === 'approve'
                        ? '2px solid #eb2f96'
                        : 'none',
                    }}
                  >
                    {getTypeIcon(item.type)}
                  </div>
                }
                title={
                  <Space size="small" wrap>
                    <Text
                      strong
                      style={{
                        fontSize: '14px',
                        color: '#262626',
                        flex: 1,
                      }}
                      ellipsis={{ tooltip: item.title }}
                    >
                      {item.title}
                    </Text>
                    {/* 操作类型标签 */}
                    {getActionTypeTag(item.actionType) && (
                      <Tag
                        style={{
                          margin: 0,
                          fontSize: '11px',
                          padding: '2px 8px',
                          background: getActionTypeTag(item.actionType)!.bgColor,
                          color: getActionTypeTag(item.actionType)!.color,
                          border: `1px solid ${getActionTypeTag(item.actionType)!.color}`,
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {getActionTypeTag(item.actionType)!.icon}
                        {getActionTypeTag(item.actionType)!.text}
                      </Tag>
                    )}
                    <Tag
                      color={getPriorityColor(item.priority, item.isOverdue)}
                      style={{ margin: 0, fontSize: '11px' }}
                    >
                      {getPriorityText(item.priority, item.isOverdue)}
                    </Tag>
                    {item.isOverdue && (
                      <ExclamationCircleOutlined
                        style={{ color: '#ff4d4f', fontSize: '14px' }}
                      />
                    )}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Text
                      type="secondary"
                      style={{ fontSize: '12px' }}
                      ellipsis={{ tooltip: item.description }}
                    >
                      {item.description}
                    </Text>
                    <Space size="small">
                      <Tag
                        style={{
                          fontSize: '11px',
                          padding: '0 6px',
                          background: '#f5f5f5',
                          border: 'none',
                        }}
                      >
                        {getTypeLabel(item.type)}
                      </Tag>
                      {item.dueDate && (
                        <Space size={4}>
                          <ClockCircleOutlined
                            style={{
                              fontSize: '11px',
                              color: item.isOverdue ? '#ff4d4f' : '#8c8c8c',
                            }}
                          />
                          <Text
                            type="secondary"
                            style={{
                              fontSize: '11px',
                              color: item.isOverdue ? '#ff4d4f' : '#8c8c8c',
                            }}
                          >
                            {item.isOverdue
                              ? `逾期 ${dayjs().diff(dayjs(item.dueDate), 'day')} 天`
                              : `截止：${dayjs(item.dueDate).format('MM-DD')}`}
                          </Text>
                        </Space>
                      )}
                    </Space>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  )
}

