/**
 * 线索维护详情页面
 */
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from 'react-query'
import { Card, Descriptions, Tag, Button, Result, Space, Timeline, Typography } from 'antd'
import { visitLogService } from '../services/visitLog'
import { convertProductValueToLabel } from '../utils/productUtils'
import { useAuth } from '../contexts/AuthContext'
import Loading from '../components/Loading'
import ErrorBoundary from '../components/ErrorBoundary'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import {
  formatRequirementScenarioCategoryDisplay,
  formatStageEffortBreakdownDisplay,
} from '../constants/visitLog'
import dayjs from 'dayjs'
import { parseProgressHistory, formatProgressHistoryAt } from '../utils/visitLogProgressHistory'

const { Text } = Typography

const formatClueRelatedProducts = (value?: string | null): string => {
  if (!value) return '-'
  return convertProductValueToLabel(value)
}

const VisitLogDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  
  // 从 location 获取来源页面的查询参数（分页信息）
  const getReturnUrl = () => {
    const searchParams = new URLSearchParams(location.search)
    // 如果有查询参数，返回时带上这些参数
    if (searchParams.toString()) {
      return `/visit-logs?${searchParams.toString()}`
    }
    return '/visit-logs'
  }
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()

  const { data: visitLog, isLoading, error, refetch } = useQuery(
    ['visitLog', id],
    () => visitLogService.getVisitLog(Number(id!)),
    { enabled: !!id }
  )

  if (isLoading) {
    return <Loading tip="加载拜访日志详情..." />
  }

  if (error) {
    return <ErrorBoundary error={error as Error} onRetry={() => refetch()} title="加载拜访日志失败" />
  }

  if (!visitLog) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="拜访日志不存在"
        extra={
          <Button type="primary" onClick={() => navigate('/visit-logs')}>
            返回拜访日志列表
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '线索维护', to: getReturnUrl() },
          { title: visitLog.work_order_no ? `日志 · ${visitLog.work_order_no}` : `线索维护 #${visitLog.id}` },
        ]}
      />

      <Card title="线索维护详情">
        <Descriptions column={2} bordered>
          {/* 与创建页一致：选择工单 → 组别行 → 行业行 → 拜访信息行 → 拜访内容等 */}
          <Descriptions.Item label="工单" span={2}>
            {visitLog.work_order_no ? (
              <Button
                type="link"
                style={{ padding: 0 }}
                onClick={() => navigate(`/work-orders/${visitLog.work_order_id}`)}
              >
                {visitLog.work_order_no}
              </Button>
            ) : (
              <span>工单 #{visitLog.work_order_id}</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="组别">{visitLog.group_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="专项任务">
            {visitLog.work_order_task_name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="所属销售单位">
            {visitLog.sales_unit || visitLog.work_order_task_sales_unit || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="客户单位">
            {visitLog.work_order_customer_unit || visitLog.customer_unit || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="行业">{visitLog.industry || '-'}</Descriptions.Item>
          <Descriptions.Item label="企业类型" span={2}>
            {visitLog.enterprise_type || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="拜访日期">
            {dayjs(visitLog.visit_date).format('YYYY-MM-DD')}
          </Descriptions.Item>
          <Descriptions.Item label="客户拜访地址">
            {visitLog.customer_visit_address || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="客户经理" span={2}>
            {visitLog.customer_manager_name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="客户经理联系方式">
            {visitLog.customer_manager_contact || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="陪跑人员">{visitLog.escort_staff || '-'}</Descriptions.Item>
          <Descriptions.Item label="拜访对象职位">
            {visitLog.visit_object_position || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="拜访对象权限">
            {(() => {
              const v = visitLog.has_decision_authority as unknown
              if (v === undefined) return <span>-</span>
              if (v === true) {
                return <Tag color="green">决策权</Tag>
              }
              if (v === false) {
                return <Tag>无</Tag>
              }
              const s = String(v ?? '').trim()
              if (!s) return <span>-</span>
              const color =
                s === '无' ? 'default' : s === '建议权' ? 'blue' : 'green'
              return <Tag color={color}>{s}</Tag>
            })()}
          </Descriptions.Item>
          <Descriptions.Item label="拜访内容" span={2}>
            {visitLog.visit_content}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {visitLog.remark || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="客户是否梳理过需求场景" span={2}>
            <Tag
              color={visitLog.has_requirement_scenario_sorted ? 'green' : 'default'}
            >
              {visitLog.has_requirement_scenario_sorted ? '是' : '否'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="需求场景分类" span={2}>
            {formatRequirementScenarioCategoryDisplay(visitLog.requirement_scenario_category)}
          </Descriptions.Item>
          <Descriptions.Item label="是否有线索" span={2}>
            <Tag color={visitLog.has_clue ? 'green' : 'default'}>
              {visitLog.has_clue ? '是' : '否'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="线索对应产品" span={2}>
            {(() => {
              const text =
                visitLog.clue_related_products_display ??
                formatClueRelatedProducts(visitLog.clue_related_products)
              if (!text || text === '-') return '-'
              const parts = text.split(', ').map((s) => s.trim()).filter(Boolean)
              return (
                <Space wrap size={[8, 8]}>
                  {parts.map((p, i) => (
                    <Tag
                      key={i}
                      color="blue"
                      style={{ marginInlineEnd: 0, whiteSpace: 'normal' }}
                    >
                      {p}
                    </Tag>
                  ))}
                </Space>
              )
            })()}
          </Descriptions.Item>
          <Descriptions.Item label="是否定开" span={2}>
            <Tag color={visitLog.is_customized_development ? 'green' : 'default'}>
              {visitLog.is_customized_development ? '是' : '否'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="定开要求" span={2}>
            {visitLog.is_customized_development
              ? visitLog.customized_development_requirements?.trim() || '-'
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="预估金额（万元）" span={2}>
            {visitLog.project_amount || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="当前阶段" span={2}>
            {visitLog.current_stage || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="阶段人员与时长" span={2}>
            {formatStageEffortBreakdownDisplay(visitLog.stage_effort_breakdown)}
          </Descriptions.Item>
          <Descriptions.Item label="推进进展" span={2}>
            {(() => {
              const progressEntries = parseProgressHistory(visitLog.promotion_progress_history)
              return progressEntries.length > 0 ? (
                <Timeline
                  items={progressEntries.map((e) => ({
                    children: (
                      <div>
                        <Text type="secondary">
                          {formatProgressHistoryAt(e.at)}
                          {e.user_name ? ` · ${e.user_name}` : ''}
                        </Text>
                        <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{e.text}</div>
                      </div>
                    ),
                  }))}
                />
              ) : (
                visitLog.promotion_progress || '-'
              )
            })()}
          </Descriptions.Item>
          <Descriptions.Item label="推进要求" span={2}>
            {visitLog.promotion_requirements || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="创建人">
            {visitLog.member_name ? (
              <span>{visitLog.member_name}</span>
            ) : (
              <span>用户 #{visitLog.member_id}</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {dayjs(visitLog.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间" span={2}>
            {dayjs(visitLog.updated_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: 24 }}>
          <Space>
            {currentRole?.role === 'member' && (
              <Button onClick={() => navigate(`/visit-logs/${id}/edit`)}>
                更新
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  )
}

export default VisitLogDetail
