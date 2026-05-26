/**
 * 创建复盘页面
 */
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { extractErrorMessage } from '../utils/errorHandler'
import { Card, Form, Input, Button, message, Space, Select } from 'antd'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { reviewService } from '../services/review'
import { visitLogService } from '../services/visitLog'
import { workOrderService } from '../services/workOrder'
import { useAuth } from '../contexts/AuthContext'
import dayjs from 'dayjs'

const { TextArea } = Input

const ReviewCreate = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const visit_log_id = searchParams.get('visit_log_id')
  const { user, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  
  // 从 location 获取来源页面的查询参数（分页信息）
  const getReturnUrl = () => {
    // 优先使用 location.state 中的返回 URL（如果列表页传递了）
    if (location.state && (location.state as any).returnUrl) {
      return (location.state as any).returnUrl
    }
    // 否则使用 location.search 中的参数
    const returnParams = new URLSearchParams(location.search)
    // 移除创建页面特有的参数
    returnParams.delete('visit_log_id')
    if (returnParams.toString()) {
      return `/reviews?${returnParams.toString()}`
    }
    return '/reviews'
  }

  // 获取当前用户的工单列表（用于选择拜访日志）
  const { data: workOrdersData } = useQuery(
    'myWorkOrders',
    () => workOrderService.getWorkOrders({ page: 1, page_size: 100 }),
    {
      enabled: currentRole?.role === 'team_leader',
    }
  )

  const workOrders = workOrdersData?.items || []

  // 获取工单对应的拜访日志
  const workOrderIds = workOrders.map((wo: any) => wo.id)
  const { data: visitLogsData } = useQuery(
    'myVisitLogs',
    () => visitLogService.getVisitLogs({ page: 1, page_size: 100 }),
    {
      enabled: workOrderIds.length > 0,
    }
  )

  const visitLogs = visitLogsData?.items || []

  // 过滤出属于当前组长工单的拜访日志
  const availableVisitLogs = visitLogs.filter((vl: any) =>
    workOrders.some((wo: any) => wo.id === vl.work_order_id && wo.team_leader_id === user?.id)
  )

  const createMutation = useMutation(reviewService.createReview, {
    onSuccess: () => {
      message.success('复盘创建成功')
      queryClient.invalidateQueries('reviews')
      navigate(getReturnUrl())
    },
    onError: (error: unknown) => {
      message.error(extractErrorMessage(error, '创建失败'))
    },
  })

  const handleSubmit = (values: any) => {
    createMutation.mutate(values)
  }

  // 如果有 visit_log_id 参数，自动填充
  if (visit_log_id && !form.getFieldValue('visit_log_id')) {
    form.setFieldValue('visit_log_id', Number(visit_log_id))
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '复盘管理', to: getReturnUrl() },
          { title: '创建复盘' },
        ]}
      />

      <Card title="创建复盘">
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          initialValues={visit_log_id ? { visit_log_id: Number(visit_log_id) } : {}}
        >
          <Form.Item
            name="visit_log_id"
            label="选择拜访日志"
            rules={[{ required: true, message: '请选择拜访日志' }]}
          >
            <Select placeholder="请选择拜访日志">
              {availableVisitLogs.map((vl: any) => (
                <Select.Option key={vl.id} value={vl.id}>
                  {vl.work_order_no || `工单#${vl.work_order_id}`} - {dayjs(vl.visit_date).format('YYYY-MM-DD')}
                  {vl.work_order_task_name && ` (${vl.work_order_task_name})`}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="comment" label="批注内容">
            <TextArea rows={4} placeholder="请输入批注内容..." />
          </Form.Item>

          <Form.Item name="review_summary" label="复盘总结">
            <TextArea rows={6} placeholder="请输入复盘总结..." />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={createMutation.isLoading}>
                提交
              </Button>
              <Button onClick={() => navigate(getReturnUrl())}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default ReviewCreate

