/**
 * 创建商机页面（从线索转换）
 */
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Form, Input, Button, message, Space, Cascader, Alert, InputNumber, Tag } from 'antd'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { opportunityService } from '../services/opportunity'
import { leadService } from '../services/lead'
import { useAuth } from '../contexts/AuthContext'
import { optionConfigService, OptionConfig } from '../services/optionConfig'
import Loading from '../components/Loading'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { extractErrorMessage } from '../utils/errorHandler'

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

const { TextArea } = Input

const OpportunityCreate = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const lead_id = searchParams.get('lead_id')
  const { user, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  // 获取线索信息（如果从线索创建）
  const { data: lead, isLoading: isLeadLoading, error: leadError } = useQuery(
    ['lead', lead_id],
    () => leadService.getLead(Number(lead_id!)),
    {
      enabled: !!lead_id,
      onSuccess: (data) => {
        // 自动填充线索信息
        form.setFieldsValue({
          lead_id: data.id,
          task_id: data.task_id,
          customer_unit: data.customer_name, // 客户名称 -> 客户单位
        })
      },
    }
  )

  // 获取产品选项
  const { data: productData } = useQuery(
    ['option-configs', 'product'],
    () => optionConfigService.getOptionConfigs('product'),
    {
      enabled: true,
    }
  )

  const productOptions = productData?.items
    ? convertOptionConfigToCascaderOptions(productData.items)
    : []

  const createMutation = useMutation(opportunityService.createOpportunity, {
    onSuccess: () => {
      message.success('商机创建成功')
      queryClient.invalidateQueries('opportunities')
      queryClient.invalidateQueries('leads')
      if (lead_id) {
        navigate(`/leads/${lead_id}`)
      } else {
        navigate('/opportunities')
      }
    },
    onError: (error: unknown) => {
      message.error(extractErrorMessage(error, '创建失败'))
    },
  })

  const handleSubmit = (values: any) => {
    // 处理产品选择（级联选择器返回数组，支持多选）
    let requiredProducts = ''
    if (Array.isArray(values.required_products) && values.required_products.length > 0) {
      // 多选模式：每个选择是一个数组路径，转换为字符串数组
      const productStrings = values.required_products.map((path: string[]) => {
        if (Array.isArray(path)) {
          return path.join(' - ')
        }
        return path
      })
      requiredProducts = JSON.stringify(productStrings)
    } else {
      requiredProducts = '[]'
    }

    if (!lead_id || !lead) {
      message.error('缺少关联的线索信息，无法创建商机。')
      return
    }

    // 验证必需字段
    if (!values.opportunity_no?.trim()) {
      message.error('请输入商机编号')
      return
    }
    if (!values.customer_unit?.trim()) {
      message.error('请输入客户单位')
      return
    }
    if (!requiredProducts) {
      message.error('请选择具体产品')
      return
    }
    if (!values.description?.trim()) {
      message.error('请输入商机描述')
      return
    }
    
    // 验证数值字段
    const leadIdNum = Number(lead_id)
    const taskIdNum = lead.task_id ? Number(lead.task_id) : NaN
    
    // 确定team_leader_id：
    // - 如果是成员，使用工单的team_leader_id
    // - 如果是组长，使用当前用户ID
    let teamLeaderIdNum: number
    if (currentRole?.role === 'member') {
      // 成员创建商机时，team_leader_id应该是工单的组长
      teamLeaderIdNum = lead.work_order_team_leader_id ? Number(lead.work_order_team_leader_id) : NaN
      if (isNaN(teamLeaderIdNum) || teamLeaderIdNum <= 0) {
        message.error('无法获取工单组长信息，请检查线索数据是否完整')
        return
      }
    } else if (currentRole?.role === 'team_leader') {
      // 组长创建商机时，team_leader_id是当前用户
      teamLeaderIdNum = user?.id ? Number(user.id) : NaN
      if (isNaN(teamLeaderIdNum) || teamLeaderIdNum <= 0) {
        message.error('用户ID无效，请重新登录')
        return
      }
    } else {
      message.error('权限不足，只有成员和组长可以创建商机')
      return
    }
    
    if (isNaN(leadIdNum) || leadIdNum <= 0) {
      message.error('线索ID无效，请刷新页面重试')
      return
    }
    if (isNaN(taskIdNum) || taskIdNum <= 0) {
      console.error('线索数据:', lead) // 调试用
      message.error(`任务ID无效（当前值: ${lead.task_id}），请检查线索数据是否完整`)
      return
    }
    
    // 确保所有必需字段都存在且格式正确
    const submitData = {
      opportunity_no: values.opportunity_no.trim(),
      lead_id: leadIdNum,
      task_id: taskIdNum,
      customer_unit: values.customer_unit.trim(),
      required_products: requiredProducts, // 已经是字符串
      description: values.description.trim(),
      expected_amount: values.expected_amount?.trim() || undefined,
      team_leader_id: teamLeaderIdNum,
    }
    
    console.log('提交数据:', submitData) // 调试用
    
    createMutation.mutate(submitData)
  }

  if (isLeadLoading) {
    return <Loading tip="加载线索信息..." />
  }

  if (leadError) {
    return (
      <Alert
        message="加载线索失败"
        description={extractErrorMessage(leadError, '未知错误')}
        type="error"
        showIcon
        action={
          <Button size="small" onClick={() => navigate('/leads')}>
            返回线索列表
          </Button>
        }
      />
    )
  }

  if (!lead_id || !lead) {
    return (
      <div>
        <Alert
          message="无法直接创建商机"
          description="商机必须从线索转换。请先找到线索，然后点击'转换为商机'按钮。"
          type="warning"
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => navigate('/leads')}>
              查看线索列表
            </Button>
          }
        />
      </div>
    )
  }

  // 检查线索是否已经转换为商机
  // 注意：这个检查在前端可能不准确，后端会再次验证
  const canConvert = currentRole?.role === 'member' || currentRole?.role === 'team_leader'

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '线索管理', to: '/leads' },
          { title: lead.customer_name || `线索 #${lead.id}`, to: `/leads/${lead_id}` },
          { title: '转换为商机' },
        ]}
      />

      <Card title="从线索转换为商机">
        {/* 显示线索信息 */}
        <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', borderRadius: 8 }}>
          <div>
            <strong>关联线索：</strong>
            <Button
              type="link"
              style={{ padding: 0 }}
              onClick={() => navigate(`/leads/${lead.id}`)}
            >
              线索 #{lead.id}
            </Button>
          </div>
          <div>
            <strong>客户名称：</strong>
            {lead.customer_name}
          </div>
          <div>
            <strong>需求方向：</strong>
            <Space wrap>
              {lead.requirement_direction?.split(', ').map((direction: string, index: number) => (
                <Tag key={index} color="blue">{direction.trim()}</Tag>
              )) || <Tag color="blue">{lead.requirement_direction}</Tag>}
            </Space>
          </div>
          <div>
            <strong>详细需求描述：</strong>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{lead.detail_description}</div>
          </div>
          {lead.task_name && (
            <div>
              <strong>所属任务：</strong>
              <Button
                type="link"
                style={{ padding: 0 }}
                onClick={() => navigate(`/tasks/${lead.task_id}`)}
              >
                {lead.task_name}
              </Button>
            </div>
          )}
        </div>

        {!canConvert ? (
          <Alert
            message="权限不足"
            description="只有成员和组长可以创建商机"
            type="error"
          />
        ) : (
          <Form
            form={form}
            onFinish={handleSubmit}
            layout="vertical"
            initialValues={{
              customer_unit: lead.customer_name,
            }}
          >
            <Form.Item
              name="opportunity_no"
              label="商机编号"
              rules={[{ required: true, message: '请输入商机编号' }]}
            >
              <Input placeholder="请输入商机编号" />
            </Form.Item>

            <Form.Item
              name="customer_unit"
              label="客户单位"
              rules={[{ required: true, message: '请输入客户单位' }]}
            >
              <Input placeholder="请输入客户单位" />
            </Form.Item>

            <Form.Item
              name="required_products"
              label="具体产品"
              rules={[{ required: true, message: '请选择具体产品' }]}
            >
              <Cascader
                multiple
                options={productOptions}
                displayRender={(labels) => labels.map(String).join('-')}
                placeholder="请选择具体产品（可多选）"
                showSearch={{
                  filter: (inputValue, path) => {
                    return path.some(
                      (option: any) =>
                        (option.label as string).toLowerCase().indexOf(inputValue.toLowerCase()) > -1
                    )
                  },
                }}
                changeOnSelect={false}
                maxTagCount="responsive"
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="description"
              label="商机描述"
              rules={[{ required: true, message: '请输入商机描述' }]}
            >
              <TextArea rows={6} placeholder="请详细描述商机情况..." />
            </Form.Item>

            <Form.Item
              name="expected_amount"
              label="预计金额"
            >
              <Space.Compact style={{ width: '100%' }}>
                <InputNumber
                  placeholder="请输入预计金额"
                  style={{ width: 'calc(100% - 60px)' }}
                  min={0}
                  precision={2}
                  controls={true}
                  parser={(value) => {
                    // 只允许数字和小数点，并转换为数字
                    const cleaned = value!.replace(/[^\d.]/g, '')
                    const parsed = parseFloat(cleaned)
                    return isNaN(parsed) ? 0 : parsed
                  }}
                  onKeyPress={(e) => {
                    // 阻止非数字字符（除了小数点、退格、删除等）
                    const char = String.fromCharCode(e.which || e.keyCode)
                    if (!/[0-9.]/.test(char) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                      e.preventDefault()
                    }
                  }}
                />
                <Input
                  style={{
                    width: 60,
                    textAlign: 'center',
                    pointerEvents: 'none',
                    backgroundColor: '#fafafa',
                  }}
                  placeholder="万元"
                  value="万元"
                  readOnly
                />
              </Space.Compact>
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={createMutation.isLoading}>
                  提交
                </Button>
                <Button onClick={() => navigate(`/leads/${lead_id}`)}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  )
}

export default OpportunityCreate
