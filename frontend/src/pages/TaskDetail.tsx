/**
 * 任务详情页面
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from 'react-query'
import { Card, Descriptions, Tag, Button, Space, message, Modal, Form, Input, Select, Result, DatePicker, Upload, Tabs, Table, Alert, Dropdown, InputNumber, Typography, Spin } from 'antd'
import type { MenuProps } from 'antd'
import { DownloadOutlined, UploadOutlined, SettingOutlined, SolutionOutlined } from '@ant-design/icons'
import { taskService } from '../services/task'
import { auditLogService, AuditAction, AuditResource, AuditLog } from '../services/auditLog'
import { visitLogService } from '../services/visitLog'
import { TaskStatus, TaskStatusLabels, TaskStatusColors } from '../types/task'
import { useAuth } from '../contexts/AuthContext'
import { UserRole } from '../types/user'
import UserSelector from '../components/UserSelector'
import Loading from '../components/Loading'
import ErrorBoundary from '../components/ErrorBoundary'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { buildSalesUnitOptions } from '../config/departments'
import { extractErrorMessage } from '../utils/errorHandler'
import { workOrderService } from '../services/workOrder'
import { WorkOrderStatus } from '../types/workOrder'
import dayjs from 'dayjs'

const { TextArea } = Input
const { RangePicker } = DatePicker
const SALES_UNIT_OPTIONS = buildSalesUnitOptions()

// 联系方式格式校验函数（支持手机号、固定电话、邮箱）
const validateContact = (_: any, value: string) => {
  if (!value) {
    return Promise.resolve()
  }
  
  // 手机号格式：11位数字，1开头，第二位3-9
  const phonePattern = /^1[3-9]\d{9}$/
  // 固定电话格式：区号-号码（如：010-12345678, 021-12345678）
  const landlinePattern = /^0\d{2,3}-\d{7,8}$/
  // 邮箱格式
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  
  if (phonePattern.test(value) || landlinePattern.test(value) || emailPattern.test(value)) {
    return Promise.resolve()
  }
  
  return Promise.reject(new Error('请输入有效的联系方式（手机号、固定电话或邮箱）'))
}

// 部门列表定义
const departments = {
  '云能力中心': null,
  '海卓': null,
  '阿网': null,
  '恒联': null,
  '政企群': null,
  '商客部': null,
  '销售单位': [
    '东区',
    '中区',
    '西区',
    '北区',
    '金山',
    '浦东',
    '公共BD',
    '互联网部',
    '政务BD',
    '科创BD（含号百）',
    '南区',
    '莘闵',
    '青浦',
    '嘉定',
    '松江',
    '数集',
    '工商BD',
    '金融BD',
    '崇明',
    '奉贤',
    '战略BD',
    '互联网BD/信网部',
    '宝山',
    '理想公司',
    '云舟'
  ]
}

// 解析销售单位，返回一级部门和二级部门
const parseSalesUnit = (salesUnit: string | undefined): { department: string | null; subDepartment: string | null } => {
  if (!salesUnit) {
    return { department: null, subDepartment: null }
  }
  
  // 检查是否包含 " - " 分隔符（二级部门格式）
  if (salesUnit.includes(' - ')) {
    const parts = salesUnit.split(' - ')
    if (parts.length === 2) {
      return { department: parts[0], subDepartment: parts[1] }
    }
  }
  
  // 如果没有分隔符，说明只有一级部门
  // 检查是否是一级部门列表中的某个值
  if (Object.keys(departments).includes(salesUnit)) {
    return { department: salesUnit, subDepartment: null }
  }
  
  return { department: null, subDepartment: null }
}

/** 与后端 sales_contact_can_choose_customer_source 一致：仅云能力中心可自选客户来源 */
const canSalesContactChooseCustomerSource = (salesUnit: string | undefined) =>
  parseSalesUnit(salesUnit).department === '云能力中心'

// 构建所有部门选项列表（展平一级和二级部门）
const buildDepartmentOptions = () => {
  const options: { label: string; value: string }[] = []
  
  // 遍历所有一级部门
  Object.keys(departments).forEach((dept) => {
    const subDepts = departments[dept as keyof typeof departments]
    if (subDepts === null) {
      // 没有二级部门，直接添加一级部门
      options.push({ label: dept, value: dept })
    } else {
      // 有二级部门，添加所有二级部门（格式：销售单位 - 东区）
      subDepts.forEach((subDept) => {
        options.push({ label: `${dept} - ${subDept}`, value: `${dept} - ${subDept}` })
      })
    }
  })
  
  return options
}

const { Text } = Typography

/** 跳转到工单列表并带上本任务 task_id 与可选状态筛选（与 WorkOrderList URL 参数一致） */
function buildWorkOrdersListHref(taskId: number, status?: string) {
  const p = new URLSearchParams()
  p.set('task_id', String(taskId))
  p.set('page', '1')
  if (status) p.set('status', status)
  return `/work-orders?${p.toString()}`
}

/** 任务详情顶栏：本任务关联工单 + 待转派/待接单数量，减少任务↔工单来回切换 */
function TaskWorkOrderQuickLinks({ taskId }: { taskId: number }) {
  const enabled = Number.isFinite(taskId) && taskId > 0
  const [qAll, qAssign, qAccept] = useQueries([
    {
      queryKey: ['workOrderTaskStats', taskId, 'all'] as const,
      queryFn: () => workOrderService.getWorkOrders({ task_id: taskId, page: 1, page_size: 1 }),
      enabled,
      staleTime: 20_000,
    },
    {
      queryKey: ['workOrderTaskStats', taskId, WorkOrderStatus.PENDING_ASSIGN] as const,
      queryFn: () =>
        workOrderService.getWorkOrders({
          task_id: taskId,
          status: WorkOrderStatus.PENDING_ASSIGN,
          page: 1,
          page_size: 1,
        }),
      enabled,
      staleTime: 20_000,
    },
    {
      queryKey: ['workOrderTaskStats', taskId, WorkOrderStatus.PENDING_ACCEPT] as const,
      queryFn: () =>
        workOrderService.getWorkOrders({
          task_id: taskId,
          status: WorkOrderStatus.PENDING_ACCEPT,
          page: 1,
          page_size: 1,
        }),
      enabled,
      staleTime: 20_000,
    },
  ])
  const loading = qAll.isLoading || qAssign.isLoading || qAccept.isLoading
  const totalAll = qAll.data?.total ?? 0
  const totalAssign = qAssign.data?.total ?? 0
  const totalAccept = qAccept.data?.total ?? 0
  const n = (v: number) => (loading ? '—' : v)

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <SolutionOutlined />
          <span>工单快捷</span>
          {loading && <Spin size="small" />}
        </Space>
      }
    >
      <Space size="middle" wrap>
        <Link to={buildWorkOrdersListHref(taskId)}>关联工单（共 {n(totalAll)} 条）</Link>
        <Text type="secondary">|</Text>
        <Link to={buildWorkOrdersListHref(taskId, WorkOrderStatus.PENDING_ASSIGN)}>
          待转派 {n(totalAssign)}
        </Link>
        <Text type="secondary">|</Text>
        <Link to={buildWorkOrdersListHref(taskId, WorkOrderStatus.PENDING_ACCEPT)}>
          待接单 {n(totalAccept)}
        </Link>
      </Space>
    </Card>
  )
}

const TaskDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { getCurrentRole, user } = useAuth()
  const currentRole = getCurrentRole()
  const queryClient = useQueryClient()
  
  // 从 location 获取来源页面的查询参数（分页信息）
  const getReturnUrl = () => {
    const searchParams = new URLSearchParams(location.search)
    // 如果有查询参数，返回时带上这些参数
    if (searchParams.toString()) {
      return `/tasks?${searchParams.toString()}`
    }
    return '/tasks'
  }
  const [confirmModalVisible, setConfirmModalVisible] = useState(false)
  const [closeModalVisible, setCloseModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [batchImportModalVisible, setBatchImportModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [lastUpdateLog, setLastUpdateLog] = useState<AuditLog | null>(null)
  const [, setLoadingLastUpdate] = useState(false) // 用于控制加载状态，但当前未在UI中使用
  const [confirmForm] = Form.useForm()
  const [closeForm] = Form.useForm()
  const [detailForm] = Form.useForm()
  const [editForm] = Form.useForm()

  const { data: task, isLoading, error, refetch } = useQuery(
    ['task', id],
    () => taskService.getTask(Number(id)),
    { enabled: !!id }
  )

  const fetchLastUpdateLog = async () => {
    if (!id) return
    try {
      setLoadingLastUpdate(true)
      const res = await auditLogService.getAuditLogs({
        resource: AuditResource.TASK,
        resource_id: Number(id),
        action: AuditAction.UPDATE,
        page: 1,
        page_size: 1,
      })
      setLastUpdateLog(res.items?.[0] || null)
    } catch (err) {
      setLastUpdateLog(null)
    } finally {
      setLoadingLastUpdate(false)
    }
  }

  const confirmMutation = useMutation(
    (data: { confirmed: boolean; rejection_reason?: string }) =>
      taskService.confirmTask(Number(id!), data),
    {
      onSuccess: () => {
        message.success('操作成功')
        setConfirmModalVisible(false)
        confirmForm.resetFields()
        queryClient.invalidateQueries(['task', id])
        queryClient.invalidateQueries(['workOrderTaskStats', Number(id)])
        queryClient.invalidateQueries('tasks')
      },
      onError: (error: any) => {
        // 根据不同的错误状态码和错误信息提供更友好的提示
        const status = error?.response?.status
        const errorDetail = extractErrorMessage(error, '操作失败')
        
        // 根据状态码提供不同的用户体验
        if (status === 400) {
          // 400 错误通常是业务逻辑错误，显示具体的错误原因
          message.error({
            content: errorDetail,
            duration: 5, // 业务错误提示显示时间稍长，让用户有足够时间阅读
          })
        } else if (status === 403) {
          // 403 权限错误
          message.error('您没有权限执行此操作')
        } else if (status === 404) {
          // 404 资源不存在
          message.error('任务不存在或已被删除')
        } else if (status === 422) {
          // 422 验证错误
          message.error(`参数验证失败: ${errorDetail}`)
        } else if (status === 500) {
          // 500 服务器错误
          message.error('服务器错误，请稍后重试')
        } else if (!error.response) {
          // 网络错误
          message.error('网络错误，请检查网络连接')
        } else {
          // 其他错误
          message.error(errorDetail)
        }
      },
    }
  )

  const closeMutation = useMutation(
    (data: { close_reason?: string }) =>
      taskService.closeTask(Number(id!), data),
    {
      onSuccess: () => {
        message.success('任务已关闭')
        setCloseModalVisible(false)
        closeForm.resetFields()
        queryClient.invalidateQueries(['task', id])
        queryClient.invalidateQueries(['workOrderTaskStats', Number(id)])
        queryClient.invalidateQueries('tasks')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '关闭任务失败'))
      },
    }
  )

  const detailMutation = useMutation(
    (data: any) => taskService.submitDetail(Number(id!), data),
    {
      onSuccess: () => {
        message.success('详细需求提交成功')
        setDetailModalVisible(false)
        detailForm.resetFields()
        queryClient.invalidateQueries(['task', id])
        queryClient.invalidateQueries(['workOrderTaskStats', Number(id)])
        queryClient.invalidateQueries(['task-detail-requirements', id])
        queryClient.invalidateQueries('tasks')
        // 刷新详细需求列表
        refetchDetailRequirements()
      },
    }
  )

  const batchImportMutation = useMutation(
    (file: File) => taskService.batchImportDetailRequirements(Number(id!), file),
    {
      onSuccess: (data) => {
        if (data.failed_count > 0) {
          message.warning(`批量导入完成：成功 ${data.success_count} 条，失败 ${data.failed_count} 条`)
        } else {
          message.success(`批量导入成功：共导入 ${data.success_count} 条详细需求`)
        }
        queryClient.invalidateQueries(['task', id])
        queryClient.invalidateQueries(['workOrderTaskStats', Number(id)])
        queryClient.invalidateQueries(['task-detail-requirements', id])
        queryClient.invalidateQueries('tasks')
        // 刷新详细需求列表
        refetchDetailRequirements()
        if (data.failed_count === 0) {
          setBatchImportModalVisible(false)
        }
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '批量导入失败'))
      },
    }
  )

  // 分页状态需要在 useQuery 之前声明
  const [detailRequirementPage, setDetailRequirementPage] = useState(1)
  const [detailRequirementPageSize, setDetailRequirementPageSize] = useState(10)
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState<string>('all') // 派单状态筛选：all, dispatched, not_dispatched

  const { data: detailRequirementsData, refetch: refetchDetailRequirements } = useQuery(
    ['task-detail-requirements', id, detailRequirementPage, detailRequirementPageSize],
    () => taskService.getTaskDetailRequirements(Number(id!), { page: detailRequirementPage, page_size: detailRequirementPageSize }),
    { enabled: !!id && (task?.status === 'confirmed' || task?.status === 'detail_submitted' || task?.status === 'dispatched' || task?.status === 'in_progress' || task?.status === 'completed') }
  )
  
  const detailRequirements = detailRequirementsData?.items || []

  // 如果是总管查看修改后再次审批的任务，自动获取最近一次修改日志
  useEffect(() => {
    if (
      currentRole?.role === 'manager' &&
      task &&
      task.status === TaskStatus.PENDING &&
      task.confirmed_at &&
      id
    ) {
      fetchLastUpdateLog()
    }
  }, [task?.status, task?.confirmed_at, currentRole?.role, id])

  const [requirementDispatchModalVisible, setRequirementDispatchModalVisible] = useState(false)
  const [selectedRequirementId, setSelectedRequirementId] = useState<number | null>(null)
  const [requirementDispatchForm] = Form.useForm()
  const [detailRequirementModalVisible, setDetailRequirementModalVisible] = useState(false)
  const [selectedDetailRequirement, setSelectedDetailRequirement] = useState<any>(null)

  const updateTaskMutation = useMutation(
    (data: any) => taskService.updateTask(Number(id!), data),
    {
      onSuccess: () => {
        const isPostConfirmed = task && (
          task.status === TaskStatus.CONFIRMED || 
          task.status === TaskStatus.DETAIL_SUBMITTED || 
          task.status === TaskStatus.DISPATCHED
        )
        
        if (isPostConfirmed) {
          message.success('任务修改成功，已回退到待确认状态，等待总管重新审批')
        } else {
          message.success('任务更新成功')
        }
        
        setEditModalVisible(false)
        editForm.resetFields()
        queryClient.invalidateQueries(['task', id])
        queryClient.invalidateQueries(['workOrderTaskStats', Number(id)])
        queryClient.invalidateQueries('tasks')
        refetch()
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  const requirementDispatchMutation = useMutation(
    ({ requirement_id, team_leader_id }: { requirement_id: number; team_leader_id: number }) =>
      taskService.dispatchDetailRequirement(Number(id!), requirement_id, team_leader_id),
    {
      onSuccess: () => {
        message.success('派单成功')
        setRequirementDispatchModalVisible(false)
        requirementDispatchForm.resetFields()
        setSelectedRequirementId(null)
        queryClient.invalidateQueries(['task', id])
        queryClient.invalidateQueries(['workOrderTaskStats', Number(id)])
        queryClient.invalidateQueries(['task-detail-requirements', id])
        queryClient.invalidateQueries('tasks')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '派单失败'))
      },
    }
  )

  const handleDownloadTemplate = async () => {
    try {
      const blob = await taskService.downloadDetailRequirementTemplate(Number(id!))
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `详细需求单模板_${task?.task_name || 'template'}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      message.success('模板下载成功')
    } catch (error: any) {
      message.error(extractErrorMessage(error, '模板下载失败'))
    }
  }

  const handleEdit = () => {
    if (!task) return
    editForm.setFieldsValue({
      task_name: task.task_name,
      sales_unit: task.sales_unit.split(','),
      date_range: [dayjs(task.start_date), dayjs(task.end_date)],
      fde_count: task.fde_count,
    })
    setEditModalVisible(true)
  }

  const handleUpdate = (values: any) => {
    if (!task) return
    
    // 检查是否为已确认后的修改
    const isPostConfirmed = task.status === TaskStatus.CONFIRMED || 
                           task.status === TaskStatus.DETAIL_SUBMITTED || 
                           task.status === TaskStatus.DISPATCHED
    
    // 如果是已确认后的修改，验证不能修改任务名称和时间段
    if (isPostConfirmed) {
      const originalTaskName = task.task_name
      const originalStartDate = dayjs(task.start_date).format('YYYY-MM-DD')
      const originalEndDate = dayjs(task.end_date).format('YYYY-MM-DD')
      const newStartDate = values.date_range[0].format('YYYY-MM-DD')
      const newEndDate = values.date_range[1].format('YYYY-MM-DD')
      
      if (values.task_name !== originalTaskName) {
        message.error('已确认后的任务不能修改任务名称')
        return
      }
      
      if (newStartDate !== originalStartDate || newEndDate !== originalEndDate) {
        message.error('已确认后的任务不能修改时间段')
        return
      }
    }
    
    const salesUnitStr = Array.isArray(values.sales_unit) 
      ? values.sales_unit.join(',') 
      : values.sales_unit
    
    updateTaskMutation.mutate({
      ...values,
      sales_unit: salesUnitStr,
      start_date: values.date_range[0].format('YYYY-MM-DD'),
      end_date: values.date_range[1].format('YYYY-MM-DD'),
      date_range: undefined,
    })
  }

  // 处理点击接单人，跳转到拜访日志详情
  const handleAcceptorClick = async (record: any) => {
    // 如果没有工单ID，无法查询拜访日志
    if (!record.work_order_id) {
      message.warning('该需求尚未派单，无法查看拜访日志')
      return
    }

    try {
      // 通过工单ID查询拜访日志（每个工单只能有一个拜访日志）
      const visitLogsData = await visitLogService.getVisitLogs({
        work_order_id: record.work_order_id,
        page: 1,
        page_size: 1,
      })

      if (visitLogsData.items && visitLogsData.items.length > 0) {
        // 找到拜访日志，跳转到详情页
        const visitLog = visitLogsData.items[0]
        navigate(`/visit-logs/${visitLog.id}`)
      } else {
        // 没有找到拜访日志，提示用户
        message.info('该工单尚未创建拜访日志')
      }
    } catch (error: any) {
      message.error(extractErrorMessage(error, '查询拜访日志失败'))
    }
  }

  if (isLoading) {
    return <Loading tip="加载任务详情..." />
  }

  if (error) {
    return <ErrorBoundary error={error as Error} onRetry={() => refetch()} title="加载任务失败" />
  }

  if (!task) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="任务不存在"
        extra={
          <Button type="primary" onClick={() => navigate(getReturnUrl())}>
            返回任务列表
          </Button>
        }
      />
    )
  }

  const canConfirm = currentRole?.role === 'manager' && task.status === 'pending'
  // 已关闭不可提交；已完成任务仍可追加详细需求（多阶段专项任务）
  const canSubmitDetail = currentRole?.role === 'sales_contact' &&
    task.status !== 'cancelled'
  const canChooseCustomerSource = canSalesContactChooseCustomerSource(currentRole?.sales_unit)
  // 总管可以随时关闭任务（除已关闭或已完成）
  const canClose = currentRole?.role === 'manager' && 
    task.status !== 'cancelled' && 
    task.status !== 'completed'
  // 修改任务：仅专项任务发起人（创建者）可修改；销售单位接口人不可修改
  const canEdit = currentRole?.role === 'task_initiator' &&
    user?.id === task.initiator_id &&
    (task.status === TaskStatus.DRAFT ||
     task.status === TaskStatus.CONFIRMED ||
     task.status === TaskStatus.DETAIL_SUBMITTED ||
     task.status === TaskStatus.DISPATCHED)

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '任务管理', to: getReturnUrl() },
          { title: task.task_name || '任务详情' },
        ]}
      />
      <TaskWorkOrderQuickLinks taskId={Number(id)} />

      <Card title="任务详情">
        {/* 总管查看修改后再次审批的任务时显示提示 */}
        {currentRole?.role === 'manager' && 
         task.status === TaskStatus.PENDING && 
         task.confirmed_at && (
          <Alert
            message="此任务为修改后再次审批"
            description={
              <div>
                <p style={{ margin: 0 }}>
                  该任务之前已被确认过（首次确认时间：{dayjs(task.confirmed_at).format('YYYY-MM-DD HH:mm')}），
                  发起人修改了任务内容后，任务状态已回退到「待确认」，需要您重新审批。
                </p>
                {lastUpdateLog && lastUpdateLog.details?.modify_reason && (
                  <p style={{ marginTop: 8, marginBottom: 0 }}>
                    <strong>修改原因：</strong>{lastUpdateLog.details.modify_reason}
                  </p>
                )}
              </div>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Descriptions column={2} bordered>
          <Descriptions.Item label="任务名称">{task.task_name}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={TaskStatusColors[task.status as TaskStatus]}>
              {TaskStatusLabels[task.status as TaskStatus]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="销售单位">
            {task.sales_unit?.split(',').map((unit: string, index: number) => (
              <Tag key={index} style={{ marginBottom: 4 }}>
                {unit.trim()}
              </Tag>
            ))}
          </Descriptions.Item>
          <Descriptions.Item label="FDE人数">{task.fde_count}</Descriptions.Item>
          <Descriptions.Item label="开始日期">
            {dayjs(task.start_date).format('YYYY-MM-DD')}
          </Descriptions.Item>
          <Descriptions.Item label="结束日期">
            {dayjs(task.end_date).format('YYYY-MM-DD')}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {dayjs(task.created_at).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          {task.customer_unit && (
            <Descriptions.Item label="客户单位" span={task.industry_type ? 1 : 2}>
              {task.customer_unit}
            </Descriptions.Item>
          )}
          {task.industry_type && (
            <Descriptions.Item label="行业类型" span={task.customer_unit ? 1 : 2}>
              {task.industry_type}
            </Descriptions.Item>
          )}
          {task.requirement_content && (
            <Descriptions.Item label="详细需求" span={2}>
              {task.requirement_content}
            </Descriptions.Item>
          )}
          {task.expected_visit_time && (
            <Descriptions.Item label="预期拜访时间" span={2}>
              {dayjs(task.expected_visit_time).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
          )}
          {task.rejection_reason && (
            <Descriptions.Item label="拒绝原因" span={2}>
              {task.rejection_reason}
            </Descriptions.Item>
          )}
        </Descriptions>

        {/* 已完成任务仍可追加需求，但仅「销售单位接口人」角色可见提交入口（与后端 PUT /detail 权限一致） */}
        {task.status === 'completed' &&
          currentRole?.role &&
          currentRole.role !== 'sales_contact' && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16 }}
              message="追加详细需求"
              description="已完成任务上继续提交详细需求，请先在顶部切换为「销售单位接口人」角色后再使用本页的「提交详细需求单 / 批量导入详细需求」按钮。"
            />
          )}

        <div style={{ marginTop: 24 }}>
          <Space>
            {canEdit && (
              <Button type="default" onClick={handleEdit}>
                修改任务
              </Button>
            )}
            {canConfirm && (
              <Button
                type="primary"
                onClick={async () => {
                  await fetchLastUpdateLog()
                  setConfirmModalVisible(true)
                }}
              >
                确认/拒绝任务
              </Button>
            )}
            {canClose && (
              <Button type="default" danger onClick={() => setCloseModalVisible(true)}>
                关闭任务
              </Button>
            )}
            {canSubmitDetail && (
              <>
                <Button type="primary" onClick={() => setDetailModalVisible(true)}>
                  提交详细需求单
                </Button>
                <Button type="default" onClick={() => setBatchImportModalVisible(true)}>
                  批量导入详细需求
                </Button>
              </>
            )}
          </Space>
        </div>
      </Card>

      {/* 详细需求列表（如果有） */}
      {detailRequirementsData && (detailRequirementsData.total > 0 || detailRequirements.length > 0) && (
        <Card 
          title="详细需求列表" 
          style={{ marginTop: 16 }}
          extra={
            <Select
              value={dispatchStatusFilter}
              onChange={(value) => {
                setDispatchStatusFilter(value)
                setDetailRequirementPage(1) // 筛选条件改变时重置到第一页
              }}
              style={{ width: 120 }}
              placeholder="筛选派单状态"
            >
              <Select.Option value="all">全部</Select.Option>
              <Select.Option value="not_dispatched">未派单</Select.Option>
              <Select.Option value="dispatched">已派单</Select.Option>
            </Select>
          }
        >
          <Table
            dataSource={detailRequirements.filter((req) => {
              if (dispatchStatusFilter === 'all') return true
              if (dispatchStatusFilter === 'dispatched') return req.is_dispatched
              if (dispatchStatusFilter === 'not_dispatched') return !req.is_dispatched
              return true
            })}
            rowKey="id"
            pagination={{
              current: detailRequirementPage,
              pageSize: detailRequirementPageSize,
              total: detailRequirementsData?.total || 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (page, pageSize) => {
                setDetailRequirementPage(page)
                setDetailRequirementPageSize(pageSize)
              },
              onShowSizeChange: (_current, size) => {
                setDetailRequirementPage(1)
                setDetailRequirementPageSize(size)
              },
            }}
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: '客户单位',
                dataIndex: 'customer_unit',
                key: 'customer_unit',
                width: 150,
                ellipsis: true,
              },
              {
                title: '行业类型',
                dataIndex: 'industry_type',
                key: 'industry_type',
                width: 120,
                ellipsis: true,
              },
              {
                title: '客户来源',
                dataIndex: 'customer_source',
                key: 'customer_source',
                width: 150,
                ellipsis: true,
                render: (text) => text || '-',
              },
              {
                title: '提交人',
                key: 'sales_contact',
                width: 150,
                render: (_, record) => (
                  <div>
                    <div>{record.sales_contact_name || '-'}</div>
                    {record.sales_contact_unit && (
                      <div style={{ fontSize: '12px', color: '#999', marginTop: 2 }}>
                        {record.sales_contact_unit}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                title: '详细需求内容',
                dataIndex: 'requirement_content',
                key: 'requirement_content',
                width: 200,
                ellipsis: {
                  showTitle: true,
                },
              },
              {
                title: '预期拜访时间',
                dataIndex: 'expected_visit_time',
                key: 'expected_visit_time',
                width: 160,
                render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
              },
              {
                title: '客户拜访地址',
                dataIndex: 'customer_visit_address',
                key: 'customer_visit_address',
                width: 200,
                ellipsis: {
                  showTitle: true,
                },
                render: (text: string) => text || '-',
              },
              {
                title: '客户经理姓名',
                dataIndex: 'customer_manager_name',
                key: 'customer_manager_name',
                width: 120,
                ellipsis: true,
                render: (text: string) => text || '-',
              },
              {
                title: '客户经理联系方式',
                dataIndex: 'customer_manager_contact',
                key: 'customer_manager_contact',
                width: 150,
                ellipsis: true,
                render: (text: string) => text || '-',
              },
              {
                title: '派单状态',
                key: 'dispatch_status',
                width: 100,
                align: 'center' as const,
                render: (_, record) => (
                  record.is_dispatched ? (
                    <Tag color="success">已派单</Tag>
                  ) : (
                    <Tag color="warning">未派单</Tag>
                  )
                ),
              },
              {
                title: '接单人',
                key: 'acceptor',
                dataIndex: 'acceptor_name',
                width: 100,
                ellipsis: true,
                render: (text, record) => {
                  if (text && record.work_order_id) {
                    return (
                      <Button
                        type="link"
                        style={{ padding: 0 }}
                        onClick={() => handleAcceptorClick(record)}
                      >
                        {text}
                      </Button>
                    )
                  }
                  return text || '-'
                },
              },
              {
                title: '工单编号',
                dataIndex: 'work_order_no',
                key: 'work_order_no',
                width: 180,
                ellipsis: true,
                render: (text, record) => {
                  if (record.work_order_id && text) {
                    return (
                      <Button
                        type="link"
                        style={{ padding: 0 }}
                        onClick={() => navigate(`/work-orders/${record.work_order_id}`)}
                      >
                        {text}
                      </Button>
                    )
                  }
                  return text || '-'
                },
              },
              {
                title: '操作',
                key: 'action',
                width: 120,
                align: 'center' as const,
                fixed: 'right' as const,
                render: (_, record) => {
                  // 检查是否可以派单：用户是总管 && 任务未关闭/完成 && 该需求未派单
                  const canDispatch = currentRole?.role === 'manager' &&
                                     task?.status !== 'cancelled' &&
                                     !record.is_dispatched

                  // 删除/作废：
                  // - 总管：任务未关闭且该需求未派单即可删除
                  // - 销售接口人：仅能删除自己提交的、且未派单的需求
                  const canDelete =
                    !record.is_dispatched &&
                    task?.status !== 'cancelled' &&
                    (
                      currentRole?.role === 'manager' ||
                      (currentRole?.role === 'sales_contact' && record.sales_contact_id === user?.id)
                    )

                  const menuItems: MenuProps['items'] = [
                    {
                      key: 'view',
                      label: '查看详情',
                      onClick: () => {
                        setSelectedDetailRequirement(record)
                        setDetailRequirementModalVisible(true)
                      },
                    },
                  ]

                  if (canDispatch) {
                    menuItems.push({
                      key: 'dispatch',
                      label: '派单',
                      disabled: !canDispatch,
                      onClick: () => {
                        if (canDispatch) {
                          setSelectedRequirementId(record.id)
                          setRequirementDispatchModalVisible(true)
                        }
                      },
                    } as NonNullable<MenuProps['items']>[number])
                  }

                  if (canDelete) {
                    menuItems.push({
                      key: 'delete',
                      label: '作废详细需求',
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: '确认作废详细需求',
                          content: (
                            <div>
                              <p>确定要作废该详细需求吗？</p>
                              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                                <li>作废后，该详细需求将从列表中移除</li>
                                <li>如果后续仍有需求，可重新提交新的详细需求</li>
                              </ul>
                            </div>
                          ),
                          okText: '确认作废',
                          cancelText: '取消',
                          okButtonProps: { danger: true },
                          onOk: async () => {
                            try {
                              await taskService.deleteTaskDetailRequirement(Number(id!), record.id)
                              message.success('详细需求已作废')
                              // 重新拉取列表
                              refetchDetailRequirements()
                              queryClient.invalidateQueries(['task-detail-requirements', id])
                            } catch (error: any) {
                              message.error(extractErrorMessage(error, '作废失败'))
                            }
                          },
                        })
                      },
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
            ]}
          />
        </Card>
      )}

      {/* 关闭任务模态框 */}
      <Modal
        title="关闭任务"
        open={closeModalVisible}
        onCancel={() => {
          setCloseModalVisible(false)
          closeForm.resetFields()
        }}
        onOk={() => closeForm.submit()}
        okText="确认关闭"
        okButtonProps={{ danger: true }}
        confirmLoading={closeMutation.isLoading}
      >
        <Form form={closeForm} onFinish={(values) => closeMutation.mutate(values)} layout="vertical">
          <Alert
            message="关闭任务后，销售单位接口人将无法继续提交新的详细需求。"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form.Item name="close_reason" label="关闭原因（可选）">
            <TextArea rows={4} placeholder="请输入关闭原因..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* 确认/拒绝模态框 */}
      <Modal
        title="确认/拒绝任务"
        open={confirmModalVisible}
        onCancel={() => {
          setConfirmModalVisible(false)
          confirmForm.resetFields()
        }}
        onOk={() => confirmForm.submit()}
      >
        {lastUpdateLog && lastUpdateLog.details?.changed_fields && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f0f2f5', borderRadius: 4 }}>
            <p style={{ marginBottom: 8, fontWeight: 500 }}>最近一次任务修改：</p>
            {lastUpdateLog.details.modify_reason && (
              <p style={{ marginBottom: 8 }}>
                <strong>修改原因：</strong>
                {lastUpdateLog.details.modify_reason}
              </p>
            )}
            <div>
              <strong>变更字段：</strong>
              <ul style={{ marginTop: 8, paddingLeft: 20, marginBottom: 0 }}>
                {Object.entries(lastUpdateLog.details.changed_fields as Record<string, { old: any; new: any }>)
                  .map(([field, value]) => {
                    const fieldLabels: Record<string, string> = {
                      task_name: '任务名称',
                      sales_unit: '面向的销售单位',
                      start_date: '开始日期',
                      end_date: '结束日期',
                      fde_count: 'FDE人数',
                    }
                    const label = fieldLabels[field] || field
                    return (
                      <li key={field}>
                        <span style={{ fontWeight: 500 }}>{label}：</span>
                        <span style={{ marginLeft: 4 }}>{String(value.old ?? '')}</span>
                        <span style={{ margin: '0 4px' }}>→</span>
                        <span>{String(value.new ?? '')}</span>
                      </li>
                    )
                  })}
              </ul>
            </div>
          </div>
        )}
        <Form form={confirmForm} onFinish={(values) => confirmMutation.mutate(values)} layout="vertical">
          <Form.Item name="confirmed" label="操作" rules={[{ required: true }]}>
            <Select>
              <Select.Option value={true}>确认</Select.Option>
              <Select.Option value={false}>拒绝</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.confirmed !== currentValues.confirmed
            }
          >
            {({ getFieldValue }) => {
              const confirmed = getFieldValue('confirmed')
              return (
                <>
                  {confirmed === true && (
                    <div style={{ marginBottom: 16, padding: 12, background: '#f0f2f5', borderRadius: 4 }}>
                      <p style={{ margin: 0, color: '#666' }}>
                        确认后，任务将自动派发给该任务面向的销售单位的所有接口人。
                      </p>
                    </div>
                  )}
                  {confirmed === false && (
                    <Form.Item name="rejection_reason" label="拒绝原因" rules={[{ required: true }]}>
                      <TextArea rows={4} />
                    </Form.Item>
                  )}
                </>
              )
            }}
          </Form.Item>
        </Form>
      </Modal>

      {/* 详细需求单模态框 */}
      <Modal
        title="提交详细需求单"
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false)
          detailForm.resetFields()
        }}
        onOk={() => detailForm.submit()}
        afterOpenChange={(open) => {
          if (!open || !currentRole?.sales_unit) return
          // 非云能力中心：客户来源固定为本人销售单位
          if (!canChooseCustomerSource) {
            detailForm.setFieldsValue({ customer_source: currentRole.sales_unit })
            return
          }
          const { department } = parseSalesUnit(currentRole.sales_unit)
          if (department === '销售单位') {
            detailForm.setFieldsValue({ customer_source: currentRole.sales_unit })
          }
        }}
      >
        {/* 如果任务处于待确认状态，提醒用户 */}
        {task && task.status === TaskStatus.PENDING && (
          <Alert
            message="任务状态提醒"
            description={
              <div>
                <p style={{ margin: 0 }}>
                  当前专项任务处于「待确认」状态，可能已被修改并等待总管重新审批。
                </p>
                <p style={{ marginTop: 8, marginBottom: 0, color: '#ff4d4f' }}>
                  <strong>注意：</strong>如果任务被拒绝或再次修改，您提交的详细需求可能会受到影响。
                  建议等待任务确认后再提交详细需求，或确认任务状态后再提交。
                </p>
              </div>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={detailForm} onFinish={(values) => {
          const lockedCustomerSource =
            !canChooseCustomerSource && currentRole?.sales_unit
              ? currentRole.sales_unit
              : values.customer_source
          const submitValues: any = {
            customer_unit: values.customer_unit,
            industry_type: values.industry_type,
            customer_source: lockedCustomerSource,
            requirement_content: values.requirement_content,
          }
          if (values.expected_visit_time) {
            submitValues.expected_visit_time = values.expected_visit_time.format('YYYY-MM-DD HH:mm:ss')
          }
          // 统一规则：所有任务提交详细需求时，客户三字段均为必填
          submitValues.customer_visit_address = values.customer_visit_address
          submitValues.customer_manager_name = values.customer_manager_name
          submitValues.customer_manager_contact = values.customer_manager_contact
          detailMutation.mutate(submitValues)
        }} layout="vertical">
          <Form.Item name="customer_unit" label="客户单位" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="industry_type" label="行业类型" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="customer_source"
            label="客户来源"
            rules={[{ required: true, message: '请选择客户来源' }]}
            extra={
              !canChooseCustomerSource
                ? '您的部门非云能力中心，客户来源固定为您的销售单位，不可修改。'
                : undefined
            }
          >
            <Select 
              placeholder="请选择客户来源"
              options={buildDepartmentOptions()}
              disabled={!canChooseCustomerSource}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="requirement_content" label="详细需求内容" rules={[{ required: true }]}>
            <TextArea rows={6} />
          </Form.Item>
          <Form.Item name="expected_visit_time" label="预期拜访时间">
            <DatePicker 
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }} 
              placeholder="请选择日期和时间"
            />
          </Form.Item>
          <Form.Item 
            name="customer_visit_address" 
            label="客户拜访地址" 
            rules={[{ required: true, message: '客户拜访地址为必填项' }]}
          >
            <Input placeholder="请输入客户拜访地址" />
          </Form.Item>
          <Form.Item 
            name="customer_manager_name" 
            label="客户经理姓名" 
            rules={[{ required: true, message: '客户经理姓名为必填项' }]}
          >
            <Input placeholder="请输入客户经理姓名" />
          </Form.Item>
          <Form.Item 
            name="customer_manager_contact" 
            label="客户经理联系方式" 
            rules={[
              { required: true, message: '客户经理联系方式为必填项' },
              { validator: validateContact }
            ]}
          >
            <Input placeholder="请输入客户经理联系方式（手机号/固定电话/邮箱）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入模态框 */}
      <Modal
        title="批量导入详细需求单"
        open={batchImportModalVisible}
        onCancel={() => {
          setBatchImportModalVisible(false)
        }}
        footer={null}
        width={800}
      >
        {/* 如果任务处于待确认状态，提醒用户 */}
        {task && task.status === TaskStatus.PENDING && (
          <Alert
            message="任务状态提醒"
            description={
              <div>
                <p style={{ margin: 0 }}>
                  当前专项任务处于「待确认」状态，可能已被修改并等待总管重新审批。
                </p>
                <p style={{ marginTop: 8, marginBottom: 0, color: '#ff4d4f' }}>
                  <strong>注意：</strong>如果任务被拒绝或再次修改，您导入的详细需求可能会受到影响。
                  建议等待任务确认后再导入详细需求，或确认任务状态后再导入。
                </p>
              </div>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Tabs
          items={[
            {
              key: 'upload',
              label: '上传文件',
              children: (
                <div>
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <div>
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={handleDownloadTemplate}
                        style={{ marginBottom: 16 }}
                      >
                        下载 Excel 模板
                      </Button>
                      <p style={{ color: '#666', marginTop: 8 }}>
                        请先下载模板，填写完客户信息后上传。每行代表一个客户的详细需求。
                      </p>
                    </div>
                    <Upload
                      accept=".xlsx,.xls"
                      beforeUpload={(file) => {
                        batchImportMutation.mutate(file)
                        return false // 阻止自动上传
                      }}
                      showUploadList={true}
                      maxCount={1}
                    >
                      <Button icon={<UploadOutlined />} loading={batchImportMutation.isLoading}>
                        选择 Excel 文件并上传
                      </Button>
                    </Upload>
                    {batchImportMutation.data && (
                      <Alert
                        message={
                          batchImportMutation.data.failed_count > 0
                            ? `导入完成：成功 ${batchImportMutation.data.success_count} 条，失败 ${batchImportMutation.data.failed_count} 条`
                            : `导入成功：共导入 ${batchImportMutation.data.success_count} 条详细需求`
                        }
                        type={batchImportMutation.data.failed_count > 0 ? 'warning' : 'success'}
                        style={{ marginTop: 16 }}
                        description={
                          batchImportMutation.data.errors.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <strong>错误详情：</strong>
                              <ul style={{ marginTop: 4, marginBottom: 0 }}>
                                {batchImportMutation.data.errors.map((error, index) => (
                                  <li key={index} style={{ color: '#ff4d4f' }}>
                                    {error}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        }
                      />
                    )}
                  </Space>
                </div>
              ),
            },
            {
              key: 'requirements',
              label: '已导入的详细需求',
              children: detailRequirements && detailRequirements.length > 0 ? (
                <Table
                  dataSource={detailRequirements}
                  rowKey="id"
                  columns={[
                    {
                      title: '客户单位',
                      dataIndex: 'customer_unit',
                      key: 'customer_unit',
                    },
                    {
                      title: '行业类型',
                      dataIndex: 'industry_type',
                      key: 'industry_type',
                    },
                    {
                      title: '客户来源',
                      dataIndex: 'customer_source',
                      key: 'customer_source',
                      render: (text) => text || '-',
                    },
                    {
                      title: '详细需求内容',
                      dataIndex: 'requirement_content',
                      key: 'requirement_content',
                      ellipsis: true,
                    },
                    {
                      title: '预期拜访时间',
                      dataIndex: 'expected_visit_time',
                      key: 'expected_visit_time',
                      render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-',
                    },
                    {
                      title: '创建时间',
                      dataIndex: 'created_at',
                      key: 'created_at',
                      render: (text) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
                    },
                  ]}
                  pagination={{ pageSize: 10 }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                  暂无详细需求数据
                </div>
              ),
            },
          ]}
        />
      </Modal>

      {/* 详细需求派单模态框 */}
      <Modal
        title="派单给组长"
        open={requirementDispatchModalVisible}
        onCancel={() => {
          setRequirementDispatchModalVisible(false)
          requirementDispatchForm.resetFields()
          setSelectedRequirementId(null)
        }}
        onOk={() => requirementDispatchForm.submit()}
        confirmLoading={requirementDispatchMutation.isLoading}
      >
        <Form
          form={requirementDispatchForm}
          onFinish={(values) => {
            if (selectedRequirementId) {
              requirementDispatchMutation.mutate({
                requirement_id: selectedRequirementId,
                team_leader_id: values.team_leader_id
              })
            }
          }}
          layout="vertical"
        >
          <Form.Item
            name="team_leader_id"
            label="选择组长"
            rules={[{ required: true, message: '请选择组长' }]}
          >
            <UserSelector role={UserRole.TEAM_LEADER} placeholder="请选择组长" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详细需求详情模态框 */}
      <Modal
        title="详细需求详情"
        open={detailRequirementModalVisible}
        onCancel={() => {
          setDetailRequirementModalVisible(false)
          setSelectedDetailRequirement(null)
        }}
        footer={[
          <Button key="close" onClick={() => {
            setDetailRequirementModalVisible(false)
            setSelectedDetailRequirement(null)
          }}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {selectedDetailRequirement && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="客户单位" span={2}>
              {selectedDetailRequirement.customer_unit || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="行业类型">
              {selectedDetailRequirement.industry_type || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="客户来源">
              {selectedDetailRequirement.customer_source || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="提交人">
              {selectedDetailRequirement.sales_contact_name || '-'}
              {selectedDetailRequirement.sales_contact_unit && (
                <div style={{ fontSize: '12px', color: '#999', marginTop: 4 }}>
                  {selectedDetailRequirement.sales_contact_unit}
                </div>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="详细需求内容" span={2}>
              {selectedDetailRequirement.requirement_content || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="预期拜访时间">
              {selectedDetailRequirement.expected_visit_time 
                ? dayjs(selectedDetailRequirement.expected_visit_time).format('YYYY-MM-DD HH:mm')
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="派单状态">
              {selectedDetailRequirement.is_dispatched ? (
                <Tag color="success">已派单</Tag>
              ) : (
                <Tag color="warning">未派单</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="客户拜访地址" span={2}>
              {selectedDetailRequirement.customer_visit_address || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="客户经理姓名">
              {selectedDetailRequirement.customer_manager_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="客户经理联系方式">
              {selectedDetailRequirement.customer_manager_contact || '-'}
            </Descriptions.Item>
            {selectedDetailRequirement.is_dispatched && (
              <>
                <Descriptions.Item label="接单人">
                  {selectedDetailRequirement.acceptor_name ? (
                    <Button
                      type="link"
                      style={{ padding: 0 }}
                      onClick={() => handleAcceptorClick(selectedDetailRequirement)}
                    >
                      {selectedDetailRequirement.acceptor_name}
                    </Button>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="工单编号">
                  {selectedDetailRequirement.work_order_no ? (
                    <Button
                      type="link"
                      style={{ padding: 0 }}
                      onClick={() => navigate(`/work-orders/${selectedDetailRequirement.work_order_id}`)}
                    >
                      {selectedDetailRequirement.work_order_no}
                    </Button>
                  ) : '-'}
                </Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="创建时间">
              {dayjs(selectedDetailRequirement.created_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {dayjs(selectedDetailRequirement.updated_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* 修改任务Modal */}
      <Modal
        title="修改任务"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false)
          editForm.resetFields()
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateTaskMutation.isLoading}
        width={600}
      >
        {task && (task.status === TaskStatus.CONFIRMED || 
                 task.status === TaskStatus.DETAIL_SUBMITTED || 
                 task.status === TaskStatus.DISPATCHED) && (
          <Alert
            message="修改提示"
            description={
              <div>
                <p>当前任务已审批完成，修改后将：</p>
                <ul style={{ marginTop: 8, paddingLeft: 20, marginBottom: 0 }}>
                  <li>任务状态将回退到「待确认」</li>
                  <li>需要总管重新审批确认</li>
                  <li style={{ color: '#ff4d4f' }}>
                    <strong>注意：</strong>只能修改销售单位和FDE人数，不能修改任务名称和时间段
                  </li>
                  <li style={{ color: '#ff4d4f' }}>
                    <strong>限制：</strong>如果减少销售单位，该销售单位不能有已派单的工单（如果有工单，无法移除）
                  </li>
                  <li style={{ color: '#1890ff' }}>
                    <strong>说明：</strong>如果销售单位只有详细需求没有工单，允许移除。移除后该销售单位将无法再提交新的详细需求，但已提交的详细需求会保留
                  </li>
                  <li style={{ color: '#ff4d4f' }}>
                    <strong>限制：</strong>如果减少FDE人数，新人数不能少于已派单工单数量
                  </li>
                </ul>
              </div>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={editForm} onFinish={handleUpdate} layout="vertical">
          {task && (task.status === TaskStatus.CONFIRMED || 
                    task.status === TaskStatus.DETAIL_SUBMITTED || 
                    task.status === TaskStatus.DISPATCHED) && (
            <Form.Item
              name="modify_reason"
              label="修改原因"
              rules={[{ required: true, message: '请填写本次修改原因' }]}
            >
              <TextArea rows={3} maxLength={200} showCount />
            </Form.Item>
          )}
          <Form.Item 
            name="task_name" 
            label="任务名称" 
            rules={[{ required: true }]}
            {...(task && (task.status === TaskStatus.CONFIRMED || 
                         task.status === TaskStatus.DETAIL_SUBMITTED || 
                         task.status === TaskStatus.DISPATCHED) 
              ? { 
                  help: '已确认后的任务不能修改任务名称',
                  validateStatus: 'error' as const
                } 
              : {})}
          >
            <Input 
              disabled={task && (task.status === TaskStatus.CONFIRMED || 
                               task.status === TaskStatus.DETAIL_SUBMITTED || 
                               task.status === TaskStatus.DISPATCHED)} 
            />
          </Form.Item>
          <Form.Item 
            name="sales_unit" 
            label="面向的销售单位" 
            rules={[{ required: true, message: '请至少选择一个销售单位' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择销售单位（可多选）"
              allowClear
              style={{ width: '100%' }}
              maxTagCount="responsive"
              onChange={(value) => {
                if (Array.isArray(value)) {
                  const hasAll = value.includes('全部')
                  const otherValues = value.filter(v => v !== '全部')
                  
                  if (hasAll && otherValues.length > 0) {
                    editForm.setFieldsValue({ sales_unit: ['全部'] })
                    message.info('选择"全部"后，已自动清除其他销售单位')
                  }
                }
              }}
            >
              {SALES_UNIT_OPTIONS.map(unit => (
                <Select.Option key={unit} value={unit}>
                  {unit}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item 
            name="date_range" 
            label="任务时间段" 
            rules={[{ required: true }]}
            {...(task && (task.status === TaskStatus.CONFIRMED || 
                         task.status === TaskStatus.DETAIL_SUBMITTED || 
                         task.status === TaskStatus.DISPATCHED) 
              ? { 
                  help: '已确认后的任务不能修改时间段',
                  validateStatus: 'error' as const
                } 
              : {})}
          >
            <RangePicker 
              style={{ width: '100%' }}
              disabled={task && (task.status === TaskStatus.CONFIRMED || 
                                task.status === TaskStatus.DETAIL_SUBMITTED || 
                                task.status === TaskStatus.DISPATCHED)} 
            />
          </Form.Item>
          <Form.Item name="fde_count" label="FDE支撑人员数量" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default TaskDetail
