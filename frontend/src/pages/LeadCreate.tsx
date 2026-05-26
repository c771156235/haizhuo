/**
 * 创建线索页面
 */
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Card, Form, Input, Button, message, Space, Cascader, Alert } from 'antd'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { extractErrorMessage } from '../utils/errorHandler'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { leadService } from '../services/lead'
import { visitLogService } from '../services/visitLog'
import { optionConfigService, OptionConfig } from '../services/optionConfig'

const { TextArea } = Input

// 将API返回的树形结构转换为Cascader所需的格式
const convertOptionConfigToCascaderOptions = (options: OptionConfig[]): any[] => {
  return options.map((option) => ({
    value: option.value,
    label: option.label,
    children: option.children && option.children.length > 0
      ? convertOptionConfigToCascaderOptions(option.children)
      : undefined,
  }))
}

const LeadCreate = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const task_id = searchParams.get('task_id')
  const visit_log_id = searchParams.get('visit_log_id')
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
    returnParams.delete('task_id')
    returnParams.delete('visit_log_id')
    if (returnParams.toString()) {
      return `/leads?${returnParams.toString()}`
    }
    return '/leads'
  }

  // 如果是从拜访日志创建，获取拜访日志信息
  const { data: visitLog } = useQuery(
    ['visitLog', visit_log_id],
    () => visitLogService.getVisitLog(Number(visit_log_id!)),
    {
      enabled: !!visit_log_id,
      onSuccess: (data) => {
        // 从拜访日志获取任务ID
        if (data.work_order_task_id) {
          form.setFieldValue('task_id', data.work_order_task_id)
          form.setFieldValue('visit_log_id', data.id)
        }
      },
    }
  )

  // 获取客户需求方向选项
  const { data: requirementDirectionData } = useQuery(
    ['option-configs', 'requirement_direction'],
    () => optionConfigService.getOptionConfigs('requirement_direction'),
    {
      enabled: true,
    }
  )

  const requirementDirectionOptions = requirementDirectionData?.items
    ? convertOptionConfigToCascaderOptions(requirementDirectionData.items)
    : []

  const createMutation = useMutation(leadService.createLead, {
    onSuccess: () => {
      message.success('线索创建成功')
      queryClient.invalidateQueries('leads')
      navigate(getReturnUrl())
    },
    onError: (error: unknown) => {
      message.error(extractErrorMessage(error, '创建失败'))
    },
  })

  const handleSubmit = (values: any) => {
    // 如果是从拜访日志创建，visit_log_id是必需的
    if (!visit_log_id) {
      message.error('缺少拜访日志ID')
      return
    }

    if (!visitLog || !visitLog.work_order_task_id) {
      message.error('无法获取拜访日志的任务信息')
      return
    }

    // 处理级联选择器的值，转换为 JSON 数组格式（支持多选）
    let requirementDirection = ''
    if (Array.isArray(values.requirement_direction) && values.requirement_direction.length > 0) {
      // 多选模式：每个选择是一个数组路径，转换为字符串数组
      const directionStrings = values.requirement_direction.map((path: string[]) => {
        if (Array.isArray(path)) {
          return path.join(' - ')
        }
        return path
      })
      requirementDirection = JSON.stringify(directionStrings)
    } else {
      requirementDirection = '[]'
    }

    const submitData = {
      visit_log_id: Number(visit_log_id),
      task_id: visitLog.work_order_task_id,
      customer_name: values.customer_name,
      requirement_direction: requirementDirection,
      detail_description: values.detail_description,
    }

    createMutation.mutate(submitData)
  }

  // 如果有 task_id 参数，自动填充
  if (task_id && !form.getFieldValue('task_id')) {
    form.setFieldValue('task_id', Number(task_id))
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '线索管理', to: getReturnUrl() },
          { title: visit_log_id ? '从拜访日志创建线索' : '创建线索' },
        ]}
      />

      <Card title={visit_log_id ? "从拜访日志创建线索" : "创建线索"}>
        {!visit_log_id && (
          <Alert
            message="无法直接创建线索"
            description="线索必须从拜访日志创建。请先在拜访日志中进入详情后点击'创建线索'按钮。"
            type="warning"
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" onClick={() => navigate('/visit-logs')}>
                查看拜访日志
              </Button>
            }
          />
        )}
        {visit_log_id && !visitLog && (
          <Alert
            message="正在加载拜访日志信息..."
            type="info"
            style={{ marginBottom: 16 }}
          />
        )}
        {visit_log_id && visitLog && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', borderRadius: 8 }}>
            <div><strong>关联拜访日志：</strong>工单 {visitLog.work_order_no || `#${visitLog.work_order_id}`}</div>
            {visitLog.work_order_task_name && (
              <div><strong>所属任务：</strong>{visitLog.work_order_task_name}</div>
            )}
          </div>
        )}
        {visit_log_id ? (
          <Form
            form={form}
            onFinish={handleSubmit}
            layout="vertical"
            initialValues={task_id ? { task_id: Number(task_id) } : {}}
          >
            <Form.Item name="visit_log_id" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="task_id" hidden>
              <Input />
            </Form.Item>

            <Form.Item
              name="customer_name"
              label="客户名称"
              rules={[{ required: true, message: '请输入客户名称' }]}
            >
              <Input placeholder="请输入客户名称" />
            </Form.Item>

            <Form.Item
              name="requirement_direction"
              label="客户需求方向"
              rules={[{ required: true, message: '请选择客户需求方向' }]}
            >
              <Cascader
                multiple
                options={requirementDirectionOptions}
                displayRender={(labels) => labels.map(String).join('-')}
                placeholder="请选择客户需求方向（可多选）"
                showSearch={{
                  filter: (inputValue, path) => {
                    return path.some(
                      (option) =>
                        (option.label as string).toLowerCase().indexOf(inputValue.toLowerCase()) > -1
                    )
                  },
                }}
                maxTagCount="responsive"
              />
            </Form.Item>

            <Form.Item
              name="detail_description"
              label="详细需求描述"
              rules={[{ required: true, message: '请输入详细需求描述' }]}
            >
              <TextArea rows={6} placeholder="请详细描述客户需求..." />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={createMutation.isLoading}
                >
                  提交
                </Button>
                <Button onClick={() => visit_log_id ? navigate(`/visit-logs/${visit_log_id}`) : navigate(getReturnUrl())}>
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        ) : null}
      </Card>
    </div>
  )
}

export default LeadCreate

