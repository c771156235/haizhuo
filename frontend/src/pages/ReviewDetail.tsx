/**
 * 复盘详情页面
 */
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from 'react-query'
import { Card, Descriptions, Button, Result, Space } from 'antd'
import { reviewService } from '../services/review'
import { visitLogService } from '../services/visitLog'
import { useAuth } from '../contexts/AuthContext'
import Loading from '../components/Loading'
import ErrorBoundary from '../components/ErrorBoundary'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import dayjs from 'dayjs'

const ReviewDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  
  // 从 location 获取来源页面的查询参数（分页信息）
  const getReturnUrl = () => {
    const searchParams = new URLSearchParams(location.search)
    // 如果有查询参数，返回时带上这些参数
    if (searchParams.toString()) {
      return `/reviews?${searchParams.toString()}`
    }
    return '/reviews'
  }

  const { data: review, isLoading, error, refetch } = useQuery(
    ['review', id],
    () => reviewService.getReview(Number(id!)),
    { enabled: !!id }
  )
  
  // 获取拜访日志详情以获取工单ID
  const { data: visitLog } = useQuery(
    ['visitLog', review?.visit_log_id],
    () => review && review.visit_log_id ? visitLogService.getVisitLog(review.visit_log_id) : null,
    { enabled: !!review?.visit_log_id }
  )

  if (isLoading) {
    return <Loading tip="加载复盘详情..." />
  }

  if (error) {
    return <ErrorBoundary error={error as Error} onRetry={() => refetch()} title="加载复盘失败" />
  }

  if (!review) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="复盘不存在"
        extra={
          <Button type="primary" onClick={() => navigate('/reviews')}>
            返回复盘列表
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '复盘管理', to: getReturnUrl() },
          { title: `复盘 #${review.id}` },
        ]}
      />

      <Card title="复盘详情">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="拜访日期">
            {review.visit_log_visit_date ? dayjs(review.visit_log_visit_date).format('YYYY-MM-DD') : `日志 #${review.visit_log_id}`}
          </Descriptions.Item>
          <Descriptions.Item label="工单">
            {review.visit_log_work_order_no ? (
              <Space>
                <Button 
                  type="link" 
                  style={{ padding: 0 }}
                  onClick={() => {
                    if (visitLog?.work_order_id) {
                      navigate(`/work-orders/${visitLog.work_order_id}`)
                    }
                  }}
                >
                  {review.visit_log_work_order_no}
                </Button>
                {review.visit_log_task_name && (
                  <span style={{ color: '#8c8c8c', fontSize: '12px' }}>
                    ({review.visit_log_task_name})
                  </span>
                )}
              </Space>
            ) : (
              <span>日志 #{review.visit_log_id}</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="组长" span={2}>
            {review.team_leader_name ? (
              <span>{review.team_leader_name}</span>
            ) : (
              <span>用户 #{review.team_leader_id}</span>
            )}
          </Descriptions.Item>
          {review.comment && (
            <Descriptions.Item label="批注内容" span={2}>
              {review.comment}
            </Descriptions.Item>
          )}
          {review.review_summary && (
            <Descriptions.Item label="复盘总结" span={2}>
              {review.review_summary}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="创建时间">
            {dayjs(review.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {dayjs(review.updated_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
        </Descriptions>

        {currentRole?.role === 'team_leader' && (
          <div style={{ marginTop: 24 }}>
            <Button type="primary" onClick={() => navigate(`/reviews/${id}/edit`)}>
              编辑
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

export default ReviewDetail

