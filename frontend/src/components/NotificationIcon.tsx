/**
 * 通知图标组件（带未读数量）
 */
import { Badge, Popover, Button, Space, Typography, Empty, Tag } from 'antd'
import { BellOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { notificationService, Notification, NotificationTypeLabels, NotificationType } from '../services/notification'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import { message } from 'antd'
import './NotificationIcon.css'

// 扩展 dayjs 插件
dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const { Text } = Typography

const NotificationIcon = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // 获取未读数量
  const { data: unreadData, refetch: refetchUnreadCount } = useQuery(
    'notificationUnreadCount',
    () => notificationService.getUnreadCount(),
    {
      refetchInterval: 10000, // 每10秒自动刷新一次
    }
  )

  // 只获取未读通知列表
  const { data: notificationsData, isLoading, refetch: refetchNotifications } = useQuery(
    'notificationsRecent',
    () => notificationService.getNotifications({ page: 1, page_size: 10, is_read: false }),
    {
      refetchInterval: 10000, // 每10秒自动刷新一次
    }
  )

  // 手动刷新通知
  const handleRefresh = async () => {
    await Promise.all([
      refetchUnreadCount(),
      refetchNotifications(),
    ])
    message.success('通知已刷新')
  }

  const unreadCount = unreadData?.unread_count || 0
  const notifications = notificationsData?.items || []

  // 标记为已读
  const markAsReadMutation = useMutation(notificationService.markAsRead, {
    onSuccess: () => {
      queryClient.invalidateQueries('notificationUnreadCount')
      queryClient.invalidateQueries('notificationsRecent')
    },
  })

  // 标记全部为已读
  const markAllAsReadMutation = useMutation(notificationService.markAllAsRead, {
    onSuccess: (data) => {
      message.success(data.message)
      queryClient.invalidateQueries('notificationUnreadCount')
      queryClient.invalidateQueries('notificationsRecent')
    },
  })

  const handleNotificationClick = (notification: Notification) => {
    // 标记为已读（所有显示的通知都是未读的）
    markAsReadMutation.mutate(notification.id)

    // 根据资源类型跳转
    if (notification.resource_type && notification.resource_id) {
      switch (notification.resource_type) {
        case 'task':
          navigate(`/tasks/${notification.resource_id}`)
          break
        case 'work_order':
          navigate(`/work-orders/${notification.resource_id}`)
          break
        case 'opportunity':
          navigate(`/opportunities/${notification.resource_id}`)
          break
        case 'visit_log':
          navigate(`/visit-logs/${notification.resource_id}`)
          break
        case 'review':
          navigate(`/reviews/${notification.resource_id}`)
          break
        case 'user':
          // 用户注册通知跳转到用户管理界面，并筛选待审核用户
          navigate('/users?approval_status=pending')
          break
        default:
          navigate('/notifications')
      }
    } else {
      navigate('/notifications')
    }
  }

  const handleViewAll = () => {
    navigate('/notifications')
  }

  const notificationContent = (
    <div className="notification-panel">
      {/* 头部 */}
      <div className="notification-panel__header">
        <div className="notification-panel__title">
          <BellOutlined className="notification-panel__title-icon" />
          <Text strong style={{ color: '#0f172a', fontSize: 16 }}>通知中心</Text>
          {unreadCount > 0 && (
            <Badge count={unreadCount} style={{ backgroundColor: '#ff4d4f', border: 'none' }} />
          )}
        </div>
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              handleRefresh()
            }}
            loading={isLoading}
            className="notification-panel__action"
            title="刷新通知"
          >
            刷新
          </Button>
          {unreadCount > 0 && (
            <Button
              type="text"
              size="small"
              onClick={() => markAllAsReadMutation.mutate()}
              loading={markAllAsReadMutation.isLoading}
              className="notification-panel__action"
            >
              全部已读
            </Button>
          )}
          <Button 
            type="text" 
            size="small" 
            onClick={handleViewAll}
            className="notification-panel__action"
          >
            查看全部
          </Button>
        </Space>
      </div>
      
      {/* 内容区域 */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Text type="secondary">加载中...</Text>
        </div>
      ) : notifications.length === 0 ? (
        <Empty 
          description="暂无未读通知" 
          style={{ padding: 64 }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <div className="notification-panel__list">
          {notifications.map((notification: Notification, index: number) => (
            <div
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={`notification-panel__item ${!notification.is_read ? 'notification-panel__item--unread' : ''}`}
              style={{ marginBottom: index < notifications.length - 1 ? 12 : 0 }}
            >
              {/* 未读指示点 */}
              {!notification.is_read && <div className="notification-panel__dot" />}
              
              <div className="notification-panel__body">
                {/* 标题 */}
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Text 
                    strong={!notification.is_read}
                    style={{ 
                      fontSize: 14, 
                      color: '#111827',
                      lineHeight: 1.5,
                      flex: 1,
                    }}
                    ellipsis
                  >
                    {notification.title}
                  </Text>
                </div>
                
                {/* 类型标签 */}
                <div style={{ marginBottom: 6 }}>
                  <Tag 
                    style={{ 
                      fontSize: 11, 
                      padding: '2px 8px',
                      borderRadius: '999px',
                      margin: 0,
                      backgroundColor: '#f8fafc',
                      color: '#475569',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    {NotificationTypeLabels[notification.notification_type as NotificationType] || 
                     (typeof notification.notification_type === 'string' ? notification.notification_type : '未知类型')}
                  </Tag>
                </div>
                
                {/* 内容 */}
                {notification.content && (
                  <Text
                    className="notification-panel__content"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      marginBottom: 8,
                    }}
                  >
                    {notification.content}
                  </Text>
                )}
                
                {/* 时间 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Text type="secondary" style={{ fontSize: 11, color: '#9ca3af' }}>
                    {dayjs(notification.created_at).fromNow()}
                  </Text>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <Space size="small">
      <Button
        type="text"
        icon={<ReloadOutlined />}
        onClick={handleRefresh}
        loading={isLoading}
        className="notification-trigger-btn"
        title="刷新通知"
      />
      <Popover
        content={notificationContent}
        title={null}
        placement="bottomRight"
        trigger="click"
        styles={{ 
          root: { padding: 0, backgroundColor: 'transparent' },
          body: { padding: 0, backgroundColor: 'transparent' }
        }}
        overlayClassName="notification-popover"
      >
        <Badge 
          count={unreadCount} 
          size="small" 
          offset={[-5, 5]}
          style={{ 
            backgroundColor: '#ff4d4f',
            boxShadow: '0 0 0 1px #fff',
          }}
        >
          <div className="notification-trigger-btn">
            <BellOutlined style={{ fontSize: 18, color: '#595959' }} />
          </div>
        </Badge>
      </Popover>
    </Space>
  )
}

export default NotificationIcon

