/**
 * 工单列表页面
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Table, Tag, Button, Space, message, Modal, Form, Input, Select, Alert, Dropdown, DatePicker, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { SearchOutlined, DownloadOutlined, FileExcelOutlined, FilePdfOutlined, SettingOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { workOrderService, WorkOrder } from '../services/workOrder'
import { taskService } from '../services/task'
import { exportService } from '../services/export'
import { useAuth } from '../contexts/AuthContext'
import { UserRole } from '../types/user'
import { WorkOrderStatus, WorkOrderStatusLabels } from '../types/workOrder'
import UserSelector from '../components/UserSelector'
import WorkOrderIntraGroupMemberSelect from '../components/WorkOrderIntraGroupMemberSelect'
import GroupMemberSelector from '../components/GroupMemberSelector'
import EmptyState from '../components/EmptyState'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'
import { getWorkOrderStatusDisplay } from '../utils/workOrderStatusDisplay'

const { RangePicker } = DatePicker
const { Title } = Typography

/** 状态筛选项（不含已废弃的 pending，避免下拉出现两个「待接单」） */
const WORK_ORDER_STATUS_FILTER_VALUES = [
  WorkOrderStatus.PENDING_GROUP_CLAIM,
  WorkOrderStatus.PENDING_ASSIGN,
  WorkOrderStatus.PENDING_ACCEPT,
  WorkOrderStatus.ACCEPTED,
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CANCELLED,
] as const

