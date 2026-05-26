/**
 * 今日行动清单组件
 */
import { Card, List, Tag, Typography, Space, Empty, Button } from 'antd'
import {
  FileTextOutlined,
  SolutionOutlined,
  DollarOutlined,
  RightOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { useQuery } from 'react-query'
import { getTodayActions, TodayAction, TodoType } from '../services/todo'
import { useNavigate } from 'react-router-dom'

const { Text } = Typography

const getTypeIcon = (type: TodoType) => {
  switch (type) {
    case 'task':
      return <FileTextOutlined style={{ color: '#1890ff' }} />
    case 'work_order':
      return <SolutionOutlined style={{ color: '#52c41a' }} />
    case 'opportunity':
      return <DollarOutlined style={{ color: '#fa8c16' }} />
    default:
      return <FileTextOutlined />
  }
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'red'
    case 'medium':
      return 'orange'
    case 'low':
      return 'blue'
    default:
      return 'default'
  }
}

const getActionColor = (type: TodoType) => {
  switch (type) {
    case 'task':
      return '#1890ff'
    case 'work_order':
      return '#52c41a'
    case 'opportunity':
      return '#fa8c16'
    default:
      return '#595959'
  }
}

interface TodayActionListProps {
  maxItems?: number
}

export const TodayActionList = ({ maxItems = 5 }: TodayActionListProps) => {
  const navigate = useNavigate()
  const { data: actions = [], isLoading } = useQuery(
    'todayActions',
    getTodayActions,
    {
      refetchInterval: 60000, // 每分钟刷新一次
    }
  )

  const displayActions = actions.slice(0, maxItems)

  return (
    <Card
      title={
        <Space>
          <div
            style={{
              width: '4px',
              height: '18px',
              background: '#52c41a',
              borderRadius: '2px',
            }}
          />
          <Text strong style={{ fontSize: '16px', color: '#262626' }}>
            今日行动清单
          </Text>
          {actions.length > 0 && (
            <Tag color="green" style={{ marginLeft: '8px' }}>
              {actions.length} 项
            </Tag>
          )}
          <Text type="secondary" style={{ fontSize: '12px', marginLeft: '8px' }}>
            今日需立即处理
          </Text>
        </Space>
      }
      style={{
        borderRadius: '12px',
        border: '1px solid #e8e8e8',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        height: '100%',
      }}
      styles={{
        header: {
          borderBottom: '1px solid #f0f0f0',
          padding: '18px 24px',
        },
        body: { padding: '16px' },
      }}
      loading={isLoading}
    >
      {displayActions.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无待处理事项，继续保持！"
          style={{ margin: '40px 0' }}
        />
      ) : (
        <List
          dataSource={displayActions}
          renderItem={(item: TodayAction, index: number) => (
            <List.Item
              style={{
                padding: '16px 0',
                borderBottom: index < displayActions.length - 1 ? '1px solid #f0f0f0' : 'none',
              }}
            >
              <div style={{ width: '100%' }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background:
                          item.type === 'task'
                            ? '#e6f7ff'
                            : item.type === 'work_order'
                            ? '#f6ffed'
                            : '#fff7e6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        flexShrink: 0,
                      }}
                    >
                      {getTypeIcon(item.type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Space size="small" wrap style={{ marginBottom: '4px' }}>
                        <Text
                          strong
                          style={{
                            fontSize: '14px',
                            color: '#262626',
                          }}
                          ellipsis={{ tooltip: item.title }}
                        >
                          {item.title}
                        </Text>
                        <Tag
                          color={getPriorityColor(item.priority)}
                          style={{ margin: 0, fontSize: '11px' }}
                        >
                          {item.priority === 'high'
                            ? '高优先级'
                            : item.priority === 'medium'
                            ? '中优先级'
                            : '低优先级'}
                        </Tag>
                      </Space>
                      <Text
                        type="secondary"
                        style={{ fontSize: '12px', display: 'block', marginBottom: '8px' }}
                        ellipsis={{ tooltip: item.description }}
                      >
                        {item.description}
                      </Text>
                      <div
                        style={{
                          padding: '8px 12px',
                          background: '#f5f5f5',
                          borderRadius: '6px',
                          marginTop: '4px',
                        }}
                      >
                        <Space size="small">
                          <CheckCircleOutlined
                            style={{
                              fontSize: '12px',
                              color: getActionColor(item.type),
                            }}
                          />
                          <Text
                            style={{
                              fontSize: '12px',
                              color: getActionColor(item.type),
                              fontWeight: 500,
                            }}
                          >
                            {item.action}
                          </Text>
                        </Space>
                        <Text
                          type="secondary"
                          style={{
                            fontSize: '11px',
                            display: 'block',
                            marginTop: '4px',
                            marginLeft: '20px',
                          }}
                        >
                          {item.reason}
                        </Text>
                      </div>
                    </div>
                    <Button
                      type="text"
                      size="small"
                      icon={<RightOutlined />}
                      onClick={() => navigate(item.link)}
                      style={{
                        color: getActionColor(item.type),
                        flexShrink: 0,
                      }}
                    >
                      处理
                    </Button>
                  </div>
                </Space>
              </div>
            </List.Item>
          )}
        />
      )}
    </Card>
  )
}

