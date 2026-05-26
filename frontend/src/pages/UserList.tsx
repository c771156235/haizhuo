/**
 * 用户列表页面
 */
import { useState, useEffect } from 'react'
import type { JSX } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Table, Tag, Button, Space, message, Popconfirm, Form, Input, Select, Alert, Tooltip, Modal, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, KeyOutlined, CheckOutlined, StopOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { userService, User } from '../services/user'
import { useAuth } from '../contexts/AuthContext'
import { UserRoleLabels, ApprovalStatusLabels } from '../types/user'
import EmptyState from '../components/EmptyState'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'

const { Title } = Typography

const UserList = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchForm] = Form.useForm<{
    search?: string
    role?: string
    approval_status?: string
  }>()
  
  // 从 URL 参数读取筛选条件和分页
  const urlApprovalStatus = searchParams.get('approval_status') || undefined
  const urlRole = searchParams.get('role') || undefined
  const urlSearch = searchParams.get('search') || undefined
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
  const urlPageSize = searchParams.get('page_size') ? parseInt(searchParams.get('page_size')!, 10) : 10
  
  const [searchText, setSearchText] = useState(urlSearch || '')
  const [roleFilter, setRoleFilter] = useState<string | undefined>(urlRole)
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<string | undefined>(urlApprovalStatus)
  const [pagination, setPagination] = useState({ page: urlPage, page_size: urlPageSize })
  
  // 当 URL 变化时，与地址栏保持同步（含清空筛选、浏览器前进后退）
  useEffect(() => {
    setSearchText(urlSearch || '')
    setRoleFilter(urlRole)
    setApprovalStatusFilter(urlApprovalStatus)
    setPagination({ page: urlPage, page_size: urlPageSize })
    searchForm.setFieldsValue({
      search: urlSearch || undefined,
      role: urlRole,
      approval_status: urlApprovalStatus,
    })
  }, [urlApprovalStatus, urlRole, urlSearch, urlPage, urlPageSize, searchForm])

  const { data: usersData, isLoading, error } = useQuery(
    ['users', pagination.page, pagination.page_size, searchText, roleFilter, approvalStatusFilter],
    () => userService.getUsers({
      page: pagination.page,
      page_size: pagination.page_size,
      search: searchText || undefined,
      role: roleFilter,
      approval_status: approvalStatusFilter,
    })
  )

  const users = usersData?.items || []
  const total = usersData?.total || 0

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
    role?: string
    approval_status?: string
  }): void => {
    setSearchText(values.search || '')
    setRoleFilter(values.role)
    setApprovalStatusFilter(values.approval_status)
    setPagination({ page: 1, page_size: pagination.page_size })
    // 更新 URL 参数，搜索时重置到第一页
    const newParams = new URLSearchParams()
    if (values.search) newParams.set('search', values.search)
    if (values.role) newParams.set('role', values.role)
    if (values.approval_status) newParams.set('approval_status', values.approval_status)
    newParams.set('page', '1')
    newParams.set('page_size', pagination.page_size.toString())
    setSearchParams(newParams, { replace: true })
  }

  const deleteMutation = useMutation((id: number) => userService.deleteUser(id), {
    onSuccess: () => {
      message.success('用户已删除')
      // 使用 refetchQueries 保持当前分页状态
      queryClient.refetchQueries(['users', pagination.page, pagination.page_size, searchText, roleFilter, approvalStatusFilter])
    },
    onError: (error: any) => {
      message.error(extractErrorMessage(error, '删除失败'))
    },
  })

  const resetPasswordMutation = useMutation((id: number) => userService.resetPassword(id), {
    onSuccess: () => {
      message.success('密码已重置为默认密码：ijnbgyb#)12')
      // 使用 refetchQueries 保持当前分页状态
      queryClient.refetchQueries(['users', pagination.page, pagination.page_size, searchText, roleFilter, approvalStatusFilter])
    },
    onError: (error: any) => {
      message.error(extractErrorMessage(error, '重置密码失败'))
    },
  })

  const toggleStatusMutation = useMutation(
    ({ id, isActive }: { id: number; isActive: boolean }) => 
      userService.updateUser(id, { is_active: !isActive }),
    {
      onSuccess: (_, variables) => {
        message.success(variables.isActive ? '用户已禁用' : '用户已启用')
        // 使用 refetchQueries 保持当前分页状态
        queryClient.refetchQueries(['users', pagination.page, pagination.page_size, searchText, roleFilter, approvalStatusFilter])
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '操作失败'))
      },
    }
  )

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id)
  }

  const handleResetPassword = (id: number) => {
    resetPasswordMutation.mutate(id)
  }

  const handleToggleStatus = (id: number, isActive: boolean) => {
    toggleStatusMutation.mutate({ id, isActive })
  }

  const approveMutation = useMutation(
    ({ id, action, rejectionReason }: { id: number; action: 'approve' | 'reject'; rejectionReason?: string }) =>
      userService.approveUser(id, { action, rejection_reason: rejectionReason }),
    {
      onSuccess: (_, variables) => {
        message.success(variables.action === 'approve' ? '用户审核通过' : '用户审核已拒绝')
        // 使用 refetchQueries 保持当前分页状态
        queryClient.refetchQueries(['users', pagination.page, pagination.page_size, searchText, roleFilter, approvalStatusFilter])
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '操作失败'))
      },
    }
  )

  const handleApprove = (id: number) => {
    approveMutation.mutate({ id, action: 'approve' })
  }

  const handleReject = (id: number) => {
    Modal.confirm({
      title: '拒绝用户申请',
      content: (
        <div style={{ marginTop: 16 }}>
          <Input.TextArea
            id="rejection-reason"
            placeholder="请输入拒绝原因"
            rows={4}
            maxLength={500}
            showCount
          />
        </div>
      ),
      okText: '确定拒绝',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        const reason = (document.getElementById('rejection-reason') as HTMLTextAreaElement)?.value
        if (!reason || reason.trim() === '') {
          message.error('请输入拒绝原因')
          return Promise.reject()
        }
        approveMutation.mutate({ id, action: 'reject', rejectionReason: reason })
      },
    })
  }

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      fixed: 'left' as const,
    },
    {
      title: '真实姓名',
      dataIndex: 'real_name',
      key: 'real_name',
      width: 120,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 180,
      ellipsis: true,
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      width: 300,
      minWidth: 200,
      render: (roles: any[], record: User) => {
        // 如果有roles数组，显示所有角色
        const userRoles = (record as any).roles || roles || []
        if (userRoles && userRoles.length > 0) {
          return (
            <Space size={[4, 4]} wrap>
              {userRoles.map((r: any, index: number) => {
                // 处理不同的数据结构
                const roleValue = typeof r === 'string' ? r : (r.role || r)
                const isPending = r?.approval_status === 'pending'
                const isRejected = r?.approval_status === 'rejected'
                
                return (
                  <Tag 
                    key={index}
                    color={
                      roleValue === 'manager' ? 'red' : 
                      isPending ? 'orange' : 
                      isRejected ? 'red' : 
                      'blue'
                    }
                    style={{ 
                      opacity: isRejected ? 0.6 : 1,
                      textDecoration: isRejected ? 'line-through' : 'none'
                    }}
                  >
                    {UserRoleLabels[roleValue as keyof typeof UserRoleLabels] || roleValue}
                    {isPending && ' (待审核)'}
                    {isRejected && ' (已拒绝)'}
                  </Tag>
                )
              })}
            </Space>
          )
        }
        // 向后兼容：如果没有roles数组，使用role字段
        const role = record.role
        if (role) {
          return (
            <Tag color={role === 'manager' ? 'red' : 'blue'}>
              {UserRoleLabels[role as keyof typeof UserRoleLabels] || role}
            </Tag>
          )
        }
        return '-'
      },
    },
    {
      title: '所属部门',
      dataIndex: 'sales_unit',
      key: 'sales_unit',
      width: 150,
      ellipsis: true,
    },
    {
      title: '审核状态',
      dataIndex: 'approval_status',
      key: 'approval_status',
      width: 150,
      render: (status: string, record: User) => {
        // 检查是否有待审核的角色
        const roles = (record as any).roles || []
        const pendingRoles = roles.filter((r: any) => r.approval_status === 'pending')
        const rejectedRoles = roles.filter((r: any) => r.approval_status === 'rejected')
        const approvedRoles = roles.filter((r: any) => r.approval_status === 'approved')
        
        // 如果有待审核的角色，显示待审核状态
        if (pendingRoles.length > 0) {
          return (
            <Tag color="orange">
              待审核 ({pendingRoles.length}个角色)
            </Tag>
          )
        }
        
        // 如果有已拒绝的角色，显示已拒绝状态
        if (rejectedRoles.length > 0 && approvedRoles.length === 0) {
          return (
            <Tag color="red">
              已拒绝 ({rejectedRoles.length}个角色)
            </Tag>
          )
        }
        
        // 向后兼容：使用原有的status字段
        if (!status || status === 'approved') {
          return (
            <Tag color={record.is_active ? 'green' : 'default'}>
              {record.is_active ? '活跃' : '已禁用'}
            </Tag>
          )
        }
        const statusColor = {
          pending: 'orange',
          approved: 'green',
          rejected: 'red',
        }[status] || 'default'
        return (
          <Tag color={statusColor}>
            {ApprovalStatusLabels[status as keyof typeof ApprovalStatusLabels] || status}
          </Tag>
        )
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: any, record: User) => {
        // 检查是否有待审核的角色
        const roles = (record as any).roles || []
        const pendingRoles = roles.filter((r: any) => r.approval_status === 'pending')
        const hasPendingRoles = pendingRoles.length > 0
        
        // 如果有待审核的角色，显示审核按钮
        if (hasPendingRoles || record.approval_status === 'pending') {
          const roleNames = pendingRoles.map((r: any) => 
            UserRoleLabels[r.role as keyof typeof UserRoleLabels] || r.role
          ).join('、')
          
          return (
            <Space size={4} style={{ justifyContent: 'center', width: '100%' }}>
              <Tooltip title={`审核通过（${pendingRoles.length}个角色：${roleNames}）`}>
                <Popconfirm
                  title={
                    <div>
                      <div>确定要通过该用户的审核吗？</div>
                      {pendingRoles.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                          待审核角色：{roleNames}
                        </div>
                      )}
                    </div>
                  }
                  onConfirm={() => handleApprove(record.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button type="text" size="small" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }} />
                </Popconfirm>
              </Tooltip>
              <Tooltip title={`审核拒绝（${pendingRoles.length}个角色：${roleNames}）`}>
                <Button 
                  type="text" 
                  size="small" 
                  danger 
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleReject(record.id)}
                />
              </Tooltip>
            </Space>
          )
        }
        
        // 已审核通过的用户显示常规操作
        return (
          <Space size={4} style={{ justifyContent: 'center', width: '100%' }}>
            <Tooltip title="编辑">
              <Button 
                type="text" 
                size="small"
                icon={<EditOutlined />} 
                onClick={() => {
                  // 保存当前分页状态到 URL 参数
                  const newParams = new URLSearchParams(searchParams)
                  newParams.set('page', pagination.page.toString())
                  newParams.set('page_size', pagination.page_size.toString())
                  navigate(`/users/${record.id}/edit?${newParams.toString()}`)
                }}
              />
            </Tooltip>
            <Tooltip title="重置密码">
              <Popconfirm
                title="确定要重置该用户的密码吗？"
                description="密码将重置为默认密码：ijnbgyb#)12"
                onConfirm={() => handleResetPassword(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="text" size="small" icon={<KeyOutlined />} />
              </Popconfirm>
            </Tooltip>
            {record.id !== user?.id && (
              <>
                {record.is_active ? (
                  <Tooltip title="禁用">
                    <Popconfirm
                      title="确定要禁用该用户吗？"
                      onConfirm={() => handleToggleStatus(record.id, record.is_active)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button type="text" size="small" danger icon={<StopOutlined />} />
                    </Popconfirm>
                  </Tooltip>
                ) : (
                  <Tooltip title="启用">
                    <Popconfirm
                      title="确定要启用该用户吗？"
                      onConfirm={() => handleToggleStatus(record.id, record.is_active)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button type="text" size="small" icon={<CheckOutlined />} />
                    </Popconfirm>
                  </Tooltip>
                )}
                <Tooltip title="删除">
                  <Popconfirm
                    title="确定要删除该用户吗？"
                    description="删除后无法恢复，请谨慎操作！"
                    onConfirm={() => handleDelete(record.id)}
                    okText="确定"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Tooltip>
              </>
            )}
          </Space>
        )
      },
    },
  ]

  // 只有总管可以管理用户
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  if (currentRole?.role !== 'manager') {
    return <div>无权访问</div> as JSX.Element
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Title level={3} style={{ margin: 0 }}>用户管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/users/create')}>
          创建用户
        </Button>
      </div>

      {/* 搜索和筛选 */}
      {(
          <div style={{marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
        <Form
          form={searchForm}
          layout="inline"
          onFinish={handleSearch}
          style={{ flex: 1 }}
        >
          <Form.Item name="search">
            <Input
              placeholder="搜索用户名或真实姓名"
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 250 }}
            />
          </Form.Item>
          <Form.Item name="role">
            <Select placeholder="角色筛选" allowClear style={{ width: 150 }}>
              {Object.entries(UserRoleLabels).map(([value, label]) => (
                <Select.Option key={value} value={value}>
                  {label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="approval_status">
            <Select placeholder="审核状态" allowClear style={{ width: 150 }}>
              {Object.entries(ApprovalStatusLabels).map(([value, label]) => (
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
        dataSource={users}
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
              description="暂无用户数据"
              showCreateButton={true}
              onCreateClick={() => navigate('/users/create')}
              createButtonText="创建用户"
            />
          ),
        }}
      />
    </div>
  )
}

export default UserList

