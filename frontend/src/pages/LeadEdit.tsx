/**
 * 编辑线索页面
 */
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, message, Space, Result, Cascader } from 'antd'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { leadService } from '../services/lead'
import { optionConfigService, OptionConfig } from '../services/optionConfig'
import Loading from '../components/Loading'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { extractErrorMessage } from '../utils/errorHandler'

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

const LeadEdit = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  const { data: lead, isLoading } = useQuery(
    ['lead', id],
    () => leadService.getLead(Number(id!)),
    {
      enabled: !!id,
      onSuccess: (data) => {
        // 处理需求方向，将 JSON 数组字符串转换为级联选择器的多选格式
        let requirementDirection: string[][] = []
        if (data.requirement_direction) {
          try {
            // 尝试解析为 JSON 数组
            const parsed = JSON.parse(data.requirement_direction)
            if (Array.isArray(parsed)) {
              requirementDirection = parsed.map((dir: string) => {
                if (typeof dir === 'string') {
                  return dir.split(' - ')
                }
                return dir
              })
            } else {
              // 兼容旧数据格式（单个字符串）
              const parts = data.requirement_direction.split(' - ')
              if (parts.length > 0) {
                requirementDirection = [parts]
              }
            }
          } catch (e) {
            // 如果不是 JSON，按旧格式处理（单个字符串）
            const parts = data.requirement_direction.split(' - ')
            if (parts.length > 0) {
              requirementDirection = [parts]
            }
          }
        }
        
        form.setFieldsValue({
          ...data,
          requirement_direction: requirementDirection.length > 0 ? requirementDirection : undefined,
        })
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

  const updateMutation = useMutation(
    (data: any) => leadService.updateLead(Number(id!), data),
    {
      onSuccess: () => {
        message.success('更新成功')
        queryClient.invalidateQueries(['lead', id])
        queryClient.invalidateQueries('leads')
        navigate(`/leads/${id}`)
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  const handleSubmit = (values: any) => {
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

    updateMutation.mutate({
      ...values,
      requirement_direction: requirementDirection,
    })
  }

  if (isLoading) {
    return <Loading tip="加载线索信息..." />
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
          { title: '线索管理', to: '/leads' },
          { title: '线索详情', to: `/leads/${id}` },
          { title: '编辑' },
        ]}
      />

      <Card title="编辑线索">
        <Form form={form} onFinish={handleSubmit} layout="vertical">
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
              <Button type="primary" htmlType="submit" loading={updateMutation.isLoading}>
                保存
              </Button>
              <Button onClick={() => navigate(`/leads/${id}`)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default LeadEdit

