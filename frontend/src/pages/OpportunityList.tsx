/**
 * 商机列表页面
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Table, Tag, Button, Space, Form, Input, Select, Alert, Dropdown, message, DatePicker, Typography } from 'antd'
import { SearchOutlined, DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons'
import { useQuery } from 'react-query'
import { opportunityService, Opportunity } from '../services/opportunity'
import { taskService } from '../services/task'
import { optionConfigService, OptionConfig } from '../services/optionConfig'
import { exportService } from '../services/export'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import UserSelector from '../components/UserSelector'
import dayjs from 'dayjs'
import { convertProductValueToLabel } from '../utils/productUtils'
import { extractErrorMessage } from '../utils/errorHandler'
import { OpportunityStatusLabels, OpportunityStatusColors } from '../types/opportunity'

const { RangePicker } = DatePicker
const { Title } = Typography

const OpportunityList = () => {
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchForm] = Form.useForm<{
    search?: string
    status?: string
    task_id?: number
    member_id?: number
    required_product?: string
    date_range?: [dayjs.Dayjs, dayjs.Dayjs]
  }>()
  
  // 从 URL 参数读取分页和筛选条件
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
  const urlPageSize = searchParams.get('page_size') ? parseInt(searchParams.get('page_size')!, 10) : 10
  const urlSearch = searchParams.get('search') || ''
  const urlStatus = searchParams.get('status') || undefined
  const urlTaskId = searchParams.get('task_id') ? parseInt(searchParams.get('task_id')!, 10) : undefined
  const urlMemberId = searchParams.get('member_id') ? parseInt(searchParams.get('member_id')!, 10) : undefined
  const urlRequiredProduct = searchParams.get('required_product') || undefined
  const urlStartDate = searchParams.get('start_date') || undefined
  const urlEndDate = searchParams.get('end_date') || undefined
  
  const [pagination, setPagination] = useState({ page: urlPage, page_size: urlPageSize })
  const [searchText, setSearchText] = useState(urlSearch)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(urlStatus)
  const [taskIdFilter, setTaskIdFilter] = useState<number | undefined>(urlTaskId)
  const [memberIdFilter, setMemberIdFilter] = useState<number | undefined>(urlMemberId)
  const [requiredProductFilter, setRequiredProductFilter] = useState<string | undefined>(urlRequiredProduct)
  const [startDate, setStartDate] = useState<string | undefined>(urlStartDate)
  const [endDate, setEndDate] = useState<string | undefined>(urlEndDate)
  
  // 当 URL 参数变化时，更新状态
  useEffect(() => {
    setPagination({ page: urlPage, page_size: urlPageSize })
    setSearchText(urlSearch)
    setStatusFilter(urlStatus)
    setTaskIdFilter(urlTaskId)
    setMemberIdFilter(urlMemberId)
    setRequiredProductFilter(urlRequiredProduct)
    setStartDate(urlStartDate)
    setEndDate(urlEndDate)
    searchForm.setFieldsValue({
      search: urlSearch || undefined,
      status: urlStatus,
      task_id: urlTaskId,
      member_id: urlMemberId,
      required_product: urlRequiredProduct,
      date_range: urlStartDate && urlEndDate ? [dayjs(urlStartDate), dayjs(urlEndDate)] : undefined,
    })
  }, [urlPage, urlPageSize, urlSearch, urlStatus, urlTaskId, urlMemberId, urlRequiredProduct, urlStartDate, urlEndDate, searchForm])

  // 获取任务列表（用于筛选）
  const { data: tasksData } = useQuery(
    ['tasks', 'all'],
    () => taskService.getTasks({ page_size: 100 }),
    {
      enabled: true,
    }
  )
  const tasks = tasksData?.items || []

  // 获取所需产品选项配置
  const { data: productsData } = useQuery(
    ['option-configs', 'product'],
    () => optionConfigService.getOptionConfigs('product'),
    {
      enabled: true,
    }
  )

  // 展平选项配置树为下拉选项列表
  const flattenOptions = (options: OptionConfig[]): Array<{ value: string; label: string }> => {
    const result: Array<{ value: string; label: string }> = []
    const traverse = (items: OptionConfig[], parentPath: string = '') => {
      items.forEach(item => {
        const fullPath = parentPath ? `${parentPath} - ${item.label}` : item.label
        result.push({ value: fullPath, label: fullPath })
        if (item.children && item.children.length > 0) {
          traverse(item.children, fullPath)
        }
      })
    }
    traverse(options)
    return result
  }
  const productOptions = productsData?.items 
    ? flattenOptions(productsData.items)
    : []

  const { data: opportunitiesData, isLoading, error } = useQuery(
    ['opportunities', pagination.page, pagination.page_size, searchText, statusFilter, taskIdFilter, memberIdFilter, requiredProductFilter, startDate, endDate],
    () => opportunityService.getOpportunities({
      page: pagination.page,
      page_size: pagination.page_size,
      search: searchText || undefined,
      status: statusFilter,
      task_id: taskIdFilter,
      member_id: memberIdFilter,
      required_product: requiredProductFilter,
      start_date: startDate,
      end_date: endDate,
    })
  )

  const opportunities = opportunitiesData?.items || []
  const total = opportunitiesData?.total || 0

  const handleTableChange = (page: number, pageSize: number) => {
    setPagination({ page, page_size: pageSize })
    // 更新 URL 参数以保持分页状态
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', page.toString())
    newParams.set('page_size', pageSize.toString())
    setSearchParams(newParams, { replace: true })
  }

  const handleSearch = (values: {
    search?: string
    status?: string
    task_id?: number
    member_id?: number
    required_product?: string
    date_range?: [dayjs.Dayjs, dayjs.Dayjs]
  }): void => {
    setSearchText(values.search || '')
    setStatusFilter(values.status)
    setTaskIdFilter(values.task_id)
    setMemberIdFilter(values.member_id)
    setRequiredProductFilter(values.required_product)
    
    // 处理日期范围
    if (values.date_range && values.date_range.length === 2) {
      setStartDate(values.date_range[0].format('YYYY-MM-DD'))
      setEndDate(values.date_range[1].format('YYYY-MM-DD'))
    } else {
      setStartDate(undefined)
      setEndDate(undefined)
    }
    
    setPagination({ page: 1, page_size: pagination.page_size })
    // 更新 URL 参数，搜索时重置到第一页
    const newParams = new URLSearchParams()
    if (values.search) newParams.set('search', values.search)
    if (values.status) newParams.set('status', values.status)
    if (values.task_id) newParams.set('task_id', values.task_id.toString())
    if (values.member_id) newParams.set('member_id', values.member_id.toString())
    if (values.required_product) newParams.set('required_product', values.required_product)
    if (values.date_range && values.date_range.length === 2) {
      newParams.set('start_date', values.date_range[0].format('YYYY-MM-DD'))
      newParams.set('end_date', values.date_range[1].format('YYYY-MM-DD'))
    }
    newParams.set('page', '1')
    newParams.set('page_size', pagination.page_size.toString())
    setSearchParams(newParams, { replace: true })
  }

  const columns = [
    {
      title: '商机编号',
      dataIndex: 'opportunity_no',
      key: 'opportunity_no',
      width: 150,
      ellipsis: true,
    },
    {
      title: '客户单位',
      dataIndex: 'customer_unit',
      key: 'customer_unit',
      width: 200,
      ellipsis: true,
    },
    {
      title: '所需产品',
      dataIndex: 'required_products',
      key: 'required_products',
      width: 400,
      minWidth: 300,
      render: (text: string) => {
        const labelText = convertProductValueToLabel(text || '')
        return (
          <Space wrap>
            {labelText.split(', ').map((product: string, index: number) => (
              <Tag key={index} color="blue">{product.trim()}</Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={OpportunityStatusColors[status]}>
          {OpportunityStatusLabels[status] || status}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: Opportunity) => (
        <Space>
          <Button 
            type="link" 
            onClick={() => {
              // 将当前分页信息作为查询参数传递
              const params = new URLSearchParams(searchParams)
              navigate(`/opportunities/${record.id}?${params.toString()}`)
            }}
          >
            查看详情
          </Button>
          {currentRole?.role === 'team_leader' && (
            <Button type="link" onClick={() => navigate(`/opportunities/${record.id}/edit`)}>
              编辑
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>商机管理</Title>
        <Space>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'excel',
                  label: '导出Excel',
                  icon: <FileExcelOutlined />,
                  onClick: async () => {
                    try {
                      await exportService.exportOpportunitiesExcel()
                      message.success('导出成功')
                    } catch (error: any) {
                      message.error(error?.message || '导出失败')
                    }
                  },
                },
                {
                  key: 'pdf',
                  label: '导出PDF',
                  icon: <FilePdfOutlined />,
                  onClick: async () => {
                    try {
                      await exportService.exportOpportunitiesPdf()
                      message.success('导出成功')
                    } catch (error: any) {
                      message.error(error?.message || '导出失败')
                    }
                  },
                },
              ],
            }}
          >
            <Button icon={<DownloadOutlined />}>
              导出数据
            </Button>
          </Dropdown>
        </Space>
      </div>

      {/* 搜索和筛选 */}
      {(
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Form
            form={searchForm}
            layout="inline"
            onFinish={handleSearch}
            style={{ flex: 1 }}
          >
            <Form.Item name="search">
              <Input
                placeholder="搜索商机编号或客户单位"
                prefix={<SearchOutlined />}
                allowClear
                style={{ width: 250 }}
              />
            </Form.Item>
            <Form.Item name="status">
              <Select placeholder="状态筛选" allowClear style={{ width: 150 }}>
                {Object.entries(OpportunityStatusLabels).map(([value, label]) => (
                  <Select.Option key={value} value={value}>
                    {label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="task_id">
              <Select
                placeholder="所属任务"
                allowClear
                showSearch
                style={{ width: 200 }}
                filterOption={(input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                {tasks.map((task: any) => (
                  <Select.Option key={task.id} value={task.id} label={task.task_name}>
                    {task.task_name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="member_id">
              <UserSelector
                placeholder="创建人"
                allowClear
                style={{ width: 180 }}
              />
            </Form.Item>
            <Form.Item name="required_product">
              <Select
                placeholder="所需产品"
                allowClear
                showSearch
                style={{ width: 200 }}
                filterOption={(input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                {productOptions.map((option) => (
                  <Select.Option key={option.value} value={option.value} label={option.label}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="date_range">
              <RangePicker 
                placeholder={['创建开始日期', '创建结束日期']}
                style={{ width: 280 }}
              />
            </Form.Item>
          </Form>
          <Button type="primary" onClick={() => searchForm.submit()} icon={<SearchOutlined />}>
            搜索
          </Button>
        </div>
      ) as any}

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

      <Table
        columns={columns}
        dataSource={opportunities}
        loading={isLoading}
        rowKey="id"
        scroll={{ x: 'max-content' }}
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
              description="暂无商机数据"
              showCreateButton={currentRole?.role === 'team_leader'}
              onCreateClick={() => navigate('/opportunities/create')}
              createButtonText="创建商机"
            />
          ),
        }}
      />
    </div>
  )
}

export default OpportunityList