const WorkOrderList = () => {
  const { user, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [transferModalVisible, setTransferModalVisible] = useState(false)
  const [cancelModalVisible, setCancelModalVisible] = useState(false)
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null)
  const [assignForm] = Form.useForm()
  const [transferForm] = Form.useForm()
  const [cancelForm] = Form.useForm()
  const [searchForm] = Form.useForm<{
    search?: string
    status?: string
    task_id?: number
    team_leader_id?: number
    member_id?: number
    date_range?: [dayjs.Dayjs, dayjs.Dayjs]
  }>()
  
  // 从 URL 参数读取分页与筛选条件
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
  const urlPageSize = searchParams.get('page_size') ? parseInt(searchParams.get('page_size')!, 10) : 10
  const urlSearch = searchParams.get('search') || ''
  const urlStatus = searchParams.get('status') || undefined
  const urlTaskId = searchParams.get('task_id') ? parseInt(searchParams.get('task_id')!, 10) : undefined
  const urlTeamLeaderId = searchParams.get('team_leader_id') ? parseInt(searchParams.get('team_leader_id')!, 10) : undefined
  const urlMemberId = searchParams.get('member_id') ? parseInt(searchParams.get('member_id')!, 10) : undefined
  const urlStartDate = searchParams.get('start_date') || undefined
  const urlEndDate = searchParams.get('end_date') || undefined
  
  const [pagination, setPagination] = useState({ page: urlPage, page_size: urlPageSize })
  const [searchText, setSearchText] = useState(urlSearch)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(urlStatus)
  const [taskIdFilter, setTaskIdFilter] = useState<number | undefined>(urlTaskId)
  const [teamLeaderIdFilter, setTeamLeaderIdFilter] = useState<number | undefined>(urlTeamLeaderId)
  const [memberIdFilter, setMemberIdFilter] = useState<number | undefined>(urlMemberId)
  const [startDate, setStartDate] = useState<string | undefined>(urlStartDate)
  const [endDate, setEndDate] = useState<string | undefined>(urlEndDate)
  
  // 当 URL 参数变化时，更新状态
  useEffect(() => {
    setPagination({ page: urlPage, page_size: urlPageSize })
    setSearchText(urlSearch)
    setStatusFilter(urlStatus)
    setTaskIdFilter(urlTaskId)
    setTeamLeaderIdFilter(urlTeamLeaderId)
    setMemberIdFilter(urlMemberId)
    setStartDate(urlStartDate)
    setEndDate(urlEndDate)
    // 与地址栏一致（含从带参链接进入后清空部分筛选）
    searchForm.setFieldsValue({
      search: urlSearch || undefined,
      status: urlStatus,
      task_id: urlTaskId,
      team_leader_id: urlTeamLeaderId,
      member_id: urlMemberId,
      date_range: urlStartDate && urlEndDate ? [dayjs(urlStartDate), dayjs(urlEndDate)] : undefined,
    })
  }, [urlPage, urlPageSize, urlSearch, urlStatus, urlTaskId, urlTeamLeaderId, urlMemberId, urlStartDate, urlEndDate, searchForm])

  // 获取任务列表（用于筛选）
  const { data: tasksData } = useQuery(
    ['tasks', 'all'],
    () => taskService.getTasks({ page_size: 100 }),
    {
      enabled: true,
    }
  )
  const tasks = tasksData?.items || []

  const { data: workOrdersData, isLoading, error } = useQuery(
    ['workOrders', pagination.page, pagination.page_size, searchText, statusFilter, taskIdFilter, teamLeaderIdFilter, memberIdFilter, startDate, endDate],
    () => workOrderService.getWorkOrders({
      page: pagination.page,
      page_size: pagination.page_size,
      search: searchText || undefined,
      status: statusFilter,
      task_id: taskIdFilter,
      team_leader_id: teamLeaderIdFilter,
      member_id: memberIdFilter,
      start_date: startDate,
      end_date: endDate,
    })
  )

  const workOrders = workOrdersData?.items || []
  const total = workOrdersData?.total || 0

  const claimMutation = useMutation(
    (id: number) => workOrderService.claimWorkOrder(id),
    {
      onSuccess: () => {
        message.success('认领成功')
        queryClient.refetchQueries(['workOrders', pagination.page, pagination.page_size, searchText, statusFilter, taskIdFilter, teamLeaderIdFilter, memberIdFilter, startDate, endDate])
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '认领失败'))
      },
    }
  )

  const assignMutation = useMutation(
    ({ id, member_id }: { id: number; member_id: number }) =>
      workOrderService.assignWorkOrder(id, { member_id }),
    {
      onSuccess: () => {
        message.success('转派成功')
        setAssignModalVisible(false)
        assignForm.resetFields()
        setSelectedWorkOrder(null)
        // 使用 refetchQueries 保持当前分页状态，而不是 invalidateQueries
        queryClient.refetchQueries(['workOrders', pagination.page, pagination.page_size, searchText, statusFilter, taskIdFilter, teamLeaderIdFilter, memberIdFilter, startDate, endDate])
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '转派失败'))
      },
    }
  )

  const acceptMutation = useMutation(
    (id: number) => workOrderService.acceptWorkOrder(id),
    {
      onSuccess: () => {
        message.success('接单成功')
        // 使用 refetchQueries 保持当前分页状态
        queryClient.refetchQueries(['workOrders', pagination.page, pagination.page_size, searchText, statusFilter, taskIdFilter, teamLeaderIdFilter, memberIdFilter, startDate, endDate])
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '接单失败'))
      },
    }
  )

  const cancelMutation = useMutation(
    ({ id, data }: { id: number; data: { cancellation_reason?: string } }) =>
      workOrderService.cancelWorkOrder(id, data),
    {
      onSuccess: () => {
        message.success('工单已取消')
        setCancelModalVisible(false)
        cancelForm.resetFields()
        setSelectedWorkOrder(null)
        // 使用 refetchQueries 保持当前分页状态
        queryClient.refetchQueries(['workOrders', pagination.page, pagination.page_size, searchText, statusFilter, taskIdFilter, teamLeaderIdFilter, memberIdFilter, startDate, endDate])
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '取消工单失败'))
      },
    }
  )

  const transferMutation = useMutation(
    ({ id, data }: { id: number; data: { target_type: 'member' | 'team_leader'; target_user_id: number; reason?: string } }) =>
      workOrderService.transferWorkOrder(id, data),
    {
      onSuccess: () => {
        message.success('转单成功')
        setTransferModalVisible(false)
        transferForm.resetFields()
        setSelectedWorkOrder(null)
        queryClient.refetchQueries(['workOrders', pagination.page, pagination.page_size, searchText, statusFilter, taskIdFilter, teamLeaderIdFilter, memberIdFilter, startDate, endDate])
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '转单失败'))
      },
    }
  )

  const handleClaim = (id: number) => {
    claimMutation.mutate(id)
  }

  const handleAssign = (record: WorkOrder) => {
    setSelectedWorkOrder(record)
    setAssignModalVisible(true)
  }

  const handleAccept = (id: number) => {
    acceptMutation.mutate(id)
  }

  const handleVisitComplete = (record: WorkOrder) => {
    const params = new URLSearchParams(searchParams)
    navigate(`/visit-logs/create?work_order_id=${record.id}`, {
      state: { returnUrl: `/work-orders?${params.toString()}` },
    })
  }

  const handleCancel = (record: WorkOrder) => {
    setSelectedWorkOrder(record)
    setCancelModalVisible(true)
    cancelForm.resetFields()
  }

  const handleTransfer = (record: WorkOrder) => {
    setSelectedWorkOrder(record)
    setTransferModalVisible(true)
    transferForm.setFieldsValue({
      target_type: 'member',
      target_user_id: undefined,
      reason: '',
    })
  }

  const revokeMutation = useMutation(
    (id: number) => workOrderService.revokeWorkOrder(id),
    {
      onSuccess: () => {
        message.success('撤回成功')
        queryClient.refetchQueries(['workOrders', pagination.page, pagination.page_size, searchText, statusFilter, taskIdFilter, teamLeaderIdFilter, memberIdFilter, startDate, endDate])
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '撤回失败'))
      },
    }
  )

  const handleRevoke = (record: WorkOrder) => {
    Modal.confirm({
      title: '确认撤回工单',
      content: (
        <div>
          <p>确定要撤回此工单的转派吗？撤回后：</p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li>工单将重置为「待转派」状态</li>
            <li>成员关系将被清空</li>
            <li>原成员将收到撤回通知</li>
            {record.status === 'accepted' && (
              <li style={{ color: '#ff4d4f' }}>
                <strong>注意：</strong>成员已接单，撤回后将清空接单记录
              </li>
            )}
          </ul>
        </div>
      ),
      okText: '确认撤回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        revokeMutation.mutate(record.id)
      },
    })
  }

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
    team_leader_id?: number
    member_id?: number
    date_range?: [dayjs.Dayjs, dayjs.Dayjs]
  }): void => {
    setSearchText(values.search || '')
    setStatusFilter(values.status)
    setTaskIdFilter(values.task_id)
    setTeamLeaderIdFilter(values.team_leader_id)
    setMemberIdFilter(values.member_id)
    
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
    if (values.team_leader_id) newParams.set('team_leader_id', values.team_leader_id.toString())
    if (values.member_id) newParams.set('member_id', values.member_id.toString())
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
      title: '工单编号',
      dataIndex: 'work_order_no',
      key: 'work_order_no',
      width: 220,
      ellipsis: true,
    },
    {
      title: '任务名称',
      key: 'task_name',
      width: 140,
      ellipsis: true,
      render: (_: any, record: WorkOrder) => (
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
      title: '客户名称',
      key: 'customer_unit',
      width: 200,
      ellipsis: true,
      render: (_: any, record: WorkOrder) => (
        record.customer_unit || '-'
      ),
    },
    {
      title: '客户来源',
      key: 'customer_source',
      width: 160,
      ellipsis: true,
      render: (_: any, record: WorkOrder) => (
        record.customer_source || '-'
      ),
    },
    {
      title: '发起部门',
      key: 'sales_unit',
      width: 180,
      ellipsis: true,
      render: (_: any, record: WorkOrder) => {
        // 去除「销售单位 -」前缀的辅助函数
        const removeSalesUnitPrefix = (unit: string): string => {
          if (!unit) return unit
          // 去除“销售单位”前缀（含中英文冒号/连字符）
          return unit.replace(/^销售单位\s*[-:：]?\s*/i, '').trim()
        }
        
        // 优先显示提交人所属的销售单位
        if (record.sales_contact_unit) {
          const displayUnit = removeSalesUnitPrefix(record.sales_contact_unit)
          return <Tag>{displayUnit}</Tag>
        }
        // 若无提交人销售单位，则回退到任务的销售单位（兼容旧数据）
        if (record.task_sales_unit) {
          const units = record.task_sales_unit.split(',').map((unit: string) => {
            const trimmed = unit.trim()
            return removeSalesUnitPrefix(trimmed)
          }).filter(Boolean)
          return (
            <Space wrap>
              {units.map((unit: string, index: number) => (
                <Tag key={index}>{unit}</Tag>
              ))}
            </Space>
          )
        }
        return '-'
      },
    },
    {
      title: '组长',
      key: 'team_leader',
      width: 120,
      ellipsis: true,
      render: (_: any, record: WorkOrder) => {
        if (record.team_leader_name) return record.team_leader_name
        if (record.team_leader_id) return `用户 #${record.team_leader_id}`
        return <span style={{ color: '#8c8c8c' }}>待认领</span>
      },
    },
    {
      title: '成员',
      key: 'member',
      width: 120,
      ellipsis: true,
      render: (_: any, record: WorkOrder) => (
        record.member_name || (record.member_id ? `用户 #${record.member_id}` : '-')
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const { label, color } = getWorkOrderStatusDisplay(status)
        return <Tag color={color}>{label}</Tag>
      },
    },
    {
      title: '拜访时间',
      dataIndex: 'expected_visit_time',
      key: 'expected_visit_time',
      width: 160,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: any, record: WorkOrder) => {
        const canClaim =
          currentRole?.role === 'team_leader' && record.status === 'pending_group_claim'

        // 是否可转派：组长角色，状态为待转派，member_id 为空，且 team_leader_id 为当前用户
        const canAssign = 
          currentRole?.role === 'team_leader' && 
          record.status === 'pending_assign' && 
          !record.member_id &&
          record.team_leader_id === user?.id

        // 是否可接单：成员角色，状态为待接单，且 member_id 为当前用户
        const canAccept = 
          currentRole?.role === 'member' && 
          record.status === 'pending_accept' && 
          record.member_id === user?.id

        // 拜访完成：成员 + 已接单（跳转添加拜访日志，提交后后端置为已拜访）
        const canVisitComplete =
          currentRole?.role === 'member' &&
          record.status === 'accepted' &&
          record.member_id === user?.id

        const canTransfer =
          currentRole?.role === 'member' &&
          record.status === 'accepted' &&
          record.member_id === user?.id

        // 是否可撤回：组长角色，状态为待接单或已接单，且有成员，且 team_leader_id 为当前用户
        const canRevoke = 
          currentRole?.role === 'team_leader' &&
          (record.status === 'pending_accept' || record.status === 'accepted') &&
          record.team_leader_id === user?.id &&
          record.member_id

        // 是否可取消：组长或成员
        const canCancel = 
          record.status !== 'cancelled' &&
          record.status !== 'completed' &&
          ((currentRole?.role === 'team_leader' && 
            (record.status === 'pending_group_claim' ||
              ((record.status === 'pending_assign' || record.status === 'pending_accept') &&
                record.team_leader_id === user?.id))) ||
           (currentRole?.role === 'member' &&
            (record.status === 'pending_accept' || record.status === 'accepted' || record.status === 'in_progress') &&
            record.member_id === user?.id))

        // 构建菜单项
        const menuItems: MenuProps['items'] = [
          {
            key: 'view',
            label: '查看详情',
            onClick: () => {
              // 将当前分页信息作为查询参数传递
              const params = new URLSearchParams(searchParams)
              navigate(`/work-orders/${record.id}?${params.toString()}`)
            },
          },
        ]

        // 认领 / 转派：组长可见
        if (currentRole?.role === 'team_leader') {
          menuItems.push({
            key: 'claim',
            label: '认领',
            disabled: !canClaim,
            onClick: () => canClaim && handleClaim(record.id),
          } as NonNullable<MenuProps['items']>[number])
          menuItems.push({
            key: 'assign',
            label: '转派',
            disabled: !canAssign,
            onClick: () => canAssign && handleAssign(record),
          } as NonNullable<MenuProps['items']>[number])
        }

        // 撤回按钮：组长可见
        if (currentRole?.role === 'team_leader') {
          menuItems.push({
            key: 'revoke',
            label: '撤回',
            disabled: !canRevoke,
            danger: true,
            onClick: () => canRevoke && handleRevoke(record),
          } as NonNullable<MenuProps['items']>[number])
        }

        // 接单按钮：成员可见
        if (currentRole?.role === 'member') {
          menuItems.push({
            key: 'accept',
            label: '接单',
            disabled: !canAccept,
            onClick: () => canAccept && handleAccept(record.id),
          } as NonNullable<MenuProps['items']>[number])
        }

        if (currentRole?.role === 'member') {
          menuItems.push({
            key: 'transfer',
            label: '转单',
            disabled: !canTransfer,
            onClick: () => canTransfer && handleTransfer(record),
          } as NonNullable<MenuProps['items']>[number])
        }

        if (canVisitComplete) {
          menuItems.push({
            key: 'visit-complete',
            label: '拜访完成',
            disabled: false,
            onClick: () => handleVisitComplete(record),
          } as NonNullable<MenuProps['items']>[number])
        }

        // 取消按钮：成员与组长可见
        if (currentRole?.role === 'member' || currentRole?.role === 'team_leader') {
          menuItems.push({
            key: 'cancel',
            label: '取消',
            disabled: !canCancel,
            danger: true,
            onClick: () => canCancel && handleCancel(record),
          } as NonNullable<MenuProps['items']>[number])
        }

        return (
          <Dropdown
            menu={{ items: menuItems }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button type="text" icon={<SettingOutlined />} />
          </Dropdown>
        )
      },
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>工单管理</Title>
        <Dropdown
          menu={{
            items: [
              {
                key: 'excel',
                label: '导出 Excel',
                icon: <FileExcelOutlined />,
                onClick: async () => {
                  try {
                    await exportService.exportWorkOrdersExcel()
                    message.success('导出成功')
                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : '导出失败'
                    message.error(errorMessage)
                  }
                },
              },
              {
                key: 'pdf',
                label: '导出 PDF',
                icon: <FilePdfOutlined />,
                onClick: async () => {
                  try {
                    await exportService.exportWorkOrdersPdf()
                    message.success('导出成功')
                  } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : '导出失败'
                    message.error(errorMessage)
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
      </div>

      {/* 搜索与筛选*/}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Form
          form={searchForm}
          layout="inline"
          onFinish={handleSearch}
          style={{ flex: 1 }}
        >
          <Form.Item name="search">
            <Input
              placeholder="搜索工单编号"
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 250 }}
            />
          </Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态筛选" allowClear style={{ width: 150 }}>
              {WORK_ORDER_STATUS_FILTER_VALUES.map((value) => (
                <Select.Option key={value} value={value}>
                  {WorkOrderStatusLabels[value]}
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
          <Form.Item name="team_leader_id">
            <UserSelector
              role={UserRole.TEAM_LEADER}
              placeholder="组长"
              allowClear
              style={{ width: 180 }}
            />
          </Form.Item>
          <Form.Item name="member_id">
            <UserSelector
              placeholder="成员"
              allowClear
              style={{ width: 180 }}
            />
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

      {!!error && (
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
        dataSource={workOrders}
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
          emptyText: <EmptyState description="暂无工单数据" />,
        }}
      />

      {/* 转派弹窗 */}
      <Modal
        title="转派工单给成员"
        open={assignModalVisible}
        onCancel={() => {
          setAssignModalVisible(false)
          assignForm.resetFields()
          setSelectedWorkOrder(null)
        }}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMutation.isLoading}
      >
        <Form
          form={assignForm}
          onFinish={(values) => {
            if (selectedWorkOrder) {
              assignMutation.mutate({ id: selectedWorkOrder.id, member_id: values.member_id })
            }
          }}
          layout="vertical"
        >
          <Form.Item
            name="member_id"
            label="选择成员"
            rules={[{ required: true, message: '请选择成员' }]}
          >
            {currentRole?.role === 'team_leader' ? (
              <GroupMemberSelector placeholder="请选择组内成员" />
            ) : (
              <UserSelector 
                role={UserRole.MEMBER} 
                placeholder="请选择成员" 
              />
            )}
          </Form.Item>
        </Form>
      </Modal>

      {/* 取消工单弹窗 */}
      <Modal
        title="取消工单"
        open={cancelModalVisible}
        onCancel={() => {
          setCancelModalVisible(false)
          cancelForm.resetFields()
          setSelectedWorkOrder(null)
        }}
        onOk={() => cancelForm.submit()}
        confirmLoading={cancelMutation.isLoading}
        okText="确认取消"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Form
          form={cancelForm}
          onFinish={(values) => {
            if (selectedWorkOrder) {
              cancelMutation.mutate({
                id: selectedWorkOrder.id,
                data: {
                  cancellation_reason: values.cancellation_reason || undefined,
                },
              })
            }
          }}
          layout="vertical"
        >
          <Form.Item
            name="cancellation_reason"
            label="取消原因（可选）"
            help="填写取消原因有助于追溯和分析，建议填写"
          >
            <Input.TextArea
              rows={4}
              placeholder="请输入取消原因，例如：客户需求变更、时间冲突等"
              maxLength={500}
              showCount
            />
          </Form.Item>
          <div style={{ color: '#ff4d4f', marginTop: 8 }}>
            <strong>注意：</strong>取消后的工单无法继续操作，请确认后再提交。
          </div>
        </Form>
      </Modal>

      {/* 成员转单弹窗 */}
      <Modal
        title="转单"
        open={transferModalVisible}
        onCancel={() => {
          setTransferModalVisible(false)
          transferForm.resetFields()
          setSelectedWorkOrder(null)
        }}
        onOk={() => transferForm.submit()}
        confirmLoading={transferMutation.isLoading}
      >
        <Form
          form={transferForm}
          layout="vertical"
          initialValues={{ target_type: 'member' }}
          onFinish={(values) => {
            if (!selectedWorkOrder) return
            transferMutation.mutate({
              id: selectedWorkOrder.id,
              data: {
                target_type: values.target_type,
                target_user_id: values.target_user_id,
                reason: values.reason || undefined,
              },
            })
          }}
        >
          <Form.Item
            name="target_type"
            label="转单类型"
            rules={[{ required: true, message: '请选择转单类型' }]}
          >
            <Select
              options={[
                { label: '转给组内成员', value: 'member' },
                { label: '跨组转给组长', value: 'team_leader' },
              ]}
              onChange={() => transferForm.setFieldsValue({ target_user_id: undefined })}
            />
          </Form.Item>

          <Form.Item shouldUpdate noStyle>
            {() => {
              const targetType = transferForm.getFieldValue('target_type') as 'member' | 'team_leader'
              return (
                <Form.Item
                  name="target_user_id"
                  label={targetType === 'team_leader' ? '目标组长' : '目标成员'}
                  rules={[{ required: true, message: targetType === 'team_leader' ? '请选择目标组长' : '请选择目标成员' }]}
                >
                  {targetType === 'team_leader' ? (
                    <UserSelector role={UserRole.TEAM_LEADER} placeholder="请选择目标组长" />
                  ) : (
                    <WorkOrderIntraGroupMemberSelect
                      workOrderId={selectedWorkOrder?.id}
                      placeholder="请选择组内成员"
                    />
                  )}
                </Form.Item>
              )
            }}
          </Form.Item>

          <Form.Item name="reason" label="转单原因（可选）">
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="请输入转单原因，便于追溯" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default WorkOrderList


