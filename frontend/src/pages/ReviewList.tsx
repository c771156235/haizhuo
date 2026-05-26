/**
 * 复盘列表页面
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Table, Button, Space, Alert, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useQuery } from 'react-query'
import { reviewService, Review } from '../services/review'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'

const { Title } = Typography

const ReviewList = () => {
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  // 从 URL 参数读取分页
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
  const urlPageSize = searchParams.get('page_size') ? parseInt(searchParams.get('page_size')!, 10) : 10
  
  const [pagination, setPagination] = useState({ page: urlPage, page_size: urlPageSize })
  
  // 当 URL 参数变化时，更新状态
  useEffect(() => {
    setPagination({ page: urlPage, page_size: urlPageSize })
  }, [urlPage, urlPageSize])

  const { data: reviewsData, isLoading, error } = useQuery(
    ['reviews', pagination.page, pagination.page_size],
    () => reviewService.getReviews({
      page: pagination.page,
      page_size: pagination.page_size,
    })
  )

  const reviews = reviewsData?.items || []
  const total = reviewsData?.total || 0

  const handleTableChange = (page: number, pageSize: number) => {
    setPagination({ page, page_size: pageSize })
    // 更新 URL 参数以保持分页状态
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', page.toString())
    newParams.set('page_size', pageSize.toString())
    setSearchParams(newParams, { replace: true })
  }

  const columns = [
    {
      title: '拜访日期',
      key: 'visit_date',
      render: (_: any, record: Review) => (
        record.visit_log_visit_date ? dayjs(record.visit_log_visit_date).format('YYYY-MM-DD') : `日志 #${record.visit_log_id}`
      ),
    },
    {
      title: '工单编号',
      key: 'work_order',
      render: (_: any, record: Review) => (
        record.visit_log_work_order_no ? (
          <Button 
            type="link" 
            style={{ padding: 0 }}
            onClick={() => {
              // 需要先获取工单ID，这里先显示工单编号
              // 如果需要跳转，可以通过visit_log_id查询
            }}
          >
            {record.visit_log_work_order_no}
          </Button>
        ) : (
          <span>-</span>
        )
      ),
    },
    {
      title: '批注内容',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Review) => (
        <Space>
          <Button 
            type="link" 
            onClick={() => {
              // 将当前分页信息作为查询参数传递
              const params = new URLSearchParams(searchParams)
              navigate(`/reviews/${record.id}?${params.toString()}`)
            }}
          >
            查看详情
          </Button>
          {currentRole?.role === 'team_leader' && (
            <Button type="link" onClick={() => navigate(`/reviews/${record.id}/edit`)}>
              编辑
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Title level={3} style={{ margin: 0 }}>复盘管理</Title>
        {currentRole?.role === 'team_leader' && (
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => {
              // 传递当前查询参数，以便创建页面返回时能恢复分页状态
              const params = new URLSearchParams(searchParams)
              navigate(`/reviews/create?${params.toString()}`, { state: { returnUrl: `/reviews?${params.toString()}` } })
            }}
          >
            创建复盘
          </Button>
        )}
      </div>
      <>
        {error && (
          <Alert
            message="加载失败"
            description={extractErrorMessage(error, '未知错误')}
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={() => window.location.reload()}>
                刷新
              </Button>
            }
          />
        )}
      </>

      <Table
        columns={columns}
        dataSource={reviews}
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
          emptyText: (
            <EmptyState
              description="暂无复盘数据"
              showCreateButton={currentRole?.role === 'team_leader'}
              onCreateClick={() => {
                const params = new URLSearchParams(searchParams)
                navigate(`/reviews/create?${params.toString()}`, { state: { returnUrl: `/reviews?${params.toString()}` } })
              }}
              createButtonText="创建复盘"
            />
          ),
        }}
      />
    </div>
  )
}

export default ReviewList
