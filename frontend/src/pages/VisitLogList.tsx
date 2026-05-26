/**
 * 线索维护列表页面
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Table, Tag, Button, Space, Form, Select, Input, Alert, Dropdown, message, DatePicker, Typography, Tabs } from 'antd'
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery } from 'react-query'
import { visitLogService, VisitLog } from '../services/visitLog'
import {
  VISIT_LOG_DECISION_AUTHORITY_OPTIONS,
  formatRequirementScenarioCategoryDisplay,
} from '../constants/visitLog'
import { taskService } from '../services/task'
import { exportService } from '../services/export'
import { useAuth } from '../contexts/AuthContext'
import UserSelector from '../components/UserSelector'
import EmptyState from '../components/EmptyState'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'

const { RangePicker } = DatePicker
const { Title } = Typography
type ClueTabKey = 'with_clue' | 'without_clue'

const VisitLogList = () => {
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchForm] = Form.useForm<{
    work_order_no?: string
    task_id?: number
    member_id?: number
    has_requirement_scenario_sorted?: boolean
    has_decision_authority?: string
    date_range?: [dayjs.Dayjs, dayjs.Dayjs]
  }>()
  
  // 从 URL 参数读取分页和筛选条件
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
  const urlPageSize = searchParams.get('page_size') ? parseInt(searchParams.get('page_size')!, 10) : 10
  const urlWorkOrderNo = searchParams.get('work_order_no') || undefined
  const urlTaskId = searchParams.get('task_id') ? parseInt(searchParams.get('task_id')!, 10) : undefined
  const urlMemberId = searchParams.get('member_id') ? parseInt(searchParams.get('member_id')!, 10) : undefined
  const urlHasClue = searchParams.get('has_clue') === 'true' ? true : searchParams.get('has_clue') === 'false' ? false : undefined
  const urlClueTabRaw = searchParams.get('clue_tab')
  const urlClueTab: ClueTabKey | undefined =
    urlClueTabRaw === 'with_clue' || urlClueTabRaw === 'without_clue'
      ? urlClueTabRaw
      : undefined
  const urlHasRequirementScenarioSorted =
    searchParams.get('has_requirement_scenario_sorted') === 'true'
      ? true
      : searchParams.get('has_requirement_scenario_sorted') === 'false'
        ? false
        : undefined
  const daParam = searchParams.get('has_decision_authority')
  const urlHasDecisionAuthority =
    daParam &&
    (VISIT_LOG_DECISION_AUTHORITY_OPTIONS as readonly string[]).includes(daParam)
      ? daParam
      : undefined
  const urlStartDate = searchParams.get('start_date') || undefined
  const urlEndDate = searchParams.get('end_date') || undefined
  
  const [activeClueTab, setActiveClueTab] = useState<ClueTabKey>(
    urlClueTab ?? (urlHasClue === false ? 'without_clue' : 'with_clue')
  )
  const [pagination, setPagination] = useState({ page: urlPage, page_size: urlPageSize })
  const [workOrderNoFilter, setWorkOrderNoFilter] = useState<string | undefined>(urlWorkOrderNo)
  const [taskIdFilter, setTaskIdFilter] = useState<number | undefined>(urlTaskId)
  const [memberIdFilter, setMemberIdFilter] = useState<number | undefined>(urlMemberId)
  const [hasClueFilter, setHasClueFilter] = useState<boolean>(urlHasClue === false ? false : true)
  const [hasRequirementScenarioSortedFilter, setHasRequirementScenarioSortedFilter] =
    useState<boolean | undefined>(urlHasRequirementScenarioSorted)
  const [hasDecisionAuthorityFilter, setHasDecisionAuthorityFilter] = useState<
    string | undefined
  >(urlHasDecisionAuthority)
  const [startDate, setStartDate] = useState<string | undefined>(urlStartDate)
  const [endDate, setEndDate] = useState<string | undefined>(urlEndDate)
  
  // 当 URL 参数变化时，更新状态
  useEffect(() => {
    const nextTab = urlClueTab ?? (urlHasClue === false ? 'without_clue' : 'with_clue')
    const nextHasClue = nextTab === 'with_clue'
    setActiveClueTab(nextTab)
    setPagination({ page: urlPage, page_size: urlPageSize })
    setWorkOrderNoFilter(urlWorkOrderNo)
    setTaskIdFilter(urlTaskId)
    setMemberIdFilter(urlMemberId)
    setHasClueFilter(nextHasClue)
    setHasRequirementScenarioSortedFilter(urlHasRequirementScenarioSorted)
    setHasDecisionAuthorityFilter(urlHasDecisionAuthority)
    setStartDate(urlStartDate)
    setEndDate(urlEndDate)
    // 同步表单值
    searchForm.setFieldsValue({
      work_order_no: urlWorkOrderNo,
      task_id: urlTaskId,
      member_id: urlMemberId,
      has_requirement_scenario_sorted: urlHasRequirementScenarioSorted,
      has_decision_authority: urlHasDecisionAuthority,
      date_range: urlStartDate && urlEndDate ? [dayjs(urlStartDate), dayjs(urlEndDate)] : undefined,
    })
  }, [urlPage, urlPageSize, urlWorkOrderNo, urlTaskId, urlMemberId, urlHasClue, urlClueTab, urlHasRequirementScenarioSorted, urlHasDecisionAuthority, urlStartDate, urlEndDate, searchForm])

  // 获取任务列表（用于筛选）
  const { data: tasksData } = useQuery(
    ['tasks', 'all'],
    () => taskService.getTasks({ page_size: 100 }),
    {
      enabled: true,
    }
  )
  const tasks = tasksData?.items || []

  const { data: visitLogsData, isLoading, error } = useQuery(
    ['visitLogs', pagination.page, pagination.page_size, workOrderNoFilter, taskIdFilter, memberIdFilter, hasClueFilter, hasRequirementScenarioSortedFilter, hasDecisionAuthorityFilter, startDate, endDate],
    () => visitLogService.getVisitLogs({
      page: pagination.page,
      page_size: pagination.page_size,
      work_order_no: workOrderNoFilter,
      task_id: taskIdFilter,
      member_id: memberIdFilter,
      has_clue: hasClueFilter,
      has_requirement_scenario_sorted: hasRequirementScenarioSortedFilter,
      has_decision_authority: hasDecisionAuthorityFilter,
      start_date: startDate,
      end_date: endDate,
    })
  )

  const { data: withClueCountData } = useQuery(
    [
      'visitLogsCount',
      'with_clue',
      workOrderNoFilter,
      taskIdFilter,
      memberIdFilter,
      hasRequirementScenarioSortedFilter,
      hasDecisionAuthorityFilter,
      startDate,
      endDate,
    ],
    () =>
      visitLogService.getVisitLogs({
        page: 1,
        page_size: 1,
        work_order_no: workOrderNoFilter,
        task_id: taskIdFilter,
        member_id: memberIdFilter,
        has_clue: true,
        has_requirement_scenario_sorted: hasRequirementScenarioSortedFilter,
        has_decision_authority: hasDecisionAuthorityFilter,
        start_date: startDate,
        end_date: endDate,
      })
  )

  const { data: withoutClueCountData } = useQuery(
    [
      'visitLogsCount',
      'without_clue',
      workOrderNoFilter,
      taskIdFilter,
      memberIdFilter,
      hasRequirementScenarioSortedFilter,
      hasDecisionAuthorityFilter,
      startDate,
      endDate,
    ],
    () =>
      visitLogService.getVisitLogs({
        page: 1,
        page_size: 1,
        work_order_no: workOrderNoFilter,
        task_id: taskIdFilter,
        member_id: memberIdFilter,
        has_clue: false,
        has_requirement_scenario_sorted: hasRequirementScenarioSortedFilter,
        has_decision_authority: hasDecisionAuthorityFilter,
        start_date: startDate,
        end_date: endDate,
      })
  )

  const visitLogs = visitLogsData?.items || []
  const total = visitLogsData?.total || 0
  const withClueTotal = withClueCountData?.total ?? 0
  const withoutClueTotal = withoutClueCountData?.total ?? 0

  const handleTableChange = (page: number, pageSize: number) => {
    setPagination({ page, page_size: pageSize })
    // 更新 URL 参数以保持分页状态
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', page.toString())
    newParams.set('page_size', pageSize.toString())
    setSearchParams(newParams, { replace: true })
  }

  const handleSearch = (values: {
    work_order_no?: string
    task_id?: number
    member_id?: number
    has_requirement_scenario_sorted?: boolean
    has_decision_authority?: string
    date_range?: [dayjs.Dayjs, dayjs.Dayjs]
  }): void => {
    setWorkOrderNoFilter(values.work_order_no?.trim() || undefined)
    setTaskIdFilter(values.task_id)
    setMemberIdFilter(values.member_id)
    setHasRequirementScenarioSortedFilter(values.has_requirement_scenario_sorted)
    setHasDecisionAuthorityFilter(values.has_decision_authority)
    
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
    if (values.work_order_no) newParams.set('work_order_no', values.work_order_no.trim())
    if (values.task_id) newParams.set('task_id', values.task_id.toString())
    if (values.member_id) newParams.set('member_id', values.member_id.toString())
    newParams.set('clue_tab', activeClueTab)
    newParams.set('has_clue', (activeClueTab === 'with_clue').toString())
    if (values.has_requirement_scenario_sorted !== undefined) newParams.set('has_requirement_scenario_sorted', values.has_requirement_scenario_sorted.toString())
    if (values.has_decision_authority !== undefined) {
      newParams.set('has_decision_authority', values.has_decision_authority)
    }
    if (values.date_range && values.date_range.length === 2) {
      newParams.set('start_date', values.date_range[0].format('YYYY-MM-DD'))
      newParams.set('end_date', values.date_range[1].format('YYYY-MM-DD'))
    }
    newParams.set('page', '1')
    newParams.set('page_size', pagination.page_size.toString())
    setSearchParams(newParams, { replace: true })
  }

  const handleTabChange = (key: string) => {
    const nextTab: ClueTabKey = key === 'without_clue' ? 'without_clue' : 'with_clue'
    setActiveClueTab(nextTab)
    const nextHasClue = nextTab === 'with_clue'
    setHasClueFilter(nextHasClue)
    setPagination({ page: 1, page_size: pagination.page_size })

    const newParams = new URLSearchParams(searchParams)
    newParams.set('clue_tab', nextTab)
    newParams.set('has_clue', nextHasClue.toString())
    newParams.set('page', '1')
    newParams.set('page_size', pagination.page_size.toString())
    setSearchParams(newParams, { replace: true })
  }

  const columns = [
    {
      title: '工单编号',
      key: 'work_order',
      width: 180,
      render: (_: any, record: VisitLog) => (
        record.work_order_no ? (
          <Button 
            type="link" 
            style={{ padding: 0 }}
            onClick={() => navigate(`/work-orders/${record.work_order_id}`)}
          >
            {record.work_order_no}
          </Button>
        ) : (
          <span>工单 #{record.work_order_id}</span>
        )
      ),
    },
    {
      title: '拜访日期',
      dataIndex: 'visit_date',
      key: 'visit_date',
      width: 120,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: '客户单位',
      dataIndex: 'work_order_customer_unit',
      key: 'work_order_customer_unit',
      width: 200,
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: '所属销售单位',
      key: 'sales_unit',
      width: 160,
      ellipsis: true,
      render: (_: unknown, record: VisitLog) =>
        record.sales_unit || record.work_order_task_sales_unit || '-',
    },
    {
      title: '是否有线索',
      dataIndex: 'has_clue',
      key: 'has_clue',
      width: 120,
      render: (has: boolean | undefined) => (
        <Tag color={has ? 'green' : 'default'}>{has ? '是' : '否'}</Tag>
      ),
    },
    {
      title: '是否梳理过需求场景',
      dataIndex: 'has_requirement_scenario_sorted',
      key: 'has_requirement_scenario_sorted',
      width: 160,
      render: (has: boolean | undefined) => (
        <Tag color={has ? 'green' : 'default'}>{has ? '是' : '否'}</Tag>
      ),
    },
    {
      title: '需求场景分类',
      dataIndex: 'requirement_scenario_category',
      key: 'requirement_scenario_category',
      width: 260,
      ellipsis: true,
      render: (v: string | null | undefined) => formatRequirementScenarioCategoryDisplay(v),
    },
    {
      title: '拜访对象权限',
      dataIndex: 'has_decision_authority',
      key: 'has_decision_authority',
      width: 150,
      render: (v: string | boolean | null | undefined) => {
        if (v === undefined) return '-'
        if (v === true) return <Tag color="green">决策权</Tag>
        if (v === false) return <Tag>无</Tag>
        const s = String(v ?? '').trim()
        if (!s) return '-'
        const color =
          s === '无' ? 'default' : s === '建议权' ? 'blue' : 'green'
        return <Tag color={color}>{s}</Tag>
      },
    },
    {
      title: '创建人',
      key: 'creator',
      width: 120,
      render: (_: any, record: VisitLog) => (
        record.member_name || record.member_username || `用户${record.member_id}` || '-'
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: currentRole?.role === 'member' ? 168 : 100,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: any, record: VisitLog) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            style={{ padding: 0 }}
            onClick={() => {
              const params = new URLSearchParams(searchParams)
              navigate(`/visit-logs/${record.id}?${params.toString()}`)
            }}
          >
            查看详情
          </Button>
          {currentRole?.role === 'member' && (
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={() => navigate(`/visit-logs/${record.id}/edit`)}
            >
              更新
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>线索维护</Title>
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
                      await exportService.exportVisitLogsExcel()
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
                      await exportService.exportVisitLogsPdf()
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
            <Form.Item name="work_order_no">
              <Input 
                placeholder="工单编号" 
                allowClear 
                prefix={<SearchOutlined />}
                style={{ width: 200 }}
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
            <Form.Item name="has_requirement_scenario_sorted">
              <Select placeholder="是否梳理过需求场景" allowClear style={{ width: 180 }}>
                <Select.Option value={true}>是</Select.Option>
                <Select.Option value={false}>否</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="has_decision_authority">
              <Select placeholder="拜访对象权限" allowClear style={{ width: 150 }}>
                {VISIT_LOG_DECISION_AUTHORITY_OPTIONS.map((opt) => (
                  <Select.Option key={opt} value={opt}>
                    {opt}
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

      <Tabs
        activeKey={activeClueTab}
        onChange={handleTabChange}
        items={[
          { key: 'with_clue', label: `有线索 (${withClueTotal})` },
          { key: 'without_clue', label: `无线索 (${withoutClueTotal})` },
        ]}
        style={{ marginBottom: 12 }}
      />

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
        dataSource={visitLogs}
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
            <EmptyState description="暂无线索维护记录" />
          ),
        }}
      />
    </div>
  )
}

export default VisitLogList
