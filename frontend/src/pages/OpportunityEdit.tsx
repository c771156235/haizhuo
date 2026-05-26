/**
 * 编辑商机页面
 */
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, message, Space, Spin, Result, Cascader, InputNumber } from 'antd'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { opportunityService } from '../services/opportunity'
import { optionConfigService, OptionConfig } from '../services/optionConfig'
import { PageBreadcrumb } from '../components/PageBreadcrumb'

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

const OpportunityEdit = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  const { data: opportunity, isLoading } = useQuery(
    ['opportunity', id],
    () => opportunityService.getOpportunity(Number(id!)),
    {
      enabled: !!id,
      onSuccess: (data) => {
        // 处理产品选择，将 JSON 数组字符串转换为级联选择器的多选格式
        let requiredProducts: string[][] = []
        if (data.required_products) {
          try {
            // 尝试解析为 JSON 数组
            const parsed = JSON.parse(data.required_products)
            if (Array.isArray(parsed)) {
              requiredProducts = parsed.map((product: string) => {
                if (typeof product === 'string') {
                  return product.split(' - ')
                }
                return product
              })
            } else {
              // 兼容旧数据格式（单个字符串）
              const parts = data.required_products.split(' - ')
              if (parts.length > 0) {
                requiredProducts = [parts]
              }
            }
          } catch (e) {
            // 如果不是 JSON，按旧格式处理（单个字符串）
            const parts = data.required_products.split(' - ')
            if (parts.length > 0) {
              requiredProducts = [parts]
            }
          }
        }
        
        // 处理预计金额：将字符串转换为数字（InputNumber需要数字类型）
        let expectedAmount: number | undefined = undefined
        if (data.expected_amount) {
          const numValue = parseFloat(data.expected_amount)
          if (!isNaN(numValue)) {
            expectedAmount = numValue
          }
        }
        
        form.setFieldsValue({
          ...data,
          required_products: requiredProducts.length > 0 ? requiredProducts : undefined,
          expected_amount: expectedAmount,
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

  const updateMutation = useMutation(
    (data: any) => {
      console.log('API调用 - 提交数据:', data)
      return opportunityService.updateOpportunity(Number(id!), data)
    },
    {
      onSuccess: async (responseData: any) => {
        console.log('API响应 - 返回数据:', responseData)
        message.success('更新成功')
        // 先清除缓存再刷新
        queryClient.removeQueries(['opportunity', id])
        // 等待一下确保清除完成
        await new Promise(resolve => setTimeout(resolve, 50))
        // 重新获取数据
        await queryClient.refetchQueries(['opportunity', id])
        queryClient.invalidateQueries('opportunities')
        // 跳转到详情页
        navigate(`/opportunities/${id}`)
      },
      onError: (error: any) => {
        const { logError, extractErrorMessage } = require('../utils/errorHandler')
        logError('更新商机失败', error)
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

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

    // 处理预计金额：InputNumber返回数字，需要转换为字符串
    let expectedAmount: string | undefined = undefined
    if (values.expected_amount !== null && values.expected_amount !== undefined && values.expected_amount !== '') {
      // 确保是数字才转换
      const numValue = Number(values.expected_amount)
      if (!isNaN(numValue) && isFinite(numValue)) {
        // 保留最多2位小数
        expectedAmount = numValue.toFixed(2).replace(/\.?0+$/, '')
      }
    }

    // 构建更新数据，只包含需要更新的字段
    const updateData: any = {
      customer_unit: values.customer_unit,
      required_products: requiredProducts,
      description: values.description,
    }

    // 始终包含 expected_amount 字段（即使是 null 或空字符串）
    // 如果用户输入了数字，转换为字符串；如果为空，设置为 null
    if (expectedAmount !== undefined && expectedAmount !== null && expectedAmount !== '') {
      updateData.expected_amount = expectedAmount
    } else {
      // 允许清空字段
      updateData.expected_amount = null
    }

    console.log('提交的更新数据:', updateData) // 调试用

    updateMutation.mutate(updateData)
  }

  if (isLoading) {
    return <Spin tip="加载商机信息..." style={{ width: '100%', padding: '50px', textAlign: 'center' }} />
  }

  if (!opportunity) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="商机不存在"
        extra={
          <Button type="primary" onClick={() => navigate('/opportunities')}>
            返回商机列表
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '商机管理', to: '/opportunities' },
          { title: opportunity.opportunity_no || '商机详情', to: `/opportunities/${id}` },
          { title: '编辑' },
        ]}
      />

      <Card title="编辑商机">
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item
            name="customer_unit"
            label="客户单位"
            rules={[{ required: true, message: '请输入客户单位' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="required_products"
            label="客户需要的产品"
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

          <Form.Item name="description" label="商机描述">
            <TextArea rows={6} />
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
              <Button type="primary" htmlType="submit" loading={updateMutation.isLoading}>
                保存
              </Button>
              <Button onClick={() => navigate(`/opportunities/${id}`)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default OpportunityEdit

