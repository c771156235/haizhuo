/**
 * 线索详情页面
 */
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from 'react-query'
import { Card, Descriptions, Tag, Button, Result, Space, Alert } from 'antd'
import { leadService } from '../services/lead'
import { useAuth } from '../contexts/AuthContext'
import Loading from '../components/Loading'
import ErrorBoundary from '../components/ErrorBoundary'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import dayjs from 'dayjs'

const LeadDetail = () => {
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
      return `/leads?${searchParams.toString()}`
    }
    return '/leads'
  }

  const { data: lead, isLoading, error, refetch } = useQuery(
    ['lead', id],
    () => leadService.getLead(Number(id!)),
    { enabled: !!id }
  )

  if (isLoading) {
    return <Loading tip="加载线索详情..." />
  }

  if (error) {
    return <ErrorBoundary error={error as Error} onRetry={() => refetch()} title="加载线索失败" />
  }

  if (!lead) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="线索不存在"
        extra={
          <Button type="primary" onClick={() => navigate('/leads')}>
            返回线索列表
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '线索管理', to: getReturnUrl() },
          { title: lead.customer_name || `线索 #${lead.id}` },
        ]}
      />

      <Card title="线索详情">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="客户名称">
            {lead.customer_name}
          </Descriptions.Item>
          <Descriptions.Item label="客户需求方向">
            <Space wrap>
              {lead.requirement_direction?.split(', ').map((direction: string, index: number) => (
                <Tag key={index} color="blue">{direction.trim()}</Tag>
              )) || <Tag color="blue">{lead.requirement_direction}</Tag>}
            </Space>
          </Descriptions.Item>
          {lead.visit_log_id && (
            <Descriptions.Item label="关联拜访日志" span={2}>
              <Button 
                type="link" 
                style={{ padding: 0 }}
                onClick={() => navigate(`/visit-logs/${lead.visit_log_id}`)}
              >
                查看拜访日志 #{lead.visit_log_id}
              </Button>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="所属任务" span={2}>
            {lead.task_name ? (
              <Space>
                <Button 
                  type="link" 
                  style={{ padding: 0 }}
                  onClick={() => navigate(`/tasks/${lead.task_id}`)}
                >
                  {lead.task_name}
                </Button>
                {lead.task_sales_unit && (
                  <span style={{ color: '#8c8c8c', fontSize: '12px' }}>
                    ({lead.task_sales_unit})
                  </span>
                )}
              </Space>
            ) : (
              <span>任务 #{lead.task_id}</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="详细需求描述" span={2}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{lead.detail_description}</div>
          </Descriptions.Item>
          <Descriptions.Item label="创建人">
            {lead.member_name || lead.member_username || `用户 #${lead.member_id}`}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {dayjs(lead.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间" span={2}>
            {dayjs(lead.updated_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          {lead.has_opportunity && lead.opportunity_id && (
            <Descriptions.Item label="商机状态" span={2}>
              <Space>
                <Tag color="success">已转换为商机</Tag>
                <Button
                  type="link"
                  style={{ padding: 0 }}
                  onClick={() => navigate(`/opportunities/${lead.opportunity_id}`)}
                >
                  查看商机 #{lead.opportunity_id}
                </Button>
              </Space>
            </Descriptions.Item>
          )}
        </Descriptions>

        {(currentRole?.role === 'member' || currentRole?.role === 'team_leader') && (
          <div style={{ marginTop: 24 }}>
            <Space>
              <Button onClick={() => navigate(`/leads/${id}/edit`)}>
                编辑
              </Button>
              {!lead.has_opportunity && (
                <Button
                  type="primary"
                  onClick={() => navigate(`/opportunities/create?lead_id=${id}`)}
                >
                  转换为商机
                </Button>
              )}
            </Space>
            {lead.has_opportunity && (
              <Alert
                message="该线索已转换为商机"
                description={
                  lead.opportunity_id ? (
                    <span>
                      无法重复转换。{' '}
                      <Button
                        type="link"
                        style={{ padding: 0, height: 'auto' }}
                        onClick={() => navigate(`/opportunities/${lead.opportunity_id}`)}
                      >
                        查看关联商机
                      </Button>
                    </span>
                  ) : (
                    '无法重复转换'
                  )
                }
                type="info"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

export default LeadDetail

