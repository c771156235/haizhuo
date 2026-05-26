/**
 * 线索列表页面
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Table, Tag, Button, Space, Form, Input, Alert, Select, DatePicker, Dropdown, message, Typography } from 'antd'
import { SearchOutlined, DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons'
import { useQuery } from 'react-query'
import { leadService, Lead } from '../services/lead'
import { taskService } from '../services/task'
import { optionConfigService, OptionConfig } from '../services/optionConfig'
import { exportService } from '../services/export'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import UserSelector from '../components/UserSelector'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'

const { RangePicker } = DatePicker
const { Title } = Typography

interface SearchFormValues {
  search?: string
  task_id?: number
  member_id?: number
  has_opportunity?: boolean
  requirement_direction?: string
  date_range?: [dayjs.Dayjs, dayjs.Dayjs]
}

const LeadList = () => {
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchForm] = Form.useForm<SearchFormValues>()
  
  // 从 URL 参数读取分页和筛选条件
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
  const urlPageSize = searchParams.get('page_size') ? parseInt(searchParams.get('page_size')!, 10) : 10
  const urlSearch = searchParams.get('search') || undefined
  const urlTaskId = searchParams.get('task_id') ? parseInt(searchParams.get('task_id')!, 10) : undefined
  const urlMemberId = searchParams.get('member_id') ? parseInt(searchParams.get('member_id')!, 10) : undefined
  const urlHasOpportunity = searchParams.get('has_opportunity') === 'true' ? true : searchParams.get('has_opportunity') === 'false' ? false : undefined
  const urlRequirementDirection = searchParams.get('requirement_direction') || undefined
  const urlStartDate = searchParams.get('start_date') || undefined
  const urlEndDate = searchParams.get('end_date') || undefined
  
  const [pagination, setPagination] = useState({ page: urlPage, page_size: urlPageSize })
  const [searchKeyword, setSearchKeyword] = useState<string | undefined>(urlSearch)
  const [taskIdFilter, setTaskIdFilter] = useState<number | undefined>(urlTaskId)
  const [memberIdFilter, setMemberIdFilter] = useState<number | undefined>(urlMemberId)
  const [hasOpportunityFilter, setHasOpportunityFilter] = useState<boolean | undefined>(urlHasOpportunity)
  const [requirementDirectionFilter, setRequirementDirectionFilter] = useState<string | undefined>(urlRequirementDirection)
  const [startDate, setStartDate] = useState<string | undefined>(urlStartDate)
  const [endDate, setEndDate] = useState<string | undefined>(urlEndDate)
  
  // 当 URL 参数变化时，更新状态
  useEffect(() => {
    setPagination({ page: urlPage, page_size: urlPageSize })
    setSearchKeyword(urlSearch)
    setTaskIdFilter(urlTaskId)
    setMemberIdFilter(urlMemberId)
    setHasOpportunityFilter(urlHasOpportunity)
    setRequirementDirectionFilter(urlRequirementDirection)
    setStartDate(urlStartDate)
    setEndDate(urlEndDate)
    searchForm.setFieldsValue({
      search: urlSearch,
      task_id: urlTaskId,
      member_id: urlMemberId,
      has_opportunity: urlHasOpportunity,
      requirement_direction: urlRequirementDirection,
      date_range: urlStartDate && urlEndDate ? [dayjs(urlStartDate), dayjs(urlEndDate)] : undefined,
    })
  }, [urlPage, urlPageSize, urlSearch, urlTaskId, urlMemberId, urlHasOpportunity, urlRequirementDirection, urlStartDate, urlEndDate, searchForm])

  // 获取任务列表（用于筛选）
  const { data: tasksData } = useQuery(
    ['tasks', 'all'],
    () => taskService.getTasks({ page_size: 100 }),
    {
      enabled: true,
    }
  )
  const tasks = tasksData?.items || []

  // 获取客户需求方向选项配置
  const { data: requirementDirectionsData } = useQuery(
    ['option-configs', 'requirement_direction'],
    () => optionConfigService.getOptionConfigs('requirement_direction'),
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
  const requirementDirectionOptions = requirementDirectionsData?.items 
    ? flattenOptions(requirementDirectionsData.items)
    : []

  const { data: leadsData, isLoading, error } = useQuery(
    ['leads', pagination.page, pagination.page_size, searchKeyword, taskIdFilter, memberIdFilter, hasOpportunityFilter, requirementDirectionFilter, startDate, endDate],
    () => leadService.getLeads({
      page: pagination.page,
      page_size: pagination.page_size,
      search: searchKeyword,
      task_id: taskIdFilter,
      member_id: memberIdFilter,
      has_opportunity: hasOpportunityFilter,
      requirement_direction: requirementDirectionFilter,
      start_date: startDate,
      end_date: endDate,
    })
  )

  const leads = leadsData?.items || []
  const total = leadsData?.total || 0

  const handleTableChange = (page: number, pageSize: number) => {
    setPagination({ page, page_size: pageSize })
    // 更新 URL 参数以保持分页状态
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', page.toString())
    newParams.set('page_size', pageSize.toString())
    setSearchParams(newParams, { replace: true })
  }

  const handleSearch = (values: SearchFormValues): void => {
    setSearchKeyword(values.search || undefined)
    setTaskIdFilter(values.task_id)
    setMemberIdFilter(values.member_id)
    setHasOpportunityFilter(values.has_opportunity)
    setRequirementDirectionFilter(values.requirement_direction)
    
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
    if (values.task_id) newParams.set('task_id', values.task_id.toString())
    if (values.member_id) newParams.set('member_id', values.member_id.toString())
    if (values.has_opportunity !== undefined) newParams.set('has_opportunity', values.has_opportunity.toString())
    if (values.requirement_direction) newParams.set('requirement_direction', values.requirement_direction)
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
      title: '客户名称',
      dataIndex: 'customer_name',
      key: 'customer_name',
    },
    {
      title: '客户需求方向',
      dataIndex: 'requirement_direction',
      key: 'requirement_direction',
      render: (direction: string) => (
        <Space wrap>
          {direction?.split(', ').map((dir: string, index: number) => (
            <Tag key={index} color="blue">{dir.trim()}</Tag>
          )) || <Tag color="blue">{direction}</Tag>}
        </Space>
      ),
    },
    {
      title: '详细需求描述',
      dataIndex: 'detail_description',
      key: 'detail_description',
      ellipsis: true,
    },
    {
      title: '所属任务',
      key: 'task',
      render: (_: any, record: Lead) => (
        record.task_name ? (
          <Button 
            type="link" 
            style={{ padding: 0 }}
            onClick={() => navigate(`/tasks/${record.task_id}`)}
          >
            {record.task_name}
          </Button>
        ) : (
          <span>任务 #{record.task_id}</span>
        )
      ),
    },
    {
      title: '关联拜访日志',
      key: 'visit_log',
      render: (_: any, record: Lead) => (
        record.visit_log_id ? (
          <Button 
            type="link" 
            style={{ padding: 0 }}
            onClick={() => navigate(`/visit-logs/${record.visit_log_id}`)}
          >
            查看拜访日志 #{record.visit_log_id}
          </Button>
        ) : (
          <span>-</span>
        )
      ),
    },
    {
      title: '商机状态',
      key: 'opportunity_status',
      render: (_: any, record: Lead) => (
        record.has_opportunity ? (
          <Space>
            <Tag color="success">已转换</Tag>
            {record.opportunity_id && (
              <Button
                type="link"
                style={{ padding: 0 }}
                onClick={() => navigate(`/opportunities/${record.opportunity_id}`)}
              >
                查看商机
              </Button>
            )}
          </Space>
        ) : (
          <Tag>未转换</Tag>
        )
      ),
    },
    {
      title: '创建人',
      key: 'member',
      render: (_: any, record: Lead) => (
        record.member_name || record.member_username || `用户 #${record.member_id}`
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Lead) => (
        <Space>
          <Button 
            type="link" 
            onClick={() => {
              // 将当前分页信息作为查询参数传递
              const params = new URLSearchParams(searchParams)
              navigate(`/leads/${record.id}?${params.toString()}`)
            }}
          >
            查看详情
          </Button>
          {(currentRole?.role === 'member' || currentRole?.role === 'team_leader') && (
            <Button type="link" onClick={() => navigate(`/leads/${record.id}/edit`)}>
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
        <Title level={3} style={{ margin: 0 }}>线索管理</Title>
        <Space>
          <div style={{ fontSize: '14px', color: '#8c8c8c' }}>
            提示：线索需要从有客户需求的拜访日志创建
          </div>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'excel',
                  label: '导出Excel',
                  icon: <FileExcelOutlined />,
                  onClick: async () => {
                    try {
                      await exportService.exportLeadsExcel()
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
                      await exportService.exportLeadsPdf()
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
                placeholder="搜索客户名称" 
                allowClear 
                prefix={<SearchOutlined />}
                style={{ width: 250 }} 
              />
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
            <Form.Item name="has_opportunity">
              <Select
                placeholder="商机状态"
                allowClear
                style={{ width: 150 }}
              >
                <Select.Option value={true}>已转换</Select.Option>
                <Select.Option value={false}>未转换</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="requirement_direction">
              <Select
                placeholder="客户需求方向"
                allowClear
                showSearch
                style={{ width: 200 }}
                filterOption={(input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                {requirementDirectionOptions.map((option) => (
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
        dataSource={leads}
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
              description="暂无线索"
              showCreateButton={false}
            />
          ),
        }}
      />
    </div>
  )
}

export default LeadList

