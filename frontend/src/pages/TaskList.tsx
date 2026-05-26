/**
 * 任务列表页面
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Table, Button, Tag, Space, message, Modal, Form, Input, DatePicker, InputNumber, Select, Alert, Dropdown, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { PlusOutlined, SearchOutlined, DownloadOutlined, FileExcelOutlined, FilePdfOutlined, SettingOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { taskService, Task } from '../services/task'
import { exportService } from '../services/export'
import { TaskStatus, TaskStatusLabels, TaskStatusColors } from '../types/task'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import { buildSalesUnitOptions } from '../config/departments'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'

const { RangePicker } = DatePicker
const { Title } = Typography

// 销售单位选项列表（从部门配置动态生成，包含所有部门）
const SALES_UNIT_OPTIONS = buildSalesUnitOptions()

const TaskList = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const [searchForm] = Form.useForm()
  const { getCurrentRole, user } = useAuth()
  const currentRole = getCurrentRole()
  const queryClient = useQueryClient()
  
  // 从 URL 参数读取分页和筛选条件
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
  const urlPageSize = searchParams.get('page_size') ? parseInt(searchParams.get('page_size')!, 10) : 10
  // 兼容旧链接 ?search=：仅映射到任务名称
  const urlTaskName = searchParams.get('task_name') || searchParams.get('search') || ''
  const urlSalesUnit = searchParams.get('sales_unit') || ''
  const urlStatus = searchParams.get('status') || undefined
  
  const [pagination, setPagination] = useState({ page: urlPage, page_size: urlPageSize })
  const [taskNameFilter, setTaskNameFilter] = useState(urlTaskName)
  const [salesUnitFilter, setSalesUnitFilter] = useState(urlSalesUnit)
  const [statusFilter, setStatusFilter] = useState<string | undefined>(urlStatus)
  // 保存最近提交的表单值，用于错误处理时检查任务是否创建成功
  const lastSubmittedValuesRef = useRef<{ task_name?: string; sales_unit?: string } | null>(null)
  
  // 当 URL 参数变化时，更新状态（与地址栏保持双向一致，含清空筛选）
  useEffect(() => {
    setPagination({ page: urlPage, page_size: urlPageSize })
    setTaskNameFilter(urlTaskName)
    setSalesUnitFilter(urlSalesUnit)
    setStatusFilter(urlStatus)
    searchForm.setFieldsValue({
      task_name: urlTaskName || undefined,
      sales_unit: urlSalesUnit || undefined,
      status: urlStatus,
    })
  }, [urlPage, urlPageSize, urlTaskName, urlSalesUnit, urlStatus, searchForm])

  const { data: tasksData, isLoading, error } = useQuery(
    ['tasks', pagination.page, pagination.page_size, taskNameFilter, salesUnitFilter, statusFilter],
    () => taskService.getTasks({
      page: pagination.page,
      page_size: pagination.page_size,
      task_name: taskNameFilter || undefined,
      sales_unit: salesUnitFilter || undefined,
      status: statusFilter,
    }),
    {
      onError: (err: any) => {
        const { logError } = require('../utils/errorHandler')
        logError('获取任务列表失败', err)
      },
    }
  )

  const tasks = tasksData?.items || []
  const total = tasksData?.total || 0

  const createMutation = useMutation(taskService.createTask, {
    onSuccess: () => {
      message.success('任务创建成功（草稿状态）')
      setCreateModalVisible(false)
      form.resetFields()
      lastSubmittedValuesRef.current = null
      // 使用 refetchQueries 保持当前分页状态
      queryClient.refetchQueries(['tasks', pagination.page, pagination.page_size, taskNameFilter, salesUnitFilter, statusFilter])
    },
    onError: async (error: any) => {
      // 如果是网络错误（CORS或连接问题），但请求可能已经成功
      // 尝试刷新任务列表来确认是否真的创建成功
      if (error.request && !error.response && lastSubmittedValuesRef.current) {
        // 延迟一下再刷新，给服务器时间处理请求
        setTimeout(async () => {
          try {
            // 刷新任务列表
            await queryClient.invalidateQueries('tasks')
            // 获取最新的任务列表
            const latestTasks = await queryClient.fetchQuery(
              ['tasks', pagination.page, pagination.page_size, taskNameFilter, salesUnitFilter, statusFilter],
              () => taskService.getTasks({
                page: pagination.page,
                page_size: pagination.page_size,
                task_name: taskNameFilter || undefined,
                sales_unit: salesUnitFilter || undefined,
                status: statusFilter,
              })
            )
            
            // 检查是否有新创建的任务（通过任务名称和销售单位匹配）
            const submittedValues = lastSubmittedValuesRef.current
            const newTask = submittedValues ? latestTasks?.items?.find(
              (task: Task) => 
                task.task_name === submittedValues.task_name && 
                task.sales_unit === submittedValues.sales_unit
            ) : null
            
            if (newTask) {
              // 任务确实创建成功了
              message.success('任务创建成功')
              setCreateModalVisible(false)
              form.resetFields()
              lastSubmittedValuesRef.current = null
            } else {
              // 任务没有创建成功，显示错误
              message.error('网络错误，请检查网络连接。如果任务未创建成功，请重试。')
            }
          } catch (refreshError) {
            // 刷新失败，显示原始错误
            message.error('网络错误，请检查网络连接')
          }
        }, 500)
      } else {
        // 其他错误（如400、401等），直接显示错误信息
        message.error(extractErrorMessage(error, '创建失败'))
        lastSubmittedValuesRef.current = null
      }
    },
  })

  const updateMutation = useMutation(
    (data: { id: number; values: any }) => taskService.updateTask(data.id, data.values),
    {
      onSuccess: () => {
        // 检查是否为已确认后的修改
        const isPostConfirmed = editingTask && (
          editingTask.status === TaskStatus.CONFIRMED || 
          editingTask.status === TaskStatus.DETAIL_SUBMITTED || 
          editingTask.status === TaskStatus.DISPATCHED
        )
        
        if (isPostConfirmed) {
          message.success('任务修改成功，已回退到待确认状态，等待总管重新审批')
        } else {
          message.success('任务更新成功')
        }
        
        setEditModalVisible(false)
        setEditingTask(null)
        editForm.resetFields()
        queryClient.refetchQueries(['tasks', pagination.page, pagination.page_size, taskNameFilter, salesUnitFilter, statusFilter])
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  const submitMutation = useMutation(taskService.submitTask, {
    onSuccess: () => {
      message.success('任务发起成功，已发送到总管审批')
      queryClient.refetchQueries(['tasks', pagination.page, pagination.page_size, taskNameFilter, salesUnitFilter, statusFilter])
    },
    onError: (error: any) => {
      message.error(extractErrorMessage(error, '发起失败'))
    },
  })

  const revokeMutation = useMutation(taskService.revokeTask, {
    onSuccess: () => {
      message.success('任务撤回成功，已重置为草稿状态')
      queryClient.refetchQueries(['tasks', pagination.page, pagination.page_size, taskNameFilter, salesUnitFilter, statusFilter])
      queryClient.invalidateQueries('notificationUnreadCount')
      queryClient.invalidateQueries('notificationsRecent')
    },
    onError: (error: any) => {
      message.error(extractErrorMessage(error, '撤回失败'))
    },
  })

  const deleteMutation = useMutation(taskService.deleteTask, {
    onSuccess: () => {
      message.success('任务删除成功')
      queryClient.refetchQueries(['tasks', pagination.page, pagination.page_size, taskNameFilter, salesUnitFilter, statusFilter])
    },
    onError: (error: any) => {
      message.error(extractErrorMessage(error, '删除失败'))
    },
  })

  const handleCreate = (values: any) => {
    // 将多选的销售单位数组转换为逗号分隔的字符串
    const salesUnitStr = Array.isArray(values.sales_unit) 
      ? values.sales_unit.join(',') 
      : values.sales_unit
    
    // 保存表单值，用于错误处理时检查任务是否创建成功
    lastSubmittedValuesRef.current = {
      task_name: values.task_name,
      sales_unit: salesUnitStr,
    }
    createMutation.mutate({
      ...values,
      sales_unit: salesUnitStr,
      start_date: values.date_range[0].format('YYYY-MM-DD'),
      end_date: values.date_range[1].format('YYYY-MM-DD'),
      date_range: undefined,
    })
  }

  const handleEdit = (task: Task) => {
    setEditingTask(task)
    // 检查是否为已确认后的修改（当前未使用，但保留用于未来可能的逻辑）
    // const isPostConfirmed = task.status === TaskStatus.CONFIRMED || 
    //                        task.status === TaskStatus.DETAIL_SUBMITTED || 
    //                        task.status === TaskStatus.DISPATCHED
    
    editForm.setFieldsValue({
      task_name: task.task_name,
      sales_unit: task.sales_unit.split(','),
      date_range: [dayjs(task.start_date), dayjs(task.end_date)],
      fde_count: task.fde_count,
    })
    setEditModalVisible(true)
  }

  const handleUpdate = (values: any) => {
    if (!editingTask) return
    
    // 检查是否为已确认后的修改
    const isPostConfirmed = editingTask.status === TaskStatus.CONFIRMED || 
                           editingTask.status === TaskStatus.DETAIL_SUBMITTED || 
                           editingTask.status === TaskStatus.DISPATCHED
    
    // 如果是已确认后的修改，验证不能修改任务名称和时间段
    if (isPostConfirmed) {
      const originalTaskName = editingTask.task_name
      const originalStartDate = dayjs(editingTask.start_date).format('YYYY-MM-DD')
      const originalEndDate = dayjs(editingTask.end_date).format('YYYY-MM-DD')
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
    
    updateMutation.mutate({
      id: editingTask.id,
      values: {
        ...values,
        sales_unit: salesUnitStr,
        start_date: values.date_range[0].format('YYYY-MM-DD'),
        end_date: values.date_range[1].format('YYYY-MM-DD'),
        date_range: undefined,
      },
    })
  }

  const handleSubmit = (taskId: number) => {
    Modal.confirm({
      title: '确认发起任务',
      content: '发起后任务将发送到总管审批，是否确认发起？',
      onOk: () => {
        submitMutation.mutate(taskId)
      },
    })
  }

  const handleRevoke = (record: Task) => {
    const statusText = record.status === TaskStatus.PENDING ? '待确认' : '已确认'
    Modal.confirm({
      title: '确认撤回任务',
      content: (
        <div>
          <p>确定要撤回此任务吗？撤回后：</p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li>任务状态将重置为「草稿」</li>
            <li>总管将收到撤回通知</li>
            {record.status === TaskStatus.CONFIRMED && (
              <li style={{ color: '#ff4d4f' }}>
                <strong>注意：</strong>任务当前状态为「{statusText}」，撤回后将清空审批信息
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

  const handleDelete = (record: Task) => {
    Modal.confirm({
      title: '确认删除任务',
      content: (
        <div>
          <p>确定要删除此任务吗？删除后：</p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li>任务将被永久删除，无法恢复</li>
            <li style={{ color: '#ff4d4f' }}>
              <strong>注意：</strong>如果任务存在关联数据（详细需求、工单、线索等），将无法删除
            </li>
          </ul>
        </div>
      ),
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteMutation.mutate(record.id)
      },
    })
  }

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'task_name',
      key: 'task_name',
      width: 180,
      ellipsis: true,
    },
    {
      title: '销售单位',
      dataIndex: 'sales_unit',
      key: 'sales_unit',
      width: 300,
      render: (salesUnit: string) => (
        <Space wrap size={[4, 4]}>
          {salesUnit?.split(',').map((unit: string, index: number) => (
            <Tag key={index} style={{ margin: 0 }}>{unit.trim()}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '时间段',
      key: 'date_range',
      width: 240,
      render: (_: any, record: Task) => (
        <span>
          {dayjs(record.start_date).format('YYYY-MM-DD')} ~ {dayjs(record.end_date).format('YYYY-MM-DD')}
        </span>
      ),
    },
    {
      title: 'FDE人数',
      dataIndex: 'fde_count',
      key: 'fde_count',
      width: 100,
      align: 'center' as const,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center' as const,
      render: (status: string) => (
        <Tag color={TaskStatusColors[status as TaskStatus]}>
          {TaskStatusLabels[status as TaskStatus] || status}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'center' as const,
      fixed: 'right' as const,
      render: (_: any, record: Task) => {
        const isDraft = record.status === TaskStatus.DRAFT
        const isPending = record.status === TaskStatus.PENDING
        const isConfirmed = record.status === TaskStatus.CONFIRMED
        const isCreator = user?.id === record.initiator_id

        // 基础菜单：查看详情（所有角色都可见）
        const menuItems: MenuProps['items'] = [
          {
            key: 'view',
            label: '查看详情',
            onClick: () => {
              const params = new URLSearchParams(searchParams)
              navigate(`/tasks/${record.id}?${params.toString()}`)
            },
          },
        ]

        const canEditAndSubmit =
          (currentRole?.role === 'task_initiator' || currentRole?.role === 'sales_contact') &&
          isDraft &&
          isCreator

        // 已确认及之后：仅专项任务发起人可「修改任务」；销售单位接口人可在草稿阶段修改以便发起，但不得修改已发布任务
        const canEditConfirmedPhase =
          currentRole?.role === 'task_initiator' &&
          isCreator &&
          (isConfirmed || record.status === TaskStatus.DETAIL_SUBMITTED || record.status === TaskStatus.DISPATCHED)

        if (canEditAndSubmit) {
          menuItems.push({
            key: 'edit',
            label: '修改',
            disabled: !canEditAndSubmit,
            onClick: () => canEditAndSubmit && handleEdit(record),
          } as NonNullable<MenuProps['items']>[number])

          menuItems.push({
            key: 'submit',
            label: '发起',
            disabled: !canEditAndSubmit,
            onClick: () => canEditAndSubmit && handleSubmit(record.id),
          } as NonNullable<MenuProps['items']>[number])
        } else if (canEditConfirmedPhase) {
          menuItems.push({
            key: 'edit',
            label: '修改',
            onClick: () => handleEdit(record),
          } as NonNullable<MenuProps['items']>[number])
        }

        // 撤回任务（仅创建者，且状态为 PENDING 或 CONFIRMED）
        const canRevoke =
          (currentRole?.role === 'task_initiator' || currentRole?.role === 'sales_contact') &&
          isCreator &&
          (isPending || isConfirmed)

        if (canRevoke) {
          menuItems.push({
            key: 'revoke',
            label: '撤回',
            disabled: !canRevoke,
            danger: true,
            onClick: () => canRevoke && handleRevoke(record),
          } as NonNullable<MenuProps['items']>[number])
        }

        // 删除任务（仅创建者，且状态为草稿）
        const canDelete =
          (currentRole?.role === 'task_initiator' || currentRole?.role === 'sales_contact') &&
          isDraft &&
          isCreator

        if (canDelete) {
          menuItems.push({
            key: 'delete',
            label: '删除',
            disabled: !canDelete,
            danger: true,
            onClick: () => canDelete && handleDelete(record),
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

  const handleTableChange = (page: number, pageSize: number) => {
    setPagination({ page, page_size: pageSize })
    // 更新 URL 参数以保持分页状态
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', page.toString())
    newParams.set('page_size', pageSize.toString())
    setSearchParams(newParams, { replace: true })
  }

  const handleSearch = (values: any) => {
    setTaskNameFilter(values.task_name || '')
    setSalesUnitFilter(values.sales_unit || '')
    setStatusFilter(values.status)
    setPagination({ page: 1, page_size: pagination.page_size })
    // 更新 URL 参数，搜索时重置到第一页
    const newParams = new URLSearchParams()
    if (values.task_name) newParams.set('task_name', values.task_name)
    if (values.sales_unit) newParams.set('sales_unit', values.sales_unit)
    if (values.status) newParams.set('status', values.status)
    newParams.set('page', '1')
    newParams.set('page_size', pagination.page_size.toString())
    setSearchParams(newParams, { replace: true })
  }

  return (
    <div style={{ width: '100%', overflow: 'hidden' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <Title level={3} style={{ margin: 0 }}>任务管理</Title>
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
                      await exportService.exportTasksExcel()
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
                      await exportService.exportTasksPdf()
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
          {(currentRole?.role === 'task_initiator' || currentRole?.role === 'sales_contact') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              创建任务
            </Button>
          )}
        </Space>
      </div>

      {/* 搜索和筛选 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Form
          form={searchForm}
          layout="inline"
          onFinish={handleSearch}
          style={{ flex: 1 }}
        >
          <Form.Item name="task_name">
            <Input
              placeholder="搜索任务名称"
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item name="sales_unit">
            <Input
              placeholder="搜索销售单位"
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态筛选" allowClear style={{ width: 150 }}>
              {Object.entries(TaskStatusLabels)
                .filter(([value]) => value !== TaskStatus.DETAIL_SUBMITTED) // 删除"详细需求已提交"选项
                .map(([value, label]) => (
                  <Select.Option key={value} value={value}>
                    {label}
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>
        </Form>
        <Button type="primary" onClick={() => searchForm.submit()} icon={<SearchOutlined />}>
          搜索
        </Button>
      </div>

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
        dataSource={tasks}
        loading={isLoading}
        rowKey="id"
        scroll={{ x: 1000 }}
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
              description="暂无数据，请先创建任务"
              showCreateButton={currentRole?.role === 'task_initiator' || currentRole?.role === 'sales_contact'}
              onCreateClick={() => setCreateModalVisible(true)}
              createButtonText="创建任务"
            />
          ),
        }}
      />

      <Modal
        title="创建任务"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isLoading}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="task_name" label="任务名称" rules={[{ required: true }]}>
            <Input />
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
                // 处理"全部"与其他选项的互斥逻辑
                if (Array.isArray(value)) {
                  const hasAll = value.includes('全部')
                  const otherValues = value.filter(v => v !== '全部')
                  
                  if (hasAll && otherValues.length > 0) {
                    // 如果选择了"全部"且还有其他选项，只保留"全部"，清除其他选项
                    form.setFieldsValue({ sales_unit: ['全部'] })
                    message.info('选择"全部"后，已自动清除其他销售单位')
                  }
                  // 其他情况（只选择"全部"、只选择其他选项、清空）保持原样，不需要额外处理
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
          <Form.Item name="date_range" label="任务时间段" rules={[{ required: true }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="fde_count" label="FDE支撑人员数量" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          </Form>
      </Modal>

      {/* 修改任务Modal */}
      <Modal
        title="修改任务"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false)
          setEditingTask(null)
          editForm.resetFields()
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isLoading}
        width={600}
      >
        {editingTask && (editingTask.status === TaskStatus.CONFIRMED || 
                         editingTask.status === TaskStatus.DETAIL_SUBMITTED || 
                         editingTask.status === TaskStatus.DISPATCHED) && (
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
          {editingTask && (editingTask.status === TaskStatus.CONFIRMED || 
                           editingTask.status === TaskStatus.DETAIL_SUBMITTED || 
                           editingTask.status === TaskStatus.DISPATCHED) && (
            <Form.Item
              name="modify_reason"
              label="修改原因"
              rules={[{ required: true, message: '请填写本次修改原因' }]}
            >
              <Input.TextArea rows={3} maxLength={200} showCount />
            </Form.Item>
          )}
          <Form.Item 
            name="task_name" 
            label="任务名称" 
            rules={[{ required: true }]}
            {...(editingTask && (editingTask.status === TaskStatus.CONFIRMED || 
                                 editingTask.status === TaskStatus.DETAIL_SUBMITTED || 
                                 editingTask.status === TaskStatus.DISPATCHED) 
              ? { 
                  help: '已确认后的任务不能修改任务名称',
                  validateStatus: 'error' as const
                } 
              : {})}
          >
            <Input 
              disabled={!!(editingTask && (editingTask.status === TaskStatus.CONFIRMED || 
                                          editingTask.status === TaskStatus.DETAIL_SUBMITTED || 
                                          editingTask.status === TaskStatus.DISPATCHED))} 
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
                // 处理"全部"与其他选项的互斥逻辑
                if (Array.isArray(value)) {
                  const hasAll = value.includes('全部')
                  const otherValues = value.filter(v => v !== '全部')
                  
                  if (hasAll && otherValues.length > 0) {
                    // 如果选择了"全部"且还有其他选项，只保留"全部"，清除其他选项
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
            {...(editingTask && (editingTask.status === TaskStatus.CONFIRMED || 
                                 editingTask.status === TaskStatus.DETAIL_SUBMITTED || 
                                 editingTask.status === TaskStatus.DISPATCHED) 
              ? { 
                  help: '已确认后的任务不能修改时间段',
                  validateStatus: 'error' as const
                } 
              : {})}
          >
            <RangePicker 
              style={{ width: '100%' }}
              disabled={!!(editingTask && (editingTask.status === TaskStatus.CONFIRMED || 
                                          editingTask.status === TaskStatus.DETAIL_SUBMITTED || 
                                          editingTask.status === TaskStatus.DISPATCHED))} 
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

export default TaskList

