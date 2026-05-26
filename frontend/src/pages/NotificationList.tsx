/**
 * 通知列表页面
 */
import { useState, useEffect } from 'react'
import { Table, Tag, Button, Space, Select, message, Popconfirm, Alert, Typography } from 'antd'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { notificationService, Notification, NotificationType, NotificationTypeLabels } from '../services/notification'
import EmptyState from '../components/EmptyState'
import dayjs from 'dayjs'
import { useNavigate, useSearchParams } from 'react-router-dom'

const { Title } = Typography

const NotificationList = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  
  // 从 URL 参数读取分页和筛选条件
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
  const urlPageSize = searchParams.get('page_size') ? parseInt(searchParams.get('page_size')!, 10) : 20
  const urlIsRead = searchParams.get('is_read') === 'true' ? true : searchParams.get('is_read') === 'false' ? false : undefined
  const urlNotificationType = searchParams.get('notification_type') as NotificationType | undefined
  
  const [pagination, setPagination] = useState({ page: urlPage, page_size: urlPageSize })
  const [filters, setFilters] = useState<{
    is_read?: boolean
    notification_type?: NotificationType
  }>({
    is_read: urlIsRead,
    notification_type: urlNotificationType,
  })
  
  // 当 URL 参数变化时，更新状态
  useEffect(() => {
    setPagination({ page: urlPage, page_size: urlPageSize })
    setFilters({
      is_read: urlIsRead,
      notification_type: urlNotificationType,
    })
  }, [urlPage, urlPageSize, urlIsRead, urlNotificationType])

  const { data: notificationsData, isLoading, error } = useQuery(
    ['notifications', pagination.page, pagination.page_size, filters],
    () => notificationService.getNotifications({
      page: pagination.page,
      page_size: pagination.page_size,
      ...filters,
    }),
  )

  const notifications = notificationsData?.items || []
  const total = notificationsData?.total || 0

  const markAsReadMutation = useMutation(notificationService.markAsRead, {
    onSuccess: () => {
      message.success('已标记为已读')
      // 使用 refetchQueries 保持当前分页状态
      queryClient.refetchQueries(['notifications', pagination.page, pagination.page_size, filters])
      queryClient.invalidateQueries('notificationUnreadCount')
    },
  })

  const markAllAsReadMutation = useMutation(notificationService.markAllAsRead, {
    onSuccess: (data) => {
      message.success(data.message)
      // 使用 refetchQueries 保持当前分页状态
      queryClient.refetchQueries(['notifications', pagination.page, pagination.page_size, filters])
      queryClient.invalidateQueries('notificationUnreadCount')
    },
  })

  const deleteMutation = useMutation(notificationService.deleteNotification, {
    onSuccess: () => {
      message.success('删除成功')
      // 使用 refetchQueries 保持当前分页状态
      queryClient.refetchQueries(['notifications', pagination.page, pagination.page_size, filters])
      queryClient.invalidateQueries('notificationUnreadCount')
    },
  })

  const deleteAllMutation = useMutation(
    () => notificationService.deleteAllNotifications(filters.is_read),
    {
      onSuccess: () => {
        message.success('删除成功')
        // 使用 refetchQueries 保持当前分页状态
        queryClient.refetchQueries(['notifications', pagination.page, pagination.page_size, filters])
        queryClient.invalidateQueries('notificationUnreadCount')
      },
    }
  )

  const handleTableChange = (page: number, pageSize: number) => {
    setPagination({ page, page_size: pageSize })
    // 更新 URL 参数以保持分页状态
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', page.toString())
    newParams.set('page_size', pageSize.toString())
    setSearchParams(newParams, { replace: true })
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id)
    }

    if (notification.resource_type && notification.resource_id) {
      // 将当前分页和筛选信息作为查询参数传递
      const params = new URLSearchParams(searchParams)
      
      switch (notification.resource_type) {
        case 'task':
          navigate(`/tasks/${notification.resource_id}?${params.toString()}`)
          break
        case 'work_order':
          navigate(`/work-orders/${notification.resource_id}?${params.toString()}`)
          break
        case 'opportunity':
          navigate(`/opportunities/${notification.resource_id}?${params.toString()}`)
          break
        case 'visit_log':
          navigate(`/visit-logs/${notification.resource_id}?${params.toString()}`)
          break
        case 'review':
          navigate(`/reviews/${notification.resource_id}?${params.toString()}`)
          break
        case 'user':
          // 用户注册通知跳转到用户管理界面，并筛选待审核用户
          navigate('/users?approval_status=pending')
          break
        default:
          navigate('/notifications')
      }
    }
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '类型',
      dataIndex: 'notification_type',
      key: 'notification_type',
      width: 150,
      render: (type: NotificationType | string) => (
        <Tag color="blue">
          {NotificationTypeLabels[type as NotificationType] || (typeof type === 'string' ? type : '未知类型')}
        </Tag>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, record: Notification) => (
        <span
          style={{
            fontWeight: record.is_read ? 'normal' : 'bold',
            cursor: 'pointer',
            color: record.is_read ? 'inherit' : '#1890ff',
          }}
          onClick={() => handleNotificationClick(record)}
        >
          {title}
        </span>
      ),
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'is_read',
      key: 'is_read',
      width: 100,
      render: (isRead: boolean) => (
        <Tag color={isRead ? 'default' : 'processing'}>
          {isRead ? '已读' : '未读'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Notification) => (
        <Space>
          {!record.is_read && (
            <Button
              type="link"
              size="small"
              onClick={() => markAsReadMutation.mutate(record.id)}
              loading={markAsReadMutation.isLoading}
            >
              标记已读
            </Button>
          )}
          <Popconfirm
            title="确定删除这条通知吗？"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>通知中心</Title>
        <Space>
          <Select
            placeholder="筛选状态"
            allowClear
            style={{ width: 120 }}
            value={filters.is_read}
            onChange={(value) => {
              setFilters({ ...filters, is_read: value })
              // 更新 URL 参数
              const newParams = new URLSearchParams(searchParams)
              if (value !== undefined && value !== null) {
                newParams.set('is_read', value.toString())
              } else {
                newParams.delete('is_read')
              }
              newParams.set('page', '1') // 筛选时重置到第一页
              setSearchParams(newParams, { replace: true })
            }}
          >
            <Select.Option value={false}>未读</Select.Option>
            <Select.Option value={true}>已读</Select.Option>
          </Select>
          <Select
            placeholder="筛选类型"
            allowClear
            style={{ width: 150 }}
            value={filters.notification_type}
            onChange={(value) => {
              setFilters({ ...filters, notification_type: value })
              // 更新 URL 参数
              const newParams = new URLSearchParams(searchParams)
              if (value) {
                newParams.set('notification_type', value)
              } else {
                newParams.delete('notification_type')
              }
              newParams.set('page', '1') // 筛选时重置到第一页
              setSearchParams(newParams, { replace: true })
            }}
          >
            {Object.entries(NotificationTypeLabels).map(([value, label]) => (
              <Select.Option key={value} value={value}>
                {label}
              </Select.Option>
            ))}
          </Select>
          {notifications.some((n: Notification) => !n.is_read) && (
            <Button onClick={() => markAllAsReadMutation.mutate()} loading={markAllAsReadMutation.isLoading}>
              全部已读
            </Button>
          )}
          <Popconfirm
            title={`确定删除所有${filters.is_read === false ? '未读' : filters.is_read === true ? '已读' : ''}通知吗？`}
            onConfirm={() => deleteAllMutation.mutate()}
            okText="确定"
            cancelText="取消"
          >
            <Button danger>
              删除{filters.is_read === false ? '未读' : filters.is_read === true ? '已读' : '全部'}
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {Boolean(error) && (
        <Alert
          message="加载失败"
          description="请刷新重试"
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        columns={columns}
        dataSource={notifications}
        loading={isLoading}
        rowKey="id"
        pagination={{
          current: pagination.page,
          pageSize: pagination.page_size,
          total: total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: handleTableChange,
          onShowSizeChange: handleTableChange,
        }}
        locale={{
          emptyText: <EmptyState description="暂无通知" />,
        }}
      />
    </div>
  )
}

export default NotificationList

